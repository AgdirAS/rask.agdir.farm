"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Channel } from "@/lib/types";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/stat-card";
import { useHeaderActions } from "@/components/layout/header-actions-context";
import { useTraceStream } from "@/lib/use-trace-stream";
import { TraceTab } from "@/components/trace-tab";

// ── helpers ───────────────────────────────────────────────────────────────────


function channelMode(ch: Channel): "confirm" | "transactional" | "normal" {
  if (ch.confirm) return "confirm";
  if (ch.transactional) return "transactional";
  return "normal";
}

// ── state badge ───────────────────────────────────────────────────────────────

const STATE_STYLES: Record<string, string> = {
  running: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  idle: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  flow: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  blocked: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800 animate-pulse",
  closing: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

function StateBadge({ state }: { state: Channel["state"] }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATE_STYLES[state] ?? STATE_STYLES.closing}`}>
      {state}
    </span>
  );
}

// ── mode badge ────────────────────────────────────────────────────────────────

const MODE_STYLES = {
  confirm: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  transactional: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800",
  normal: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

function ModeBadge({ mode }: { mode: "confirm" | "transactional" | "normal" }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${MODE_STYLES[mode]}`}>
      {mode}
    </span>
  );
}

// ── detail drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const mode = channelMode(channel);
  const connName = channel.connection_details?.name ?? channel.name;

  type ChannelTab = "overview" | "trace";
  const [tab, setTab] = useState<ChannelTab>("overview");
  const trace = useTraceStream();
  // channels: trace events don't carry channel metadata, show global vhost feed
  const traceEvents = trace.events;

  useEffect(() => {
    if (tab === "trace") {
      void trace.start(channel.vhost);
    } else {
      void trace.stop();
      trace.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, channel.vhost]);

  useEffect(() => {
    return () => { void trace.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to overview when a different channel is opened
  useEffect(() => {
    setTab("overview");
  }, [channel.name]);

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      {/* panel */}
      <aside className="fixed right-0 top-0 h-full z-50 w-[420px] bg-background border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-base truncate max-w-[320px]">{channel.name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Channel #{channel.number}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b bg-muted/30 px-4 shrink-0">
          {(["overview", "trace"] as ChannelTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t === "overview" ? "Overview" : trace.active ? "Live Trace ●" : "Live Trace"}
            </button>
          ))}
        </div>

        {tab !== "trace" ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* state + mode */}
            <div className="flex gap-2">
              <StateBadge state={channel.state} />
              <ModeBadge mode={mode} />
            </div>

            {/* key fields */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">Connection</dt>
                <dd className="font-medium break-all text-xs">{connName}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">Vhost</dt>
                <dd className="font-medium">{channel.vhost}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">User</dt>
                <dd className="font-medium">{channel.user}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">Consumers</dt>
                <dd className="font-medium">{channel.consumer_count}</dd>
              </div>
            </dl>

            {/* message stats */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Message Counters</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Unacknowledged</span>
                  <span className={`text-xl font-bold tabular-nums ${channel.messages_unacknowledged > 0 ? "text-amber-500" : ""}`}>
                    {channel.messages_unacknowledged.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Uncommitted</span>
                  <span className="text-xl font-bold tabular-nums">
                    {(channel.messages_uncommitted ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Acks Uncommitted</span>
                  <span className="text-xl font-bold tabular-nums">
                    {(channel.acks_uncommitted ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* prefetch */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Prefetch</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Per-Consumer</span>
                  <span className="text-xl font-bold tabular-nums">{channel.prefetch_count}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Global</span>
                  <span className="text-xl font-bold tabular-nums">{channel.global_prefetch_count ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <TraceTab trace={trace} events={traceEvents} />
          </div>
        )}
      </aside>
    </>
  );
}

// ── sort helpers ──────────────────────────────────────────────────────────────

type SortKey = "name" | "vhost" | "state" | "messages_unacknowledged" | "prefetch_count" | "consumer_count";

function sortChannels(channels: Channel[], key: SortKey, dir: "asc" | "desc"): Channel[] {
  return [...channels].sort((a, b) => {
    let va: string | number = a[key] as string | number;
    let vb: string | number = b[key] as string | number;
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── pagination ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;

  const visible: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= page - 1 && i <= page + 1)) visible.push(i);
    else if (visible[visible.length - 1] !== "…") visible.push("…");
  }

  return (
    <div className="flex gap-1">
      <button onClick={() => onChange(page - 1)} disabled={page === 1}
        className="px-2.5 py-1.5 border rounded bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">‹</button>
      {visible.map((v, i) =>
        v === "…"
          ? <span key={`e${i}`} className="px-2.5 py-1.5 text-muted-foreground">…</span>
          : <button key={v} onClick={() => onChange(v as number)}
              className={`px-2.5 py-1.5 border rounded font-medium transition-colors ${v === page ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>
              {v}
            </button>
      )}
      <button onClick={() => onChange(page + 1)} disabled={page === Math.ceil(total / PAGE_SIZE)}
        className="px-2.5 py-1.5 border rounded bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">›</button>
    </div>
  );
}

// ── sort header cell ──────────────────────────────────────────────────────────

function SortTh({
  label, sortKey, current, dir, onSort, className,
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: "asc" | "desc";
  onSort: (k: SortKey) => void; className?: string;
}) {
  const active = current === sortKey;
  return (
    <th
      className={`px-6 py-3 cursor-pointer select-none hover:text-foreground transition-colors ${active ? "text-foreground" : ""} ${className ?? ""}`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${active ? "opacity-100" : "opacity-30"}`}>
          {active && dir === "desc" ? "▼" : "▲"}
        </span>
      </div>
    </th>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

const ALL_STATES = ["running", "idle", "flow", "blocked", "closing"] as const;

export default function ChannelsPage() {
  const { setActions } = useHeaderActions();
  const [search, setSearch] = useState("");
  const [vhostFilter, setVhostFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data, isError, error } = useQuery<Channel[]>({
    queryKey: ["channels"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/channels");
      const json = (await res.json()) as { data?: Channel[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 5_000,
  });

  // unique vhosts for filter dropdown
  const vhosts = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map((c) => c.vhost))).sort();
  }, [data]);

  useEffect(() => {
    setActions(
      <div className="flex items-center gap-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <Input
            className="pl-9 w-64"
            placeholder="Search by channel, connection, or user…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={vhostFilter} onValueChange={(v) => { setVhostFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vhost: All</SelectItem>
            {vhosts.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">State: All</SelectItem>
            {ALL_STATES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>,
    );
    return () => setActions(null);
  }, [search, vhostFilter, stateFilter, vhosts, setActions]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((ch) => {
      const matchesSearch =
        !q ||
        ch.name.toLowerCase().includes(q) ||
        (ch.connection_details?.name ?? "").toLowerCase().includes(q) ||
        ch.user.toLowerCase().includes(q);
      const matchesVhost = vhostFilter === "all" || ch.vhost === vhostFilter;
      const matchesState = stateFilter === "all" || ch.state === stateFilter;
      return matchesSearch && matchesVhost && matchesState;
    });
  }, [data, search, vhostFilter, stateFilter]);

  const sorted = useMemo(() => sortChannels(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // summary stats
  const total = data?.length ?? 0;
  const totalUnacked = data?.reduce((s, c) => s + c.messages_unacknowledged, 0) ?? 0;
  const blockedCount = data?.filter((c) => c.state === "blocked").length ?? 0;

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  return (
    <div className="space-y-6">
      {selected && <DetailDrawer channel={selected} onClose={() => setSelected(null)} />}

      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load channels"}
        </div>
      )}

      {/* summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Channels" value={total} />
        <StatCard label="Total Unacked" value={totalUnacked.toLocaleString()} accent={totalUnacked > 0 ? "text-amber-500" : ""} />
        <StatCard label="Blocked" value={blockedCount} accent={blockedCount > 0 ? "text-rose-600 dark:text-rose-400" : ""} warn={blockedCount > 0} />
      </div>

      {/* table */}
      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <SortTh label="Channel" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} className="px-6 py-3" />
                <th className="px-6 py-3">Connection</th>
                <SortTh label="Vhost" sortKey="vhost" current={sortKey} dir={sortDir} onSort={handleSort} className="px-6 py-3" />
                <SortTh label="State" sortKey="state" current={sortKey} dir={sortDir} onSort={handleSort} className="px-6 py-3 text-center" />
                <SortTh label="Unacked" sortKey="messages_unacknowledged" current={sortKey} dir={sortDir} onSort={handleSort} className="px-6 py-3 text-right" />
                <SortTh label="Prefetch" sortKey="prefetch_count" current={sortKey} dir={sortDir} onSort={handleSort} className="px-6 py-3 text-right" />
                <SortTh label="Consumers" sortKey="consumer_count" current={sortKey} dir={sortDir} onSort={handleSort} className="px-6 py-3 text-right" />
                <th className="px-6 py-3 text-center">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">Loading…</td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <p className="text-muted-foreground font-medium">No open channels</p>
                    <p className="text-muted-foreground/60 text-xs mt-1">Channels appear when AMQP clients connect and open them.</p>
                  </td>
                </tr>
              ) : (
                paged.map((ch) => {
                  const isBlocked = ch.state === "blocked";
                  const highUnacked = ch.messages_unacknowledged > 100;
                  const connName = ch.connection_details?.name ?? ch.name;
                  const mode = channelMode(ch);

                  return (
                    <tr
                      key={ch.name}
                      onClick={() => setSelected(ch)}
                      className={`cursor-pointer transition-colors ${
                        isBlocked
                          ? "bg-rose-50/60 dark:bg-rose-900/10 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="px-6 py-4 font-medium font-mono text-xs">{ch.name}</td>
                      <td className="px-6 py-4 text-muted-foreground max-w-[180px] truncate">{connName}</td>
                      <td className="px-6 py-4 text-muted-foreground">{ch.vhost}</td>
                      <td className="px-6 py-4 text-center">
                        <StateBadge state={ch.state} />
                      </td>
                      <td className={`px-6 py-4 text-right font-medium tabular-nums ${highUnacked ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                        {ch.messages_unacknowledged.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-muted-foreground tabular-nums">
                        {ch.prefetch_count}
                      </td>
                      <td className="px-6 py-4 text-right text-muted-foreground tabular-nums">
                        {ch.consumer_count}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <ModeBadge mode={mode} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* table footer */}
        <div className="px-6 py-3 bg-muted/30 border-t flex justify-between items-center text-sm text-muted-foreground">
          <span>
            {filtered.length === 0
              ? "No channels"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          </span>
          <Pagination page={page} total={filtered.length} onChange={setPage} />
        </div>
      </div>
    </div>
  );
}
