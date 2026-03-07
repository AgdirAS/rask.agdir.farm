"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Channel, Connection } from "@/lib/types";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { useHeaderActions } from "@/components/layout/header-actions-context";
import { X } from "lucide-react";
import { relativeTime, fmtBytes, fmtBytesRate, fmtDateFull } from "@/lib/utils";
import { useTraceStream } from "@/lib/use-trace-stream";
import { TraceTab } from "@/components/trace-tab";

// ── badges & icons ────────────────────────────────────────────────────────────

const STATE_STYLES: Record<string, string> = {
  running:  "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  idle:     "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  blocked:  "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800",
  blocking: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800",
  flow:     "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  closing:  "bg-muted text-muted-foreground border-border",
  closed:   "bg-muted text-muted-foreground border-border",
};

const PROTOCOL_STYLES: Record<string, string> = {
  "AMQP 0-9-1": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "AMQP 1.0":   "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  "MQTT 3.1":   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "MQTT 3.1.1": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "STOMP":      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

function StateBadge({ state }: { state: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATE_STYLES[state] ?? STATE_STYLES.closed}`}>
      {state}
    </span>
  );
}

function ProtocolBadge({ protocol }: { protocol: string }) {
  const style = PROTOCOL_STYLES[protocol] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${style}`}>
      {protocol}
    </span>
  );
}

function SslIcon({ ssl }: { ssl: boolean }) {
  return ssl ? (
    <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 16 16" fill="none">
      <title>TLS encrypted</title>
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="1" fill="currentColor" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-muted-foreground/40" viewBox="0 0 16 16" fill="none">
      <title>Plaintext</title>
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 1.5" />
    </svg>
  );
}

function RateCell({ send, recv }: { send?: number; recv?: number }) {
  return (
    <div className="flex flex-col gap-0.5 font-mono">
      <div className="flex items-center gap-1 text-[11px]">
        <span className={send && send > 0 ? "text-emerald-500" : "text-muted-foreground/30"}>↑</span>
        <span className="text-muted-foreground">{send !== undefined ? fmtBytesRate(send) : "—"}</span>
      </div>
      <div className="flex items-center gap-1 text-[11px]">
        <span className={recv && recv > 0 ? "text-primary" : "text-muted-foreground/30"}>↓</span>
        <span className="text-muted-foreground">{recv !== undefined ? fmtBytesRate(recv) : "—"}</span>
      </div>
    </div>
  );
}

function clientName(conn: Connection): string {
  const props = conn.client_properties;
  if (!props) return "";
  return (props.connection_name as string) ?? (props.product as string) ?? "";
}

// ── pagination ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  const visible: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= page - 1 && i <= page + 1)) visible.push(i);
    else if (visible[visible.length - 1] !== "…") visible.push("…");
  }
  return (
    <div className="flex gap-1 text-sm">
      <Button variant="outline" size="sm" onClick={() => onChange(page - 1)} disabled={page === 1}>‹</Button>
      {visible.map((v, i) =>
        v === "…"
          ? <span key={`e${i}`} className="px-2.5 py-1.5 text-muted-foreground">…</span>
          : <Button key={v} size="sm" variant={v === page ? "default" : "outline"} onClick={() => onChange(v as number)}>{v}</Button>
      )}
      <Button variant="outline" size="sm" onClick={() => onChange(page + 1)} disabled={page === pages}>›</Button>
    </div>
  );
}

