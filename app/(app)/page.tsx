"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NodeStats, Overview, Queue } from "@/lib/types";
import { useConnectionError } from "@/components/layout/connection-error-context";
import { StatCard } from "@/components/stat-card";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + " GiB";
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(0) + " MiB";
  if (bytes >= 1_024) return (bytes / 1_024).toFixed(0) + " KiB";
  return bytes + " B";
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function pct(used: number, total: number): number {
  if (!total) return 0;
  return Math.round((used / total) * 100);
}

// ── rolling buffer types ──────────────────────────────────────────────────────

interface DataPoint { ts: number; value: number }
const MAX_POINTS = 60;

function appendPoint(buf: DataPoint[], value: number): DataPoint[] {
  const next = [...buf, { ts: Date.now(), value }];
  return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
}

// ── sparkline chart ────────────────────────────────────────────────────────────

function Sparkline({
  series,
  color = "var(--primary)",
  width = 400,
  height = 160,
}: {
  series: { label: string; points: DataPoint[]; color?: string }[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const maxVal = Math.max(...allValues, 0.01);

  function toPolyline(points: DataPoint[]): string {
    if (points.length < 2) return "";
    return points
      .map((p, i) => {
        const x = (i / (MAX_POINTS - 1)) * width;
        const y = height - (p.value / maxVal) * (height - 4);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const COLORS = [color, "#94a3b8", "#f59e0b", "#10b981", "#6366f1"];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-full"
    >
      {series.map((s, idx) => {
        const pts = toPolyline(s.points);
        if (!pts) return null;
        const c = s.color ?? COLORS[idx % COLORS.length];
        return (
          <polyline
            key={s.label}
            points={pts}
            fill="none"
            stroke={c}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

// ── progress bar ─────────────────────────────────────────────────────────────

function Bar({ used, total }: { used: number; total: number }) {
  const p = pct(used, total);
  const color = p > 80 ? "bg-red-500" : p > 50 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="flex flex-col gap-1">
      <div className="w-full bg-muted h-1.5 rounded-full">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">
        {fmtNum(used)} of {fmtNum(total)}
      </span>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  // Rolling 60-point buffers (5 min at 5s intervals)
  const publishBuf = useRef<DataPoint[]>([]);
  const ackBuf     = useRef<DataPoint[]>([]);
  // Force re-render when buffers update
  const [tick, setTick] = useState(0);

  const { data: overview, isError: ovErr } = useQuery<Overview>({
    queryKey: ["overview"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/overview");
      const json = (await res.json()) as { data?: Overview; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data!;
    },
    refetchInterval: 5_000,
  });

  const { data: queues } = useQuery<Queue[]>({
    queryKey: ["queues"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/queues");
      const json = (await res.json()) as { data?: Queue[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 5_000,
  });

  const { data: nodes } = useQuery<NodeStats[]>({
    queryKey: ["nodes"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/nodes");
      const json = (await res.json()) as { data?: NodeStats[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 10_000,
  });

  const { reportError } = useConnectionError();
  useEffect(() => {
    if (ovErr) reportError();
  }, [ovErr, reportError]);

  // Append to rolling buffers on each overview update
  useEffect(() => {
    if (!overview) return;
    publishBuf.current = appendPoint(publishBuf.current, overview.message_stats?.publish_details?.rate ?? 0);
    ackBuf.current     = appendPoint(ackBuf.current, overview.message_stats?.ack_details?.rate ?? 0);
    setTick((t) => t + 1);
  }, [overview]);

  // Top 5 queues by message depth for sparklines
  const top5 = (queues ?? [])
    .filter((q) => (q.messages ?? 0) > 0)
    .sort((a, b) => (b.messages ?? 0) - (a.messages ?? 0))
    .slice(0, 5);

  void tick; // suppress unused variable warning

  const totals = overview?.object_totals;
  const msgStats = overview?.message_stats;

  return (
    <div className="space-y-6">

      {/* ── stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Connections" value={totals?.connections ?? "—"} href="/connections" />
        <StatCard label="Channels" value={totals?.channels ?? "—"} href="/channels" />
        <StatCard label="Exchanges" value={totals?.exchanges ?? "—"} href="/exchanges" />
        <StatCard label="Queues" value={totals?.queues ?? "—"} href="/queues" />
        <StatCard label="Consumers" value={totals?.consumers ?? "—"} href="/connections" />
      </div>

      {/* ── charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* message rates chart */}
        <div className="bg-card border rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-1">
            <h3 className="font-semibold">Message Rates</h3>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                Publish
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                Ack
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {msgStats?.publish_details?.rate !== undefined
              ? `${msgStats.publish_details.rate.toFixed(1)}/s publish · ${(msgStats?.ack_details?.rate ?? 0).toFixed(1)}/s ack`
              : "Waiting for data…"}
          </p>
          <div className="h-40 border-l border-b border-border relative">
            <Sparkline
              series={[
                { label: "Publish", points: publishBuf.current },
                { label: "Ack",    points: ackBuf.current, color: "#f59e0b" },
              ]}
            />
            {publishBuf.current.length < 2 && (
              <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                Collecting data…
              </p>
            )}
          </div>
        </div>

        {/* top queue depths */}
        <div className="bg-card border rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-1">
            <h3 className="font-semibold">Queue Depth</h3>
            <span className="text-xs text-muted-foreground">Top 5 by message count</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {(overview?.queue_totals?.messages ?? 0).toLocaleString()} total messages
          </p>
          {top5.length === 0 ? (
            <div className="h-40 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No queues with messages</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {top5.map((q, i) => {
                const max = top5[0].messages ?? 1;
                const pct = ((q.messages ?? 0) / max) * 100;
                const COLORS = ["bg-primary", "bg-violet-500", "bg-amber-500", "bg-emerald-500", "bg-cyan-500"];
                return (
                  <div key={`${q.vhost}/${q.name}`}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-mono truncate max-w-[200px]" title={q.name}>{q.name}</span>
                      <span className="text-muted-foreground ml-2">{(q.messages ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${COLORS[i]}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── nodes table ── */}
      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="font-semibold">Nodes Status</h3>
          {nodes && nodes.every((n) => n.running) && (
            <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium rounded">
              All nodes healthy
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-3">Node Name</th>
                <th className="px-6 py-3">File Descriptors</th>
                <th className="px-6 py-3">Sockets</th>
                <th className="px-6 py-3">Erlang Processes</th>
                <th className="px-6 py-3">Memory</th>
                <th className="px-6 py-3">Disk Free</th>
                <th className="px-6 py-3 text-right">Uptime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!nodes ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : nodes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-muted-foreground">
                    No nodes found
                  </td>
                </tr>
              ) : (
                nodes.map((node) => (
                  <tr key={node.name} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${node.running ? "bg-emerald-500" : "bg-red-500"}`}
                      />
                      {node.name}
                    </td>
                    <td className="px-6 py-4">
                      <Bar used={node.fd_used} total={node.fd_total} />
                    </td>
                    <td className="px-6 py-4">
                      <Bar used={node.sockets_used} total={node.sockets_total} />
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {fmtNum(node.proc_used)}/{fmtNum(node.proc_total)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-muted px-1.5 py-0.5 rounded text-xs font-medium">
                        {fmtBytes(node.mem_used)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        {fmtBytes(node.mem_limit)} limit
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-emerald-600 dark:text-emerald-400">
                      {fmtBytes(node.disk_free)} free
                    </td>
                    <td className="px-6 py-4 text-right text-muted-foreground">
                      {fmtUptime(node.uptime)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── bottom row: ports + system status ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* listening ports */}
        <div className="bg-card border rounded-lg p-5">
          <h4 className="text-sm font-semibold mb-4">Listening Ports</h4>
          <div className="space-y-2.5">
            {overview?.listeners
              ? overview.listeners.map((l) => (
                  <div key={`${l.protocol}-${l.port}`} className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground capitalize">{l.protocol.replace(/-[0-9]+$/, "")}</span>
                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{l.port}</span>
                  </div>
                ))
              : [
                  { label: "AMQP", port: 5672 },
                  { label: "Management", port: 15672 },
                ].map((l) => (
                  <div key={l.label} className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{l.label}</span>
                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{l.port}</span>
                  </div>
                ))}
          </div>
        </div>

        {/* system status */}
        <div className="bg-card border rounded-lg p-5">
          <h4 className="text-sm font-semibold mb-4">System Status</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Erlang Version</p>
              <p className="text-sm font-medium">{overview?.erlang_version ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">RabbitMQ Version</p>
              <p className="text-sm font-medium">{overview?.rabbitmq_version ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cluster</p>
              <p className="text-sm font-medium truncate">{overview?.cluster_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Node</p>
              <p className="text-sm font-medium truncate">{overview?.node ?? "—"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
