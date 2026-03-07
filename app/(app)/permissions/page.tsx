"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RabbitUser, VhostPermission, Vhost } from "@/lib/types";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useSetHeaderActions } from "@/components/layout/header-actions-context";
import { DataTable, useDataTable, type DataTableColumn } from "@/components/data-table";

// ── confirmation dialog ───────────────────────────────────────────────────────

function ConfirmDialog({
  message, onConfirm, onCancel, danger = false,
}: {
  message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-background border rounded-lg shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
        <p className="text-sm">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border rounded-md bg-background hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-md font-medium transition-colors ${danger ? "bg-destructive text-destructive-foreground hover:opacity-90" : "bg-primary text-primary-foreground hover:opacity-90"}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── permission drawer ─────────────────────────────────────────────────────────

type PermDrawerMode = { mode: "add" } | { mode: "edit"; perm: VhostPermission };

function PermissionDrawer({
  drawerMode, users, vhosts, onClose, onSaved,
}: {
  drawerMode: PermDrawerMode;
  users: RabbitUser[];
  vhosts: Vhost[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = drawerMode.mode === "edit";
  const editPerm = isEdit ? drawerMode.perm : null;

  const [selectedUser, setSelectedUser] = useState(editPerm?.user ?? "__none__");
  const [selectedVhost, setSelectedVhost] = useState(editPerm?.vhost ?? "__none__");
  const [configure, setConfigure] = useState(editPerm?.configure ?? ".*");
  const [write, setWrite] = useState(editPerm?.write ?? ".*");
  const [read, setRead] = useState(editPerm?.read ?? ".*");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setError("");
    if (!selectedUser || selectedUser === "__none__") { setError("User is required."); return; }
    if (!selectedVhost || selectedVhost === "__none__") { setError("Vhost is required."); return; }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/rabbitmq/permissions/${encodeURIComponent(selectedVhost)}/${encodeURIComponent(selectedUser)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ configure, write, read }),
        }
      );
      const json = (await res.json()) as { error?: string };
      if (json.error) throw new Error(json.error);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save permission");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full z-50 w-[400px] bg-background border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-base">{isEdit ? "Edit Permission" : "Add Permission"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold">User</label>
            <Select value={selectedUser} onValueChange={setSelectedUser} disabled={isEdit}>
              <SelectTrigger className="w-auto">
                <SelectValue placeholder="Select user…" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => <SelectItem key={u.name} value={u.name}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Virtual Host</label>
            <Select value={selectedVhost} onValueChange={setSelectedVhost} disabled={isEdit}>
              <SelectTrigger className="w-auto">
                <SelectValue placeholder="Select vhost…" />
              </SelectTrigger>
              <SelectContent>
                {vhosts.map((v) => <SelectItem key={v.name} value={v.name}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">
              Regexp patterns — <code className="font-mono">.*</code> = full access, empty = no access
            </p>

            {([
              { label: "Configure", hint: "Create/delete queues, exchanges, bindings", value: configure, onChange: setConfigure },
              { label: "Write", hint: "Publish messages, bind queues", value: write, onChange: setWrite },
              { label: "Read", hint: "Consume messages, get from queues", value: read, onChange: setRead },
            ] as const).map(({ label, hint, value, onChange }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <label className="text-xs font-semibold">{label}</label>
                  <span className="text-[10px] text-muted-foreground">{hint}</span>
                </div>
                <input
                  className="w-full px-3 py-1.5 bg-background border rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder=".*"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Permission"}
          </button>
          <button onClick={onClose} className="px-4 py-2 border text-sm font-medium rounded-md hover:bg-muted transition-colors">
            Cancel
          </button>
        </div>
      </aside>
    </>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function PermissionsPage() {
  const qc = useQueryClient();

  const [permUserFilter, setPermUserFilter] = useState("all");
  const [permVhostFilter, setPermVhostFilter] = useState("all");
  const [permDrawer, setPermDrawer] = useState<PermDrawerMode | null>(null);
  const [permDeleteConfirm, setPermDeleteConfirm] = useState<VhostPermission | null>(null);

  useSetHeaderActions(
    <button
      onClick={() => setPermDrawer({ mode: "add" })}
      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
    >
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <path d="M8 3 V13 M3 8 H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      Add Permission
    </button>
  );

  const { data: whoami } = useQuery<string>({
    queryKey: ["whoami"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/whoami");
      const json = (await res.json()) as { data?: string };
      return json.data ?? "";
    },
    staleTime: Infinity,
  });

  const { data: permissions, isLoading: permsLoading, isError: permsError } = useQuery<VhostPermission[]>({
    queryKey: ["admin-permissions"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/permissions");
      const json = (await res.json()) as { data?: VhostPermission[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 15_000,
  });

  const { data: users } = useQuery<RabbitUser[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/users");
      const json = (await res.json()) as { data?: RabbitUser[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 15_000,
  });

  const { data: vhosts } = useQuery<Vhost[]>({
    queryKey: ["vhosts"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/vhosts");
      const json = (await res.json()) as { data?: Vhost[]; error?: string };
      return json.data ?? [];
    },
    staleTime: 30_000,
  });

  // filtered permissions
  const filteredPerms = useMemo(() => {
    if (!permissions) return [];
    return permissions.filter((p) => {
      const matchUser = permUserFilter === "all" || p.user === permUserFilter;
      const matchVhost = permVhostFilter === "all" || p.vhost === permVhostFilter;
      return matchUser && matchVhost;
    });
  }, [permissions, permUserFilter, permVhostFilter]);

  const { pagedData, page, setPage, pageCount } = useDataTable({
    data: filteredPerms,
    pageSize: 10,
  });

  // unique vhosts for filter
  const permVhosts = useMemo(() => {
    return Array.from(new Set((permissions ?? []).map((p) => p.vhost))).sort();
  }, [permissions]);

  async function handleDeletePermission(perm: VhostPermission) {
    await fetch(
      `/api/rabbitmq/permissions/${encodeURIComponent(perm.vhost)}/${encodeURIComponent(perm.user)}`,
      { method: "DELETE" }
    );
    await qc.invalidateQueries({ queryKey: ["admin-permissions"] });
    setPermDeleteConfirm(null);
  }

  function onPermSaved() {
    qc.invalidateQueries({ queryKey: ["admin-permissions"] });
    setPermDrawer(null);
  }

  const columns: DataTableColumn<VhostPermission>[] = [
    {
      key: "user",
      header: "User",
      render: (perm) => (
        <div className="flex items-center gap-1.5 font-medium">
          {perm.user}
          {perm.user === whoami && (
            <span className="px-1 py-0.5 bg-muted text-muted-foreground text-[10px] rounded font-bold uppercase tracking-wider">You</span>
          )}
        </div>
      ),
    },
    {
      key: "vhost",
      header: "Vhost",
      render: (perm) => <span className="text-muted-foreground">{perm.vhost}</span>,
    },
    {
      key: "configure",
      header: "Configure",
      render: (perm) => perm.configure ? (
        <code className={`text-xs font-mono px-1.5 py-0.5 rounded ${perm.configure === ".*" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-foreground"}`}>
          {perm.configure}
        </code>
      ) : (
        <span className="text-muted-foreground/40 italic text-xs">empty</span>
      ),
    },
    {
      key: "write",
      header: "Write",
      render: (perm) => perm.write ? (
        <code className={`text-xs font-mono px-1.5 py-0.5 rounded ${perm.write === ".*" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-foreground"}`}>
          {perm.write}
        </code>
      ) : (
        <span className="text-muted-foreground/40 italic text-xs">empty</span>
      ),
    },
    {
      key: "read",
      header: "Read",
      render: (perm) => perm.read ? (
        <code className={`text-xs font-mono px-1.5 py-0.5 rounded ${perm.read === ".*" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-foreground"}`}>
          {perm.read}
        </code>
      ) : (
        <span className="text-muted-foreground/40 italic text-xs">empty</span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (perm) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setPermDeleteConfirm(perm); }}
            className="p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Delete permission"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M2 4 H14 M5 4 V2.5 H11 V4 M6 7 V12 M10 7 V12 M3 4 L4 14 H12 L13 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {permDeleteConfirm && (
        <ConfirmDialog
          danger
          message={`Remove permissions for "${permDeleteConfirm.user}" on vhost "${permDeleteConfirm.vhost}"?`}
          onConfirm={() => handleDeletePermission(permDeleteConfirm)}
          onCancel={() => setPermDeleteConfirm(null)}
        />
      )}

      {permDrawer && (
        <PermissionDrawer
          drawerMode={permDrawer}
          users={users ?? []}
          vhosts={vhosts ?? []}
          onClose={() => setPermDrawer(null)}
          onSaved={onPermSaved}
        />
      )}

      {permsError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load data. Check your RabbitMQ connection.
        </div>
      )}

      {/* filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={permUserFilter} onValueChange={(v) => { setPermUserFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">User: All</SelectItem>
            {(users ?? []).map((u) => <SelectItem key={u.name} value={u.name}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={permVhostFilter} onValueChange={(v) => { setPermVhostFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vhost: All</SelectItem>
            {permVhosts.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={pagedData}
        isLoading={permsLoading}
        onRowClick={(p) => setPermDrawer({ mode: "edit", perm: p })}
        getRowClassName={(perm) =>
          perm.configure === "" && perm.write === "" && perm.read === ""
            ? "bg-amber-50/60 dark:bg-amber-900/10"
            : ""
        }
        pageSize={10}
        page={page}
        pageCount={pageCount}
        totalCount={filteredPerms.length}
        onPageChange={setPage}
        emptyMessage="No permissions found"
      />
    </div>
  );
}