// ── detail drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({
  conn,
  onClose,
  onForceClose,
  isClosing,
}: {
  conn: Connection;
  onClose: () => void;
  onForceClose: (name: string) => Promise<void>;
  isClosing: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  type ConnectionTab = "overview" | "trace";
  const [tab, setTab] = useState<ConnectionTab>("overview");
  const trace = useTraceStream();
  // connections: trace events don't carry connection metadata, show global vhost feed
  const traceEvents = trace.events;

  useEffect(() => {
    if (tab === "trace") {
      void trace.start(conn.vhost);
    } else {
      void trace.stop();
      trace.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, conn.vhost]);

  useEffect(() => {
    return () => { void trace.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to overview when a different connection is opened
  useEffect(() => {
    setTab("overview");
  }, [conn.name]);

  const { data: channels, isLoading: chLoading } = useQuery<Channel[]>({
    queryKey: ["connection-channels", conn.name],
    queryFn: async () => {
      const res = await fetch(`/api/rabbitmq/connections/${encodeURIComponent(conn.name)}/channels`);
      const json = (await res.json()) as { data?: Channel[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 5_000,
  });

  const name = clientName(conn);

  return (
    <>
      {/* backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-[480px] max-w-full bg-background border-l shadow-xl flex flex-col overflow-hidden">
        {/* drawer header */}
        <div className="flex items-start justify-between p-5 border-b">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-mono truncate">{conn.name}</p>
            {name && <p className="text-base font-semibold mt-0.5">{name}</p>}
            <div className="flex items-center gap-2 mt-1.5">
              <StateBadge state={conn.state} />
              <ProtocolBadge protocol={conn.protocol} />
              <SslIcon ssl={conn.ssl} />
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="ml-4 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b bg-muted/30 px-4 shrink-0">
          {(["overview", "trace"] as ConnectionTab[]).map((t) => (
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
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* metadata grid */}
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Connection Details</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[
                  ["Client", `${conn.peer_host}:${conn.peer_port}`],
                  ["User", conn.user],
                  ["Vhost", conn.vhost],
                  ["Node", conn.node],
                  ["Channels", String(conn.channels)],
                  ["SSL/TLS", conn.ssl ? "Yes" : "No"],
                  ["Connected", fmtDateFull(conn.connected_at)],
                  ["Sent total", conn.send_oct != null ? fmtBytes(conn.send_oct) : "—"],
                  ["Recv total", conn.recv_oct != null ? fmtBytes(conn.recv_oct) : "—"],
                  ["Send rate", conn.send_oct_details ? fmtBytesRate(conn.send_oct_details.rate) : "—"],
                  ["Recv rate", conn.recv_oct_details ? fmtBytesRate(conn.recv_oct_details.rate) : "—"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10px] uppercase font-semibold text-muted-foreground">{k}</dt>
                    <dd className="font-mono text-sm mt-0.5 break-all">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* channels list */}
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">
                Channels {channels ? `(${channels.length})` : ""}
              </p>
              {chLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !channels || channels.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open channels</p>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 text-xs uppercase">
                        <TableHead className="py-2">#</TableHead>
                        <TableHead className="py-2">State</TableHead>
                        <TableHead className="py-2 text-right">Consumers</TableHead>
                        <TableHead className="py-2 text-right">Unacked</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channels.map((ch) => (
                        <TableRow key={ch.name}>
                          <TableCell className="py-2 font-mono text-xs">{ch.number}</TableCell>
                          <TableCell className="py-2"><StateBadge state={ch.state} /></TableCell>
                          <TableCell className="py-2 text-right text-xs">{ch.consumer_count}</TableCell>
                          <TableCell className="py-2 text-right text-xs">{ch.messages_unacknowledged}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <TraceTab trace={trace} events={traceEvents} />
          </div>
        )}

        {/* drawer footer — force close */}
        <div className="border-t p-4">
          {!confirming ? (
            <Button
              variant="outline"
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setConfirming(true)}
            >
              Force Close Connection
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                Close connection from{" "}
                <span className="font-mono text-destructive">{conn.peer_host}</span>?
              </p>
              <p className="text-xs text-muted-foreground">
                This will immediately terminate all {conn.channels} channel{conn.channels !== 1 ? "s" : ""} and disconnect the client.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={async () => { await onForceClose(conn.name); onClose(); }}
                  disabled={isClosing}
                >
                  {isClosing ? "Closing…" : "Yes, close it"}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

const ALL_STATES = ["running", "idle", "blocked", "blocking", "flow", "closing", "closed"] as const;

export default function ConnectionsPage() {
  const queryClient = useQueryClient();
  const { setActions } = useHeaderActions();
  const [search, setSearch]             = useState("");
  const [stateFilter, setStateFilter]   = useState("all");
  const [vhostFilter, setVhostFilter]   = useState("all");
  const [protoFilter, setProtoFilter]   = useState("all");
  const [page, setPage]                 = useState(1);
  const [closing, setClosing]           = useState<Set<string>>(new Set());
  const [selected, setSelected]         = useState<Connection | null>(null);

  const { data, isError, error } = useQuery<Connection[]>({
    queryKey: ["connections"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/connections");
      const json = (await res.json()) as { data?: Connection[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 5_000,
  });

  const vhosts    = useMemo(() => Array.from(new Set(data?.map((c) => c.vhost) ?? [])).sort(), [data]);
  const protocols = useMemo(() => Array.from(new Set(data?.map((c) => c.protocol) ?? [])).sort(), [data]);

  useEffect(() => {
    setActions(
      <div className="flex items-center gap-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <Input
            className="pl-9 w-56"
            placeholder="Search name, IP, user…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        {[
          { label: "State",    value: stateFilter, set: setStateFilter, opts: ALL_STATES as unknown as string[] },
          { label: "Vhost",    value: vhostFilter, set: setVhostFilter, opts: vhosts },
          { label: "Protocol", value: protoFilter, set: setProtoFilter, opts: protocols },
        ].map(({ label, value, set, opts }) => (
          <Select key={label} value={value} onValueChange={(v) => { set(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{label}: All</SelectItem>
              {opts.map((o) => <SelectItem key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
      </div>,
    );
    return () => setActions(null);
  }, [search, stateFilter, vhostFilter, protoFilter, vhosts, protocols, setActions]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((c) => {
      const cn = clientName(c).toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.peer_host.includes(q) || c.user.toLowerCase().includes(q) || cn.includes(q);
      const matchState  = stateFilter === "all" || c.state === stateFilter;
      const matchVhost  = vhostFilter === "all" || c.vhost === vhostFilter;
      const matchProto  = protoFilter === "all" || c.protocol === protoFilter;
      return matchSearch && matchState && matchVhost && matchProto;
    });
  }, [data, search, stateFilter, vhostFilter, protoFilter]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const total         = data?.length ?? 0;
  const blockedCount  = data?.filter((c) => c.state === "blocked" || c.state === "blocking" || c.state === "flow").length ?? 0;
  const totalChannels = data?.reduce((s, c) => s + c.channels, 0) ?? 0;
  const sslCount      = data?.filter((c) => c.ssl).length ?? 0;

  async function handleForceClose(name: string) {
    setClosing((prev) => new Set(prev).add(name));
    try {
      await fetch("/api/rabbitmq/connections/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await queryClient.invalidateQueries({ queryKey: ["connections"] });
    } finally {
      setClosing((prev) => { const n = new Set(prev); n.delete(name); return n; });
    }
  }

  function isBlocked(state: string) {
    return state === "blocked" || state === "blocking" || state === "flow";
  }

  return (
    <div className="space-y-6">
      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load connections"}
        </div>
      )}

      {/* summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Connections" value={total} />
        <StatCard label="Blocked / Flow" value={blockedCount} accent={blockedCount > 0 ? "text-rose-500" : ""} />
        <StatCard label="Open Channels" value={totalChannels} />
        <StatCard label="TLS / Plain" value={data ? `${sslCount} / ${total - sslCount}` : "—"} />
      </div>

      {/* table */}
      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50 text-xs uppercase">
              <TableRow>
                <TableHead>Client / Name</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Vhost</TableHead>
                <TableHead>Protocol</TableHead>
                <TableHead>State</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-center">Ch</TableHead>
                <TableHead>Connected</TableHead>
                <TableHead>↑↓ Rate</TableHead>
                <TableHead className="text-center">TLS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-6">Loading…</TableCell>
                </TableRow>
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10">
                    <p className="text-muted-foreground font-medium">No active connections</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      {search || stateFilter !== "all" || vhostFilter !== "all" || protoFilter !== "all"
                        ? "Try adjusting your filters"
                        : "The broker is idle — no clients connected"}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((conn) => {
                  const cn = clientName(conn);
                  const blocked = isBlocked(conn.state);
                  return (
                    <TableRow
                      key={conn.name}
                      onClick={() => setSelected(conn)}
                      className={`cursor-pointer whitespace-nowrap ${blocked ? "bg-rose-50/50 dark:bg-rose-900/10" : ""}`}
                    >
                      <TableCell>
                        <div className="font-medium">{cn || conn.name.split(" ")[0]}</div>
                        {cn && <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[160px]">{conn.name}</div>}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{conn.peer_host}:{conn.peer_port}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{conn.vhost}</TableCell>
                      <TableCell><ProtocolBadge protocol={conn.protocol} /></TableCell>
                      <TableCell><StateBadge state={conn.state} /></TableCell>
                      <TableCell>{conn.user}</TableCell>
                      <TableCell className="text-center font-medium">{conn.channels}</TableCell>
                      <TableCell>
                        <span title={fmtDateFull(conn.connected_at)} className="text-muted-foreground cursor-help">
                          {relativeTime(conn.connected_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <RateCell send={conn.send_oct_details?.rate} recv={conn.recv_oct_details?.rate} />
                      </TableCell>
                      <TableCell className="text-center"><SslIcon ssl={conn.ssl} /></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* footer */}
        <div className="px-5 py-3 bg-muted/30 border-t flex justify-between items-center text-xs text-muted-foreground">
          <span>
            {filtered.length === 0 ? "0 connections" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          </span>
          <Pagination page={page} total={filtered.length} onChange={setPage} />
        </div>
      </div>

      {/* detail drawer */}
      {selected && (
        <DetailDrawer
          conn={selected}
          onClose={() => setSelected(null)}
          onForceClose={handleForceClose}
          isClosing={closing.has(selected.name)}
        />
      )}
    </div>
  );
}
