"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { GlobalParameter } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useSetHeaderActions } from "@/components/layout/header-actions-context";
import { DataTable, type DataTableColumn } from "@/components/data-table";

// ── helpers ───────────────────────────────────────────────────────────────────

function safeJsonStringify(v: unknown): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

// ── drawer ────────────────────────────────────────────────────────────────────

interface GlobalParamDrawerProps {
  editing: GlobalParameter | null;
  onClose: () => void;
  onSaved: () => void;
}

function GlobalParamDrawer({ editing, onClose, onSaved }: GlobalParamDrawerProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [component, setComponent] = useState(editing?.component ?? "");
  const [valueStr, setValueStr] = useState(editing !== null ? safeJsonStringify(editing.value) : "");
  const [jsonError, setJsonError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function validateJson(s: string): boolean {
    try { JSON.parse(s); setJsonError(""); return true; }
    catch (e) { setJsonError(e instanceof Error ? e.message : "Invalid JSON"); return false; }
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    if (!validateJson(valueStr)) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/rabbitmq/global-parameters/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: JSON.parse(valueStr), component }),
      });
      const json = (await res.json()) as { error?: string };
      if (json.error) throw new Error(json.error);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-[480px] max-w-full bg-background border-l shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">{editing ? "Edit Parameter" : "Add Global Parameter"}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!editing}
              placeholder="e.g. cluster_name"
              className="w-full px-3 py-2 bg-background border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Component</label>
            <input
              type="text"
              value={component}
              onChange={(e) => setComponent(e.target.value)}
              placeholder="e.g. rabbit"
              className="w-full px-3 py-2 bg-background border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Value (JSON)</label>
            <textarea
              value={valueStr}
              onChange={(e) => { setValueStr(e.target.value); if (jsonError) validateJson(e.target.value); }}
              onBlur={() => validateJson(valueStr)}
              rows={8}
              spellCheck={false}
              placeholder='"value" or {"key": "value"}'
              className={`w-full px-3 py-2 bg-background border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-y ${jsonError ? "border-destructive focus:ring-destructive" : ""}`}
            />
            {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="border-t p-4 flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Parameter"}
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function ParametersPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<GlobalParameter | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  function openAdd() { setEditing(null); setDrawerOpen(true); }

  useSetHeaderActions(
    <Button size="sm" onClick={openAdd} className="gap-1.5">
      <Plus className="h-3.5 w-3.5" /> Add Parameter
    </Button>,
  );

  const { data: params, isError, error } = useQuery<GlobalParameter[]>({
    queryKey: ["global-parameters"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/global-parameters");
      const json = (await res.json()) as { data?: GlobalParameter[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
  });

  async function handleDelete(name: string) {
    setDeleting(name);
    try {
      await fetch(`/api/rabbitmq/global-parameters/${encodeURIComponent(name)}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["global-parameters"] });
    } finally {
      setDeleting(null);
    }
  }

  function openEdit(p: GlobalParameter) { setEditing(p); setDrawerOpen(true); }

  const columns: DataTableColumn<GlobalParameter>[] = [
    {
      key: "name",
      header: "Name",
      render: (p) => <span className="font-mono font-medium">{p.name}</span>,
    },
    {
      key: "component",
      header: "Component",
      render: (p) => <span className="text-muted-foreground font-mono text-xs">{p.component || "—"}</span>,
    },
    {
      key: "value",
      header: "Value",
      render: (p) => (
        <pre className="text-xs font-mono text-muted-foreground truncate max-w-xs">{safeJsonStringify(p.value)}</pre>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <button
          onClick={(e) => { e.stopPropagation(); void handleDelete(p.name); }}
          disabled={deleting === p.name}
          className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
          title="Delete"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
            <path d="M3 5h10M6 5V3h4v2M7 8v4M9 8v4M4 5l1 9h6l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isError && (
          <div className="m-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load global parameters"}
          </div>
        )}

        <DataTable
          columns={columns}
          data={params ?? []}
          isLoading={!params}
          pageSize={0}
          onRowClick={(p) => openEdit(p)}
        />
      </div>

      {drawerOpen && (
        <GlobalParamDrawer
          editing={editing}
          onClose={() => setDrawerOpen(false)}
          onSaved={async () => {
            setDrawerOpen(false);
            await queryClient.invalidateQueries({ queryKey: ["global-parameters"] });
          }}
        />
      )}
    </div>
  );
}
