"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Position,
  Handle,
  getBezierPath,
  BaseEdge,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import type { Exchange, Queue, Binding, TraceEvent } from "@/lib/types";

// ── layout ────────────────────────────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 60;

function layoutGraph(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 120, nodesep: 40 });
  for (const node of nodes) g.setNode(node.id, { width: NODE_W, height: NODE_H });
  for (const edge of edges) g.setEdge(edge.source, edge.target);
  dagre.layout(g);
  return {
    nodes: nodes.map((node) => {
      const pos = g.node(node.id);
      return { ...node, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
    }),
    edges,
  };
}

// ── custom nodes ──────────────────────────────────────────────────────────────

type ExchangeNodeData = { label: string; exchangeType: string; rate: number; expanded: boolean };
type QueueNodeData = { label: string; messages: number; consumers: number; state: string; rate: number; expanded: boolean };

function ExchangeNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ExchangeNodeData;
  const { updateNode } = useReactFlow();

  function toggle() {
    updateNode(id, (n) => ({ data: { ...n.data, expanded: !(n.data as unknown as ExchangeNodeData).expanded } }));
  }

  return (
    <div
      onClick={toggle}
      className={`relative flex flex-col justify-center px-3 py-2 rounded-lg border-2 text-xs w-[200px] cursor-pointer transition-all
        ${d.expanded ? "h-[60px]" : "h-[36px]"}
        ${selected ? "border-violet-500 shadow-lg shadow-violet-500/20" : "border-violet-300 dark:border-violet-700"}
        bg-violet-50 dark:bg-violet-950/50`}
    >
      <Handle type="target" position={Position.Left} style={{ background: "#8b5cf6" }} />
      <div className="font-mono font-semibold text-violet-900 dark:text-violet-300 truncate" title={d.label}>
        {d.label || <span className="italic text-violet-400">(default)</span>}
      </div>
      {d.expanded && (
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-violet-500 text-[10px] uppercase">{d.exchangeType}</span>
          {d.rate > 0 && <span className="text-emerald-500 text-[10px]">↑ {d.rate.toFixed(1)}/s</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: "#8b5cf6" }} />
    </div>
  );
}

function QueueNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as QueueNodeData;
  const { updateNode } = useReactFlow();
  const noConsumers = d.consumers === 0 && d.messages > 0;
  const isCritical = d.state === "crashed" || d.state === "stopped" || noConsumers;

  function toggle() {
    updateNode(id, (n) => ({ data: { ...n.data, expanded: !(n.data as unknown as QueueNodeData).expanded } }));
  }

  return (
    <div
      onClick={toggle}
      className={`relative flex flex-col justify-center px-3 py-2 rounded-lg border-2 text-xs w-[200px] cursor-pointer transition-all
        ${d.expanded ? "h-[60px]" : "h-[36px]"}
        ${isCritical
          ? "border-rose-400 bg-rose-50 dark:bg-rose-950/50" + (selected ? " shadow-lg shadow-rose-500/20" : "")
          : "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50" + (selected ? " shadow-lg shadow-blue-500/20" : "")}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: isCritical ? "#f87171" : "#60a5fa" }} />
      <div className={`font-mono font-semibold truncate ${isCritical ? "text-rose-900 dark:text-rose-300" : "text-blue-900 dark:text-blue-300"}`} title={d.label}>
        {d.label}
      </div>
      {d.expanded && (
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] ${noConsumers ? "text-rose-500 font-semibold" : "text-blue-500"}`}>
            {d.messages > 0 ? `${d.messages} msg` : "empty"}
          </span>
          <span className={`text-[10px] ${noConsumers ? "text-rose-500" : "text-muted-foreground"}`}>
            {d.consumers} consumer{d.consumers !== 1 ? "s" : ""}
          </span>
          {d.rate > 0 && <span className="text-emerald-500 text-[10px]">↑ {d.rate.toFixed(1)}/s</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: isCritical ? "#f87171" : "#60a5fa" }} />
    </div>
  );
}

// ── animated edge ─────────────────────────────────────────────────────────────

interface Particle { id: string; color: string }
type AnimatedEdgeData = { rate: number; particles: Particle[] };

function AnimatedEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const d = data as unknown as AnimatedEdgeData | undefined;
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const rate = d?.rate ?? 0;
  const particles = d?.particles ?? [];

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: rate > 0 ? "#8b5cf6" : "#94a3b8", strokeWidth: rate > 0 ? 2 : 1, opacity: 0.6 }} />
      {rate > 0 && (
        <circle r="4" fill="#8b5cf6" opacity="0.8">
          <animateMotion dur={`${Math.max(0.5, 3 / rate)}s`} repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      {particles.map((p) => (
        <circle key={p.id} r="5" fill={p.color} opacity="0.9" filter="url(#particle-glow)">
          <animateMotion dur="1.2s" repeatCount="1" fill="freeze" path={edgePath} />
        </circle>
      ))}
    </>
  );
}

const nodeTypes = { exchange: ExchangeNode, queue: QueueNode };
const edgeTypes = { animated: AnimatedEdge };

