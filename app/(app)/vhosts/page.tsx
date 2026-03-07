"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Vhost, VhostPermission } from "@/lib/types";
import {
  Plus,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  X,
  AlertTriangle,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import { useSetHeaderActions } from "@/components/layout/header-actions-context";

// ── helpers ───────────────────────────────────────────────────────────────────

const isDefault = (name: string) => name === "/";

function formatCount(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function formatRate(rate: number | undefined): string {
  if (rate === undefined || rate === 0) return "0.00/s";
  return rate.toFixed(2) + "/s";
}

function normalizeTags(tags: string[] | string | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter(Boolean);
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}

// ── cluster state dots ────────────────────────────────────────────────────────

function ClusterDots({ state }: { state: Record<string, string> | undefined }) {
  if (!state || Object.keys(state).length === 0) return <span className="text-muted-foreground/40 text-xs">—</span>;
  return (
    <div className="flex items-center gap-1">
      {Object.entries(state).map(([node, s]) => {
        const color =
          s === "running" ? "bg-green-500" :
          s === "stopped" ? "bg-red-500" :
          "bg-muted-foreground/40";
        const shortNode = node.replace(/^rabbit@/, "");
        return (
          <span
            key={node}
            className={cn("h-2 w-2 rounded-full shrink-0", color)}
            title={`${shortNode}: ${s}`}
          />
        );
      })}
    </div>
  );
}

// ── sort button ───────────────────────────────────────────────────────────────

type SortKey = "name" | "messages" | "messages_ready" | "messages_unacknowledged";

function SortButton({
  children,
  k,
  active,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  k: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  return (
    <button
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide hover:text-foreground transition-colors"
      onClick={() => onSort(k)}
    >
      {children}
      {active === k
        ? dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}

// ── skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 8 }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ── detail drawer ─────────────────────────────────────────────────────────────

interface DrawerProps {
  vhost: Vhost | null;
  onClose: () => void;
  onDeleted: () => void;
  onTracingToggled: () => void;
}

function VhostDrawer({ vhost, onClose, onDeleted, onTracingToggled }: DrawerProps) {
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [tracingBusy, setTracingBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: permissions, isLoading: permsLoading } = useQuery<VhostPermission[]>({
    queryKey: ["vhost-permissions", vhost?.name],
    queryFn: async () => {
      const res  = await fetch(`/api/rabbitmq/vhosts/${encodeURIComponent(vhost!.name)}/permissions`);
      const json = (await res.json()) as { data?: VhostPermission[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    enabled: !!vhost,
  });

  // reset state when vhost changes
  useEffect(() => {
    setDeleteInput("");
    setDeleting(false);
    setDeleteError("");
    setShowDeleteConfirm(false);
    setTracingBusy(false);
  }, [vhost?.name]);

  if (!vhost) return null;

  const isDefault_ = isDefault(vhost.name);
  const tags = normalizeTags(vhost.tags);

  async function handleDelete() {
    if (deleteInput !== vhost!.name) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/rabbitmq/vhosts/${encodeURIComponent(vhost!.name)}`, { method: "DELETE" });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.error) throw new Error(json.error);
      onDeleted();
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  async function handleTracingToggle() {
    setTracingBusy(true);
    try {
      await fetch(`/api/rabbitmq/vhosts/${encodeURIComponent(vhost!.name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracing: !vhost!.tracing }),
      });
      onTracingToggled();
    } finally {
      setTracingBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col border-l bg-background shadow-2xl">
        {/* header */}
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm font-mono">{vhost.name}</span>
              {isDefault_ && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  default
                </span>
              )}
              {vhost.tracing && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> tracing
                </span>
              )}
            </div>
            {vhost.description && (
              <p className="mt-1 text-xs text-muted-foreground">{vhost.description}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors shrink-0 ml-3">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* stats */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Messages</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Total",   value: formatCount(vhost.messages) },
                { label: "Ready",   value: formatCount(vhost.messages_ready) },
                { label: "Unacked", value: formatCount(vhost.messages_unacknowledged) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-md bg-muted/60 px-3 py-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* tags */}
          {tags.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="rounded bg-muted px-2 py-0.5 text-xs font-medium">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* cluster state */}
          {vhost.cluster_state && Object.keys(vhost.cluster_state).length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Cluster State</p>
              <div className="space-y-1.5">
                {Object.entries(vhost.cluster_state).map(([node, state]) => (
                  <div key={node} className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2">
                    <span className="text-sm font-mono truncate">{node}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          state === "running" ? "bg-green-500" :
                          state === "stopped" ? "bg-red-500" :
                          "bg-muted-foreground/40",
                        )}
                      />
                      <span className="text-xs text-muted-foreground">{state}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* permissions */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              User Permissions
            </p>
            {permsLoading ? (
              <div className="space-y-1">
                {[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : permissions && permissions.length > 0 ? (
              <div className="rounded-md border divide-y text-sm">
                <div className="grid grid-cols-4 gap-2 px-3 py-1.5 bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>User</span><span>Configure</span><span>Write</span><span>Read</span>
                </div>
                {permissions.map((p) => (
                  <div key={p.user} className="grid grid-cols-4 gap-2 px-3 py-2 items-center">
                    <span className="font-medium truncate">{p.user}</span>
                    <span className="font-mono text-[11px] text-muted-foreground truncate">{p.configure}</span>
                    <span className="font-mono text-[11px] text-muted-foreground truncate">{p.write}</span>
                    <span className="font-mono text-[11px] text-muted-foreground truncate">{p.read}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No permissions defined.</p>
            )}
          </div>

          {/* tracing toggle */}
          <div className="rounded-md border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Message Tracing</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Currently: <strong>{vhost.tracing ? "enabled" : "disabled"}</strong>
                </p>
              </div>
              <Button
                size="sm"
                variant={vhost.tracing ? "destructive" : "outline"}
                disabled={tracingBusy}
                onClick={handleTracingToggle}
                className="shrink-0"
              >
                {vhost.tracing ? "Disable" : "Enable"}
              </Button>
            </div>
            {vhost.tracing && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Tracing impacts broker performance. Disable in production.
              </p>
            )}
          </div>

          {/* delete */}
          {!isDefault_ && (
            <div className="rounded-md border border-destructive/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <p className="text-sm font-semibold">Danger Zone</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Deleting this vhost will permanently destroy all queues, exchanges, bindings, and messages inside it.
              </p>
              {!showDeleteConfirm ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Vhost
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Type <strong className="text-foreground font-mono">{vhost.name}</strong> to confirm:
                  </p>
                  <Input
                    value={deleteInput}
                    onChange={(e) => setDeleteInput(e.target.value)}
                    placeholder={vhost.name}
                    className="h-8 font-mono text-sm"
                  />
                  {deleteError && (
                    <p className="text-xs text-destructive">{deleteError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deleteInput !== vhost.name || deleting}
                      onClick={handleDelete}
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ── add vhost drawer ──────────────────────────────────────────────────────────

interface AddDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function AddVhostDrawer({ open, onClose, onCreated }: AddDrawerProps) {
  const [name, setName]           = useState("");
  const [description, setDesc]    = useState("");
  const [tags, setTags]           = useState("");
  const [queueType, setQueueType] = useState("classic");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => nameRef.current?.focus(), 50);
    else { setName(""); setDesc(""); setTags(""); setQueueType("classic"); setError(""); }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/rabbitmq/vhosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, tags, default_queue_type: queueType }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.error) throw new Error(json.error);
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create vhost");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-[420px] flex-col border-l bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Add Virtual Host</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col px-5 py-5 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. production"
              className="h-9 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional description for this vhost"
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tags
            </label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Separate tags with commas"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Default Queue Type
            </label>
            <Select value={queueType} onValueChange={setQueueType}>
              <SelectTrigger className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="classic">Classic</SelectItem>
                <SelectItem value="quorum">Quorum</SelectItem>
                <SelectItem value="stream">Stream</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-2 mt-auto border-t">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Creating…" : "Add Virtual Host"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </aside>
    </>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function VhostsPage() {
  const queryClient = useQueryClient();
  const [selected,  setSelected]  = useState<Vhost | null>(null);
  const [addOpen,   setAddOpen]   = useState(false);
  const [sortKey,   setSortKey]   = useState<SortKey>("name");
  const [sortDir,   setSortDir]   = useState<"asc" | "desc">("asc");

  useSetHeaderActions(
    <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
      <Plus className="h-4 w-4" /> Add Vhost
    </Button>,
  );

  const { data: vhosts = [], isLoading, isError, error } = useQuery<Vhost[]>({
    queryKey: ["vhosts"],
    queryFn: async () => {
      const res  = await fetch("/api/rabbitmq/vhosts");
      const json = (await res.json()) as { data?: Vhost[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 10_000,
  });

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  const sorted = useMemo(() => {
    const list = [...vhosts].sort((a, b) => {
      let cmp = 0;
      if      (sortKey === "name")                    cmp = a.name.localeCompare(b.name);
      else if (sortKey === "messages")                cmp = (a.messages ?? 0) - (b.messages ?? 0);
      else if (sortKey === "messages_ready")          cmp = (a.messages_ready ?? 0) - (b.messages_ready ?? 0);
      else if (sortKey === "messages_unacknowledged") cmp = (a.messages_unacknowledged ?? 0) - (b.messages_unacknowledged ?? 0);
      return sortDir === "desc" ? -cmp : cmp;
    });
    const defaults = list.filter((v) => isDefault(v.name));
    const rest     = list.filter((v) => !isDefault(v.name));
    return [...defaults, ...rest];
  }, [vhosts, sortKey, sortDir]);

  const totalMessages  = vhosts.reduce((s, v) => s + (v.messages ?? 0), 0);
  const tracingCount   = vhosts.filter((v) => v.tracing).length;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["vhosts"] });
    void queryClient.invalidateQueries({ queryKey: ["vhost-permissions"] });
  }

  // sync selected vhost with fresh data
  const freshSelected = selected
    ? vhosts.find((v) => v.name === selected.name) ?? selected
    : null;

  return (
    <div className="space-y-6">
      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load virtual hosts"}
        </div>
      )}

      {/* summary bar */}
      {!isLoading && vhosts.length > 0 && (
        <div className="flex flex-wrap gap-4 rounded-md border bg-muted/30 px-5 py-3 text-sm">
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">Total vhosts</span>
            <p className="text-lg font-bold tabular-nums">{vhosts.length}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">Global messages</span>
            <p className="text-lg font-bold tabular-nums">{formatCount(totalMessages)}</p>
          </div>
          {tracingCount > 0 && (
            <div className="flex items-center gap-2 ml-auto rounded-md bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">
                {tracingCount} vhost{tracingCount > 1 ? "s" : ""} with tracing enabled
              </span>
              <span className="text-xs opacity-70">— impacts performance</span>
            </div>
          )}
        </div>
      )}

      {/* table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton k="name" active={sortKey} dir={sortDir} onSort={toggleSort}>Name</SortButton>
              </TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">
                <SortButton k="messages_ready" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Ready
                </SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton k="messages_unacknowledged" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Unacked
                </SortButton>
              </TableHead>
              <TableHead className="text-right">Pub rate</TableHead>
              <TableHead className="text-right">Del rate</TableHead>
              <TableHead>Tracing</TableHead>
              <TableHead>Nodes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">No virtual hosts found</TableCell>
              </TableRow>
            ) : (
              sorted.map((vhost) => {
                const isDefault_ = isDefault(vhost.name);
                const publishRate = vhost.message_stats?.publish_details?.rate;
                const deliverRate = vhost.message_stats?.deliver_get_details?.rate;
                const noMessages  = !vhost.messages || vhost.messages === 0;

                return (
                  <TableRow
                    key={vhost.name}
                    className={cn("cursor-pointer", isDefault_ && "bg-muted/20")}
                    onClick={() => setSelected(vhost)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={cn("font-mono text-sm font-medium", noMessages && !isDefault_ && "text-muted-foreground/70")}>
                          {vhost.name}
                        </span>
                        {isDefault_ && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            default
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                      {vhost.description ?? ""}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCount(vhost.messages_ready)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCount(vhost.messages_unacknowledged)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {formatRate(publishRate)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {formatRate(deliverRate)}
                    </TableCell>
                    <TableCell>
                      {vhost.tracing ? (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" /> on
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ClusterDots state={vhost.cluster_state} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <VhostDrawer
        vhost={freshSelected}
        onClose={() => setSelected(null)}
        onDeleted={invalidate}
        onTracingToggled={invalidate}
      />

      <AddVhostDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={invalidate}
      />
    </div>
  );
}
