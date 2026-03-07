# Topology Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Live topology graph showing exchanges → bindings → queues with always-on rate-based edge animation and opt-in per-vhost firehose tracing that animates individual messages as glowing particles travelling through the graph.

**Architecture:** ReactFlow (`@xyflow/react`) graph with dagre auto-layout. Rate animation via CSS on custom edge SVG. Firehose via SSE: Next.js API route connects to `amq.rabbitmq.trace` exchange using existing `amqplib` dep and streams events; browser animates per-message particles via `requestAnimationFrame`. Two orthogonal features: rate pulse (always on, polling-based) and firehose trace (toggle, SSE-based).

**Tech Stack:** `@xyflow/react` v12, `dagre`, `@types/dagre`, `amqplib` (already installed), Next.js SSE route, Tailwind CSS

---

### Task 1: Install deps + types

**Files:**
- Run: `pnpm add @xyflow/react dagre`
- Run: `pnpm add -D @types/dagre`
- Modify: `lib/types.ts`

**Step 1: Install**
```bash
cd /Users/e/dev/agdir/rask && pnpm add @xyflow/react dagre && pnpm add -D @types/dagre
```

**Step 2: Add TraceEvent to lib/types.ts**

Append after existing interfaces:

```ts
export interface TraceEvent {
  type: "publish" | "deliver" | "drop";
  exchange: string;
  queue?: string;          // present on deliver
  routingKey: string;
  vhost: string;
  payload: string;
  payloadEncoding: "string" | "base64";
  properties: Record<string, unknown>;
  timestamp: number;       // ms epoch
}
```

