"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Binding } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { useHeaderActions } from "@/components/layout/header-actions-context";

// ── create binding dialog ──────────────────────────────────────────────────────

function CreateBindingDialog({
  vhosts,
  exchanges,
  onClose,
  onCreated,
}: {
  vhosts: string[];
  exchanges: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [vhost, setVhost] = useState(vhosts[0] ?? "/");
  const [source, setSource] = useState(exchanges[0] ?? "");
  const [destination, setDestination] = useState("");
  const [routingKey, setRoutingKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/rabbitmq/bindings/${encodeURIComponent(vhost)}/e/${encodeURIComponent(source)}/q/${encodeURIComponent(destination)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ routing_key: routingKey }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Create failed");
    },
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : "Create failed"),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-background border rounded-xl shadow-xl w-full max-w-md">
          <div className="flex items-center justify-between p-5 border-b">
            <h2 className="font-semibold text-base">New Binding</h2>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="p-5 space-y-3">
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</p>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Vhost</label>
              <select
                value={vhost}
                onChange={(e) => setVhost(e.target.value)}
                className="w-full bg-background border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {vhosts.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Source Exchange *</label>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                list="exchange-list"
                placeholder="amq.direct"
                className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <datalist id="exchange-list">
                {exchanges.map((ex) => <option key={ex} value={ex} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Destination Queue *</label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="my-queue"
                className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Routing Key</label>
              <input
                value={routingKey}
                onChange={(e) => setRoutingKey(e.target.value)}
                placeholder="my.routing.key"
                className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>
          </div>
          <div className="flex gap-2 p-5 pt-0">
            <button
              onClick={() => mutation.mutate()}
              disabled={!source.trim() || !destination.trim() || mutation.isPending}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? "Creating…" : "Create Binding"}
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function BindingsPage() {
  const queryClient = useQueryClient();
  const { setActions } = useHeaderActions();
  const [search, setSearch] = useState("");
  const [vhostFilter, setVhost] = useState("all");
  const [sourceFilter, setSource] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isError, error } = useQuery<Binding[]>({
    queryKey: ["bindings"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/bindings");
      const json = (await res.json()) as { data?: Binding[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 10_000,
  });

  const vhosts = useMemo(() => Array.from(new Set(data?.map((b) => b.vhost) ?? [])).sort(), [data]);
  const exchanges = useMemo(() => Array.from(new Set(data?.map((b) => b.source).filter(Boolean) ?? [])).sort(), [data]);

  useEffect(() => {
    setActions(
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 shrink-0">
          <Plus className="h-3.5 w-3.5" /> New Binding
        </Button>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className="pl-9 pr-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary w-48"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={vhostFilter} onValueChange={setVhost}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Vhost: All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vhost: All</SelectItem>
            {vhosts.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSource}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Exchange: All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Exchange: All</SelectItem>
            {exchanges.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>,
    );
    return () => setActions(null);
  }, [search, vhostFilter, sourceFilter, vhosts, exchanges, setActions]);

  const withKey  = useMemo(() => data?.filter((b) => b.routing_key) ?? [], [data]);
  const withArgs = useMemo(() => data?.filter((b) => Object.keys(b.arguments ?? {}).length > 0) ?? [], [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((b) => {
      const matchSearch = !q
        || b.source.toLowerCase().includes(q)
        || b.destination.toLowerCase().includes(q)
        || (b.routing_key ?? "").toLowerCase().includes(q);
      const matchVhost = vhostFilter === "all" || b.vhost === vhostFilter;
      const matchSource = sourceFilter === "all" || b.source === sourceFilter;
      return matchSearch && matchVhost && matchSource;
    });
  }, [data, search, vhostFilter, sourceFilter]);

  async function handleDelete(binding: Binding) {
    const key = `${binding.vhost}/${binding.source}/${binding.destination}/${binding.routing_key}`;
    setDeletingKey(key);
    setDeleteError(null);
    try {
      const propsKey = binding.properties_key ?? "~";
      const res = await fetch(
        `/api/rabbitmq/bindings/${encodeURIComponent(binding.vhost)}/e/${encodeURIComponent(binding.source)}/q/${encodeURIComponent(binding.destination)}?props_key=${encodeURIComponent(propsKey)}`,
        { method: "DELETE" },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Delete failed");
      await queryClient.invalidateQueries({ queryKey: ["bindings"] });
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load bindings"}
        </div>
      )}
      {deleteError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {deleteError}
        </div>
      )}

      {/* summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Bindings"   value={data?.length ?? 0} />
        <StatCard label="Unique Exchanges" value={exchanges.length} />
        <StatCard label="With Routing Key" value={withKey.length} />
        <StatCard label="With Arguments"   value={withArgs.length} />
      </div>



      {/* table */}
      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-5 py-3">Source Exchange</th>
                <th className="px-5 py-3">Vhost</th>
                <th className="px-5 py-3">Destination Queue</th>
                <th className="px-5 py-3">Routing Key</th>
                <th className="px-5 py-3">Arguments</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center">
                    <p className="text-muted-foreground font-medium">No bindings found</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      {search || vhostFilter !== "all" || sourceFilter !== "all"
                        ? "Try adjusting your filters"
                        : "No bindings declared in this broker"}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((b, i) => {
                  const rowKey = `${b.vhost}/${b.source}/${b.destination}/${b.routing_key}/${i}`;
                  const delKey = `${b.vhost}/${b.source}/${b.destination}/${b.routing_key}`;
                  const argCount = Object.keys(b.arguments ?? {}).length;
                  return (
                    <tr key={rowKey} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 font-mono text-sm font-medium">
                        {b.source || <span className="text-muted-foreground italic">(default)</span>}
                      </td>
                      <td className="px-5 py-3 font-mono text-sm text-muted-foreground">{b.vhost}</td>
                      <td className="px-5 py-3 font-mono text-sm">{b.destination}</td>
                      <td className="px-5 py-3 font-mono text-sm text-muted-foreground">
                        {b.routing_key || <span className="italic">—</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {argCount > 0 ? (
                          <span className="px-1.5 py-0.5 bg-muted rounded text-xs">{argCount} arg{argCount > 1 ? "s" : ""}</span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleDelete(b)}
                          disabled={deletingKey === delKey}
                          className="px-2.5 py-1 text-xs text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        >
                          {deletingKey === delKey ? "…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-muted/30 border-t text-xs text-muted-foreground">
          {filtered.length} binding{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {showCreate && (
        <CreateBindingDialog
          vhosts={vhosts.length > 0 ? vhosts : ["/"]}
          exchanges={exchanges}
          onClose={() => setShowCreate(false)}
          onCreated={() => void queryClient.invalidateQueries({ queryKey: ["bindings"] })}
        />
      )}
    </div>
  );
}
