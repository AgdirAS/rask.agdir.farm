"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { VhostLimit, Vhost } from "@/lib/types";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useSetHeaderActions } from "@/components/layout/header-actions-context";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtLimit(v: number | undefined): string {
  if (v === undefined || v === -1) return "∞";
  return String(v);
}

// ── drawer ────────────────────────────────────────────────────────────────────

interface VhostLimitDrawerProps {
  vhosts: string[];
  editing: VhostLimit | null;
  onClose: () => void;
  onSaved: () => void;
}

function VhostLimitDrawer({ vhosts, editing, onClose, onSaved }: VhostLimitDrawerProps) {
  const [vhost, setVhost] = useState(editing?.vhost ?? (vhosts[0] ?? ""));
  const [maxConn, setMaxConn] = useState(
    editing?.value["max-connections"] !== undefined ? String(editing.value["max-connections"]) : "",
  );
  const [maxQueues, setMaxQueues] = useState(
    editing?.value["max-queues"] !== undefined ? String(editing.value["max-queues"]) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!vhost) { setError("Select a vhost"); return; }
    setSaving(true);
    setError("");
    try {
      const calls: Promise<Response>[] = [];
      if (maxConn !== "") {
        calls.push(fetch(
          `/api/rabbitmq/vhost-limits/${encodeURIComponent(vhost)}/max-connections`,
          { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: Number(maxConn) }) },
        ));
      }
      if (maxQueues !== "") {
        calls.push(fetch(
          `/api/rabbitmq/vhost-limits/${encodeURIComponent(vhost)}/max-queues`,
          { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: Number(maxQueues) }) },
        ));
      }
      if (calls.length === 0) { setError("Enter at least one limit value"); setSaving(false); return; }
      const results = await Promise.all(calls);
      for (const res of results) {
        const json = (await res.json()) as { error?: string };
        if (json.error) throw new Error(json.error);
      }
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
      <div className="fixed inset-y-0 right-0 z-50 w-[400px] max-w-full bg-background border-l shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">{editing ? "Edit Vhost Limit" : "Add Vhost Limit"}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Virtual Host</label>
            <Select value={vhost} onValueChange={(v) => setVhost(v)} disabled={!!editing}>
              <SelectTrigger className="w-auto">
                <SelectValue placeholder="Select vhost…" />
              </SelectTrigger>
              <SelectContent>
                {vhosts.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Max Connections</label>
            <input
              type="number"
              value={maxConn}
              onChange={(e) => setMaxConn(e.target.value)}
              placeholder="-1 for unlimited"
              className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[11px] text-muted-foreground">Use -1 for unlimited. Leave blank to skip.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Max Queues</label>
            <input
              type="number"
              value={maxQueues}
              onChange={(e) => setMaxQueues(e.target.value)}
              placeholder="-1 for unlimited"
              className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[11px] text-muted-foreground">Use -1 for unlimited. Leave blank to skip.</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="border-t p-4 flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Limit"}
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

export default function LimitsPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<VhostLimit | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  function openAdd() { setEditing(null); setDrawerOpen(true); }

  useSetHeaderActions(
    <Button size="sm" onClick={openAdd} className="gap-1.5">
      <Plus className="h-3.5 w-3.5" /> Add Limit
    </Button>,
  );

  const { data: limits, isError, error } = useQuery<VhostLimit[]>({
    queryKey: ["vhost-limits"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/vhost-limits");
      const json = (await res.json()) as { data?: VhostLimit[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
  });

  const { data: vhostList } = useQuery<Vhost[]>({
    queryKey: ["vhosts"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/vhosts");
      const json = (await res.json()) as { data?: Vhost[]; error?: string };
      return json.data ?? [];
    },
  });

  const vhostNames = useMemo(
    () => vhostList?.map((v) => v.name).sort() ?? [],
    [vhostList],
  );

  async function handleDelete(limit: VhostLimit) {
    setDeleting(limit.vhost);
    try {
      const names: string[] = [];
      if (limit.value["max-connections"] !== undefined) names.push("max-connections");
      if (limit.value["max-queues"] !== undefined) names.push("max-queues");
      await Promise.all(
        names.map((n) =>
          fetch(`/api/rabbitmq/vhost-limits/${encodeURIComponent(limit.vhost)}/${n}`, { method: "DELETE" }),
        ),
      );
      await queryClient.invalidateQueries({ queryKey: ["vhost-limits"] });
    } finally {
      setDeleting(null);
    }
  }

  function openEdit(limit: VhostLimit) { setEditing(limit); setDrawerOpen(true); }

  return (
    <div className="flex flex-col h-full">
      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isError && (
          <div className="m-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load vhost limits"}
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2 text-left font-medium">Virtual Host</th>
              <th className="px-5 py-2 text-left font-medium">Max Connections</th>
              <th className="px-5 py-2 text-left font-medium">Max Queues</th>
              <th className="px-5 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!limits ? (
              <tr><td colSpan={4} className="px-5 py-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : limits.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center">
                  <p className="text-muted-foreground font-medium">No limits configured</p>
                  <p className="text-muted-foreground text-xs mt-1 max-w-sm mx-auto">
                    Consider setting limits per vhost to protect the broker in production.
                  </p>
                </td>
              </tr>
            ) : (
              limits.map((limit) => (
                <tr key={limit.vhost} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3 font-mono font-medium">{limit.vhost}</td>
                  <td className="px-5 py-3">{fmtLimit(limit.value["max-connections"])}</td>
                  <td className="px-5 py-3">{fmtLimit(limit.value["max-queues"])}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(limit)}
                        className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-primary transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                          <path d="M11.5 2.5L13.5 4.5L5.5 12.5H3.5V10.5L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(limit)}
                        disabled={deleting === limit.vhost}
                        className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                          <path d="M3 5h10M6 5V3h4v2M7 8v4M9 8v4M4 5l1 9h6l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {drawerOpen && (
        <VhostLimitDrawer
          vhosts={vhostNames.length > 0 ? vhostNames : ["/"]}
          editing={editing}
          onClose={() => setDrawerOpen(false)}
          onSaved={async () => {
            setDrawerOpen(false);
            await queryClient.invalidateQueries({ queryKey: ["vhost-limits"] });
          }}
        />
      )}
    </div>
  );
}