**Step 3: Build check**
```bash
pnpm tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**
```bash
git add lib/types.ts package.json pnpm-lock.yaml
git commit -m "feat(topology): install @xyflow/react + dagre, add TraceEvent type"
```

---

### Task 2: API routes — topology data + trace on/off

**Files:**
- Create: `app/api/rabbitmq/topology/route.ts`
- Create: `app/api/rabbitmq/vhosts/[name]/trace-on/route.ts`
- Create: `app/api/rabbitmq/vhosts/[name]/trace-off/route.ts`

**Step 1: Topology data route**

`app/api/rabbitmq/topology/route.ts` — combines exchanges, queues, bindings in one call:

```ts
import { NextResponse } from "next/server";
import { getExchanges, getQueues, getBindings } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const [exchanges, queues, bindings] = await Promise.all([
      getExchanges(),
      getQueues(),
      getBindings(),
    ]);
    return NextResponse.json({ data: { exchanges, queues, bindings } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch topology";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

**Step 2: Trace on/off routes**

`app/api/rabbitmq/vhosts/[name]/trace-on/route.ts`:
```ts
import { NextResponse } from "next/server";
import { setVhostTracing } from "@/lib/rabbitmq";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    await setVhostTracing(name, true);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enable tracing";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

`app/api/rabbitmq/vhosts/[name]/trace-off/route.ts`:
```ts
import { NextResponse } from "next/server";
import { setVhostTracing } from "@/lib/rabbitmq";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    await setVhostTracing(name, false);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to disable tracing";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

Note: `setVhostTracing` already exists in `lib/rabbitmq.ts`.

**Step 3: Build check**
```bash
pnpm tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**
```bash
git add app/api/rabbitmq/topology/ app/api/rabbitmq/vhosts/
git commit -m "feat(topology): topology data route + vhost trace-on/trace-off routes"
```

---

### Task 3: SSE trace streaming endpoint

**Files:**
- Create: `app/api/rabbitmq/trace/stream/route.ts`

This is the most complex API route. It:
1. Connects to RabbitMQ via AMQP using existing config
2. Enables a temp exclusive queue bound to `amq.rabbitmq.trace` (firehose exchange)
3. Consumes messages and parses them into `TraceEvent`
4. Streams as SSE to the browser
5. Cleans up (cancel consumer, close channel/connection) when the request is aborted

```ts
import { NextRequest } from "next/server";
import { getConnectionConfig } from "@/lib/env";
import type { TraceEvent } from "@/lib/types";
import * as amqp from "amqplib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const vhost = req.nextUrl.searchParams.get("vhost") ?? "/";
  const config = getConnectionConfig();

  const encoder = new TextEncoder();
  let connection: amqp.Connection | null = null;
  let channel: amqp.Channel | null = null;
  let consumerTag: string | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: TraceEvent) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          closed = true;
        }
      }

      function sendHeartbeat() {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          closed = true;
        }
      }

      try {
        const amqpUrl = `amqp://${config.user}:${encodeURIComponent(config.password)}@${config.host}:${config.amqpPort}/${encodeURIComponent(vhost)}`;
        connection = await amqp.connect(amqpUrl);
        channel = await connection.createChannel();

        // Declare temp exclusive queue bound to the firehose exchange
        const q = await channel.assertQueue("", { exclusive: true, autoDelete: true });
        await channel.bindQueue(q.queue, "amq.rabbitmq.trace", "#");

        const result = await channel.consume(q.queue, (msg) => {
          if (!msg || closed) return;
          try {
            const routingKey = msg.fields.routingKey; // "publish.{exchange}" or "deliver.{queue}"
            const isPublish = routingKey.startsWith("publish.");
            const isDeliver = routingKey.startsWith("deliver.");

            const headers = (msg.properties.headers ?? {}) as Record<string, unknown>;
            const exchangeName = (headers["exchange_name"] as Buffer | string | undefined);
            const exchange = Buffer.isBuffer(exchangeName) ? exchangeName.toString() : (exchangeName ?? "");
            const routingKeys = headers["routing_keys"] as unknown[] | undefined;
            const rk = Array.isArray(routingKeys) && routingKeys.length > 0
              ? (Buffer.isBuffer(routingKeys[0]) ? (routingKeys[0] as Buffer).toString() : String(routingKeys[0]))
              : msg.fields.routingKey;

            let payload = "";
            let payloadEncoding: "string" | "base64" = "string";
            try {
              payload = msg.content.toString("utf-8");
            } catch {
              payload = msg.content.toString("base64");
              payloadEncoding = "base64";
            }

            const event: TraceEvent = {
              type: isPublish ? "publish" : isDeliver ? "deliver" : "drop",
              exchange,
              queue: isDeliver ? routingKey.slice("deliver.".length) : undefined,
              routingKey: rk,
              vhost,
              payload: payload.slice(0, 512), // truncate large payloads
              payloadEncoding,
              properties: msg.properties as Record<string, unknown>,
              timestamp: Date.now(),
            };
            send(event);
          } catch {
            // malformed trace message — skip
          }
          channel?.ack(msg);
        });

        consumerTag = result.consumerTag;

        // Heartbeat every 15s to keep SSE alive
        const heartbeatInterval = setInterval(sendHeartbeat, 15_000);

        req.signal.addEventListener("abort", async () => {
          closed = true;
          clearInterval(heartbeatInterval);
          try {
            if (consumerTag && channel) await channel.cancel(consumerTag);
            if (channel) await channel.close();
            if (connection) await connection.close();
          } catch { /* already closed */ }
          try { controller.close(); } catch { /* already closed */ }
        });

      } catch (err) {
        const msg = err instanceof Error ? err.message : "AMQP connection failed";
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`));
        closed = true;
        try { controller.close(); } catch { /* ignore */ }
      }
    },

    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
```

**Step 2: Build check**
```bash
pnpm tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**
```bash
git add app/api/rabbitmq/trace/
git commit -m "feat(topology): SSE firehose stream endpoint via amqplib"
```

---

### Task 4: Topology page

**Files:**
- Create: `app/(app)/topology/page.tsx`
- Modify: `components/layout/sidebar.tsx` (add Topology link)

This is the main deliverable. Write it exactly as specified below.

**Step 1: Add to sidebar**

In `components/layout/sidebar.tsx`, add `{ href: "/topology", label: "Topology", icon: Network }` after Exchanges. Import `Network` from `lucide-react`.

**Step 2: Create the topology page**

`app/(app)/topology/page.tsx`:

```tsx
"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  Handle,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  getBezierPath,
  BaseEdge,
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

type ExchangeNodeData = { label: string; exchangeType: string; rate: number; vhost: string };
type QueueNodeData    = { label: string; messages: number; consumers: number; state: string; rate: number; vhost: string };

function ExchangeNode({ data, selected }: NodeProps) {
  const d = data as ExchangeNodeData;
  const isDefault = d.label === "(default)";
  return (
    <div className={`relative flex flex-col justify-center px-3 py-2 rounded-lg border-2 text-xs w-[200px] h-[60px] transition-all
      ${selected ? "border-violet-500 shadow-lg shadow-violet-500/20" : "border-violet-300 dark:border-violet-700"}
      bg-violet-50 dark:bg-violet-950/50`}>
      <Handle type="target" position={Position.Left} className="!bg-violet-400" />
      <div className="font-mono font-semibold text-violet-900 dark:text-violet-300 truncate" title={d.label}>
        {isDefault ? <span className="italic text-violet-500">(default)</span> : d.label}
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-violet-500 text-[10px] uppercase">{d.exchangeType}</span>
        {d.rate > 0 && (
          <span className="text-emerald-500 text-[10px]">↑ {d.rate.toFixed(1)}/s</span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-violet-400" />
    </div>
  );
}

function QueueNode({ data, selected }: NodeProps) {
  const d = data as QueueNodeData;
  const noConsumers = d.consumers === 0 && d.messages > 0;
  const isCritical  = d.state === "crashed" || d.state === "stopped" || noConsumers;
  return (
    <div className={`relative flex flex-col justify-center px-3 py-2 rounded-lg border-2 text-xs w-[200px] h-[60px] transition-all
      ${selected ? "shadow-lg" : ""}
      ${isCritical
        ? "border-rose-400 bg-rose-50 dark:bg-rose-950/50 shadow-rose-500/20"
        : "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50"}`}>
      <Handle type="target" position={Position.Left} className={isCritical ? "!bg-rose-400" : "!bg-blue-400"} />
      <div className={`font-mono font-semibold truncate ${isCritical ? "text-rose-900 dark:text-rose-300" : "text-blue-900 dark:text-blue-300"}`} title={d.label}>
        {d.label}
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className={`text-[10px] ${noConsumers ? "text-rose-500 font-semibold" : "text-blue-500"}`}>
          {d.messages > 0 ? `${d.messages} msg` : "empty"}
        </span>
        <span className={`text-[10px] ${noConsumers ? "text-rose-500" : "text-muted-foreground"}`}>
          {d.consumers} consumer{d.consumers !== 1 ? "s" : ""}
        </span>
        {d.rate > 0 && <span className="text-emerald-500 text-[10px]">↑ {d.rate.toFixed(1)}/s</span>}
      </div>
      <Handle type="source" position={Position.Right} className={isCritical ? "!bg-rose-400" : "!bg-blue-400"} />
    </div>
  );
}

// ── animated edge ─────────────────────────────────────────────────────────────

type AnimatedEdgeData = { rate: number; particles: Particle[] };

interface Particle {
  id: string;
  progress: number; // 0–1
  color: string;
}

function AnimatedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const d = data as AnimatedEdgeData | undefined;
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  const rate = d?.rate ?? 0;
  const particles = d?.particles ?? [];

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: rate > 0 ? "#8b5cf6" : "#94a3b8", strokeWidth: rate > 0 ? 2 : 1, opacity: 0.6 }} />
      {/* rate-based flow animation */}
      {rate > 0 && (
        <circle r="4" fill="#8b5cf6" opacity="0.8">
          <animateMotion dur={`${Math.max(0.5, 3 / rate)}s`} repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      {/* firehose particles */}
      {particles.map((p) => (
        <circle key={p.id} r="5" fill={p.color} opacity="0.9" filter="url(#glow)">
          <animateMotion
            dur="1.2s"
            begin={`${-(p.progress * 1.2)}s`}
            repeatCount="1"
            fill="freeze"
            path={edgePath}
          />
        </circle>
      ))}
    </>
  );
}

const nodeTypes = { exchange: ExchangeNode, queue: QueueNode };
const edgeTypes = { animated: AnimatedEdge };

// ── trace feed panel ──────────────────────────────────────────────────────────

function TraceFeedPanel({ events, onClear }: { events: TraceEvent[]; onClear: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Trace Feed</span>
        <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
      </div>
      <div className="flex-1 overflow-y-auto text-xs font-mono">
        {events.length === 0 ? (
          <p className="p-3 text-muted-foreground italic">Waiting for messages…</p>
        ) : (
          events.map((e, i) => (
            <div key={i} className={`px-3 py-2 border-b hover:bg-muted/30 ${e.type === "publish" ? "border-l-2 border-l-violet-400" : "border-l-2 border-l-emerald-400"}`}>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-0.5">
                <span className={e.type === "publish" ? "text-violet-500" : "text-emerald-500"}>{e.type}</span>
                <span>{new Date(e.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="text-foreground truncate">{e.exchange || "(default)"} → {e.queue ?? e.routingKey}</div>
              <div className="text-muted-foreground truncate mt-0.5">{e.payload.slice(0, 80)}{e.payload.length > 80 ? "…" : ""}</div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

interface TopologyData {
  exchanges: Exchange[];
  queues: Queue[];
  bindings: Binding[];
}

export default function TopologyPage() {
  const [vhostFilter, setVhostFilter] = useState("all");
  const [tracing, setTracing]         = useState(false);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [traceError, setTraceError]   = useState<string | null>(null);
  const [showFeed, setShowFeed]       = useState(true);
  const [particles, setParticles]     = useState<Map<string, Particle[]>>(new Map());
  const eventSourceRef                = useRef<EventSource | null>(null);

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
    () => Array.from(new Set(data?.queues.map((q) => q.vhost) ?? [])).sort(),
    [data],
  );

  // Build graph whenever data or filter changes
  useEffect(() => {
    if (!data) return;

    const vhost = vhostFilter === "all" ? null : vhostFilter;

    const filteredExchanges = data.exchanges.filter((e) => !vhost || e.vhost === vhost);
    const filteredQueues    = data.queues.filter((q) => !vhost || q.vhost === vhost);
    const filteredBindings  = data.bindings.filter((b) => !vhost || b.vhost === vhost);

    const rawNodes: Node[] = [
      ...filteredExchanges.map((e) => ({
        id: `exchange:${e.vhost}:${e.name}`,
        type: "exchange" as const,
        position: { x: 0, y: 0 },
        data: {
          label: e.name || "(default)",
          exchangeType: e.type,
          rate: e.message_stats?.publish_details?.rate ?? 0,
          vhost: e.vhost,
        } satisfies ExchangeNodeData,
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
          vhost: q.vhost,
        } satisfies QueueNodeData,
      })),
    ];

    const rawEdges: Edge[] = filteredBindings
      .filter((b) => b.destination_type === "queue")
      .map((b) => ({
        id: `binding:${b.vhost}:${b.source}:${b.destination}:${b.routing_key}`,
        source: `exchange:${b.vhost}:${b.source}`,
        target: `queue:${b.vhost}:${b.destination}`,
        type: "animated",
        label: b.routing_key || undefined,
        labelStyle: { fontSize: 9, fill: "#94a3b8" },
        data: {
          rate: data.exchanges.find((e) => e.vhost === b.vhost && e.name === b.source)
            ?.message_stats?.publish_details?.rate ?? 0,
          particles: particles.get(`exchange:${b.vhost}:${b.source}`) ?? [],
        } satisfies AnimatedEdgeData,
      }));

    const { nodes: laid, edges: laidEdges } = layoutGraph(rawNodes, rawEdges);
    setNodes(laid);
    setEdges(laidEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, vhostFilter, particles]);

  // Firehose SSE
  const startTrace = useCallback(async () => {
    const vhost = vhostFilter === "all" ? "/" : vhostFilter;
    setTraceError(null);

    try {
      await fetch(`/api/rabbitmq/vhosts/${encodeURIComponent(vhost)}/trace-on`, { method: "POST" });
    } catch {
      setTraceError("Failed to enable tracing on broker");
      return;
    }

    const es = new EventSource(`/api/rabbitmq/trace/stream?vhost=${encodeURIComponent(vhost)}`);
    eventSourceRef.current = es;

    es.addEventListener("error", (e) => {
      if ((e as MessageEvent).data) {
        try {
          const parsed = JSON.parse((e as MessageEvent).data) as { error: string };
          setTraceError(parsed.error);
        } catch { /* ignore */ }
      }
    });

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as TraceEvent;
        setTraceEvents((prev) => [...prev.slice(-199), event]);

        // Spawn particle on the relevant edges
        const exchangeId = `exchange:${event.vhost}:${event.exchange}`;
        const particleId = Math.random().toString(36).slice(2);
        const color = event.type === "publish" ? "#8b5cf6" : "#10b981";

        setParticles((prev) => {
          const next = new Map(prev);
          const existing = next.get(exchangeId) ?? [];
          next.set(exchangeId, [...existing.slice(-4), { id: particleId, progress: 0, color }]);
          // Remove after animation completes
          setTimeout(() => {
            setParticles((p) => {
              const m = new Map(p);
              const arr = m.get(exchangeId)?.filter((x) => x.id !== particleId) ?? [];
              if (arr.length === 0) m.delete(exchangeId); else m.set(exchangeId, arr);
              return m;
            });
          }, 1400);
          return next;
        });
      } catch { /* malformed event */ }
    };

    setTracing(true);
  }, [vhostFilter]);

  const stopTrace = useCallback(async () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setTracing(false);
    setParticles(new Map());
    const vhost = vhostFilter === "all" ? "/" : vhostFilter;
    try {
      await fetch(`/api/rabbitmq/vhosts/${encodeURIComponent(vhost)}/trace-off`, { method: "POST" });
    } catch { /* best effort */ }
  }, [vhostFilter]);

  useEffect(() => () => { eventSourceRef.current?.close(); }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h1 className="text-2xl font-bold tracking-tight">Topology</h1>

        <select
          value={vhostFilter}
          onChange={(e) => { setVhostFilter(e.target.value); if (tracing) void stopTrace(); }}
          className="bg-background border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">All vhosts</option>
          {vhosts.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        {!tracing ? (
          <button
            onClick={() => void startTrace()}
            className="flex items-center gap-2 px-4 py-1.5 bg-violet-600 text-white rounded-md text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-white/70" />
            Start Tracing
          </button>
        ) : (
          <button
            onClick={() => void stopTrace()}
            className="flex items-center gap-2 px-4 py-1.5 bg-rose-600 text-white rounded-md text-sm font-medium hover:bg-rose-700 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            Stop Tracing
          </button>
        )}

        {tracing && (
          <button
            onClick={() => setShowFeed((v) => !v)}
            className="px-3 py-1.5 border rounded-md text-sm hover:bg-muted transition-colors"
          >
            {showFeed ? "Hide feed" : "Show feed"}
          </button>
        )}

        {traceError && (
          <span className="text-sm text-destructive">{traceError}</span>
        )}

        {isError && (
          <span className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load topology"}
          </span>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-violet-200 border border-violet-300 inline-block" /> Exchange</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200 border border-blue-300 inline-block" /> Queue</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-200 border border-rose-300 inline-block" /> No consumer</span>
        </div>
      </div>

      {/* tracing overhead warning */}
      {tracing && (
        <div className="flex gap-2 items-start p-2.5 mb-3 rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-900/10 text-xs text-amber-700 dark:text-amber-400">
          <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
          </svg>
          <span>
            <strong>Firehose active</strong> — RabbitMQ is duplicating every message for tracing.
            This adds CPU and memory overhead to the broker. Stop tracing when done.
          </span>
        </div>
      )}

      {/* graph + feed */}
      <div className="flex flex-1 min-h-0 gap-3">
        <div className="flex-1 rounded-lg border overflow-hidden bg-card">
          {/* SVG defs for glow filter */}
          <svg width="0" height="0" className="absolute">
            <defs>
              <filter id="glow">
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
          >
            <Background />
            <Controls />
            <MiniMap nodeColor={(n) => n.type === "exchange" ? "#8b5cf6" : "#3b82f6"} />
          </ReactFlow>
        </div>

        {tracing && showFeed && (
          <div className="w-72 rounded-lg border bg-card overflow-hidden flex flex-col">
            <TraceFeedPanel events={traceEvents} onClear={() => setTraceEvents([])} />
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Build check**
```bash
pnpm tsc --noEmit 2>&1 | head -40
```

Fix any TypeScript errors (likely: `Exchange` type may not have `vhost` — check the interface; if not present, filter bindings by comparing exchange name only).

**Step 4: Commit**
```bash
git add "app/(app)/topology/" components/layout/sidebar.tsx
git commit -m "feat(topology): topology graph with rate animation + firehose trace particles"
```

---

### Task 5: Final build verification

**Step 1:**
```bash
pnpm build 2>&1 | tail -20
```
Expected: `/topology` appears in build output, zero errors.

**Step 2: Final commit if any fixes**
```bash
git add -A && git commit -m "fix(topology): build fixes" --allow-empty
```