// ── trace feed ────────────────────────────────────────────────────────────────

function TraceFeedPanel({ events, onClear }: { events: TraceEvent[]; onClear: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [events.length]);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
          Trace Feed {events.length > 0 && <span className="ml-1 text-primary">{events.length}</span>}
        </span>
        <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
      </div>
      <div className="flex-1 overflow-y-auto text-xs font-mono">
        {events.length === 0 ? (
          <p className="p-3 text-muted-foreground italic">Waiting for messages…</p>
        ) : (
          events.map((e, i) => (
            <div key={i} className={`px-3 py-2 border-b hover:bg-muted/30 ${e.type === "publish" ? "border-l-2 border-l-violet-400" : "border-l-2 border-l-emerald-400"}`}>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-0.5">
                <span className={e.type === "publish" ? "text-violet-500 font-semibold" : "text-emerald-500 font-semibold"}>{e.type}</span>
                <span>{new Date(e.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="text-foreground truncate">
                {e.exchange || "(default)"}{e.queue ? ` → ${e.queue}` : ` key: ${e.routingKey}`}
              </div>
              <div className="text-muted-foreground truncate mt-0.5">{e.payload.slice(0, 80)}{e.payload.length > 80 ? "…" : ""}</div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

interface TopologyData { exchanges: Exchange[]; queues: Queue[]; bindings: Binding[] }

export default function TopologyPage() {
  const [vhostFilter, setVhostFilter]   = useState("all");
  const [tracing, setTracing]           = useState(false);
  const [traceEvents, setTraceEvents]   = useState<TraceEvent[]>([]);
  const [traceError, setTraceError]     = useState<string | null>(null);
  const [showFeed, setShowFeed]         = useState(true);
  const [particles, setParticles]       = useState<Map<string, Particle[]>>(new Map());
  const eventSourceRef                  = useRef<EventSource | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const { data, isError, error } = useQuery<TopologyData>({
    queryKey: ["topology"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/topology");
      const json = (await res.json()) as { data?: TopologyData; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data!;
    },
    refetchInterval: 5_000,
  });

  const vhosts = useMemo(
    () => Array.from(new Set([
      ...(data?.exchanges.map((e) => e.vhost) ?? []),
      ...(data?.queues.map((q) => q.vhost) ?? []),
      ...(data?.bindings.map((b) => b.vhost) ?? []),
    ])).sort(),
    [data],
  );

  // Rebuild graph on data/filter/particles change
  useEffect(() => {
    if (!data) return;
    const vhost = vhostFilter === "all" ? null : vhostFilter;

    const filteredExchanges = data.exchanges.filter((e) => !vhost || e.vhost === vhost);
    const filteredQueues    = data.queues.filter((q) => !vhost || q.vhost === vhost);
    const filteredBindings  = data.bindings.filter((b) => !vhost || b.vhost === vhost);

    const rawNodes: Node[] = [
      ...filteredExchanges.map((e) => ({
        id: `exchange::${e.name}`,
        type: "exchange" as const,
        position: { x: 0, y: 0 },
        data: {
          label: e.name || "(default)",
          exchangeType: e.type,
          rate: e.message_stats?.publish_details?.rate ?? 0,
          expanded: false,
        },
      })),
      ...filteredQueues.map((q) => ({
        id: `queue:${q.vhost}:${q.name}`,
        type: "queue" as const,
        position: { x: 0, y: 0 },
        data: {
          label: q.name,
          messages: q.messages ?? 0,
          consumers: q.consumers,
          state: q.state,
          rate: q.message_stats?.publish_details?.rate ?? 0,
          expanded: false,
        },
      })),
    ];

    const rawEdges: Edge[] = filteredBindings
      .filter((b) => b.destination_type === "queue")
      .map((b) => {
        const exchangeKey = `exchange::${b.source}`;
        return {
          id: `binding:${b.vhost}:${b.source}:${b.destination}:${b.routing_key}`,
          source: exchangeKey,
          target: `queue:${b.vhost}:${b.destination}`,
          type: "animated",
          label: b.routing_key || undefined,
          labelStyle: { fontSize: 9, fill: "#94a3b8" },
          data: {
            rate: data.exchanges.find((e) => e.name === b.source)
              ?.message_stats?.publish_details?.rate ?? 0,
            particles: particles.get(exchangeKey) ?? [],
          },
        };
      });

    const { nodes: laid, edges: laidEdges } = layoutGraph(rawNodes, rawEdges);
    setNodes((prev) => {
      const expandedById = new Map(prev.map((n) => [n.id, (n.data as Record<string, unknown>).expanded as boolean ?? false]));
      return laid.map((n) => ({ ...n, data: { ...n.data, expanded: expandedById.get(n.id) ?? false } }));
    });
    setEdges(laidEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, vhostFilter, particles]);

  const startTrace = useCallback(async () => {
    const vhost = vhostFilter === "all" ? "/" : vhostFilter;
    setTraceError(null);
    try {
      const res = await fetch(`/api/rabbitmq/vhosts/${encodeURIComponent(vhost)}/trace-on`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to enable tracing");
    } catch (e) {
      setTraceError(e instanceof Error ? e.message : "Failed to enable tracing");
      return;
    }
    const es = new EventSource(`/api/rabbitmq/trace/stream?vhost=${encodeURIComponent(vhost)}`);
    eventSourceRef.current = es;
    es.addEventListener("error", (e) => {
      const me = e as MessageEvent;
      if (me.data) {
        try { setTraceError((JSON.parse(me.data as string) as { error: string }).error); } catch { /* ignore */ }
      }
    });
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as TraceEvent;
        setTraceEvents((prev) => [...prev.slice(-199), event]);
        const exchangeKey = `exchange::${event.exchange}`;
        const pid = Math.random().toString(36).slice(2);
        const color = event.type === "publish" ? "#8b5cf6" : "#10b981";
        setParticles((prev) => {
          const next = new Map(prev);
          next.set(exchangeKey, [...(next.get(exchangeKey) ?? []).slice(-4), { id: pid, color }]);
          setTimeout(() => setParticles((p) => {
            const m = new Map(p);
            const arr = (m.get(exchangeKey) ?? []).filter((x) => x.id !== pid);
            if (arr.length === 0) m.delete(exchangeKey); else m.set(exchangeKey, arr);
            return m;
          }), 1400);
          return next;
        });
      } catch { /* skip */ }
    };
    setTracing(true);
  }, [vhostFilter]);

  const stopTrace = useCallback(async () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setTracing(false);
    setParticles(new Map());
    const vhost = vhostFilter === "all" ? "/" : vhostFilter;
    try { await fetch(`/api/rabbitmq/vhosts/${encodeURIComponent(vhost)}/trace-off`, { method: "POST" }); }
    catch { /* best effort */ }
  }, [vhostFilter]);

  useEffect(() => () => { eventSourceRef.current?.close(); }, []);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 8rem)" }}>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Select value={vhostFilter} onValueChange={(v) => { setVhostFilter(v); if (tracing) void stopTrace(); }}>
          <SelectTrigger className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vhosts</SelectItem>
            {vhosts.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        {!tracing ? (
          <button onClick={() => void startTrace()}
            className="flex items-center gap-2 px-4 py-1.5 bg-violet-600 text-white rounded-md text-sm font-medium hover:bg-violet-700 transition-colors">
            <span className="w-2 h-2 rounded-full bg-white/70" />
            Start Tracing
          </button>
        ) : (
          <button onClick={() => void stopTrace()}
            className="flex items-center gap-2 px-4 py-1.5 bg-rose-600 text-white rounded-md text-sm font-medium hover:bg-rose-700 transition-colors">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            Stop Tracing
          </button>
        )}

        {tracing && (
          <button onClick={() => setShowFeed((v) => !v)}
            className="px-3 py-1.5 border rounded-md text-sm hover:bg-muted transition-colors">
            {showFeed ? "Hide feed" : "Show feed"}
          </button>
        )}

        <button
          onClick={() => setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, expanded: true } })))}
          className="px-3 py-1.5 border rounded-md text-sm hover:bg-muted transition-colors"
        >
          Expand all
        </button>
        <button
          onClick={() => setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, expanded: false } })))}
          className="px-3 py-1.5 border rounded-md text-sm hover:bg-muted transition-colors"
        >
          Collapse all
        </button>

        {traceError && <span className="text-sm text-destructive">{traceError}</span>}
        {isError && <span className="text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load"}</span>}

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-violet-100 border border-violet-300 inline-block" /> Exchange</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300 inline-block" /> Queue</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-100 border border-rose-300 inline-block" /> No consumer</span>
        </div>
      </div>

      {/* overhead warning */}
      {tracing && (
        <div className="flex gap-2 items-start p-2.5 mb-3 rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-900/10 text-xs text-amber-700 dark:text-amber-400">
          <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
          </svg>
          <span><strong>Firehose active</strong> — RabbitMQ duplicates every message for tracing. This adds CPU and memory overhead. Stop tracing when done.</span>
        </div>
      )}

      {/* graph + feed */}
      <div className="flex flex-1 min-h-0 gap-3">
        <div className="flex-1 rounded-lg border overflow-hidden bg-card">
          <svg width="0" height="0" style={{ position: "absolute" }}>
            <defs>
              <filter id="particle-glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
          </svg>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            colorMode="system"
          >
            <Background />
            <Controls />
            <MiniMap nodeColor={(n) => n.type === "exchange" ? "#8b5cf6" : "#3b82f6"} maskColor="rgba(0,0,0,0.1)" />
          </ReactFlow>
        </div>

        {tracing && showFeed && (
          <div className="w-72 rounded-lg border bg-card overflow-hidden flex flex-col shrink-0">
            <TraceFeedPanel events={traceEvents} onClear={() => setTraceEvents([])} />
          </div>
        )}
      </div>
    </div>
  );
}
