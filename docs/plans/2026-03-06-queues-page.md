# Queues Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the basic queues table with a full-featured page: summary bar, filters, critical row highlighting, and a detail drawer with consumer list, message inspector, publish form, purge, and delete.

**Architecture:** Follows the established connections page pattern (`app/(app)/connections/page.tsx`) — single-file component with inline sub-components, React Query for data fetching with 5s auto-refresh, slide-in detail drawer. New API routes delegate to new `lib/rabbitmq.ts` functions that call the RabbitMQ Management HTTP API.

**Tech Stack:** Next.js 15 App Router, React Query (`@tanstack/react-query`), Tailwind CSS, inline custom components (no shadcn Table — see connections page pattern)

---

### Task 1: Extend types

**Files:**
- Modify: `lib/types.ts`

**Step 1: Add `type` to Queue and new helper types**

Add these to `lib/types.ts` (after the existing `Queue` interface):

```ts
// In the Queue interface, add:
//   type: "classic" | "quorum" | "stream";
//   consumer_details?: ConsumerDetail[];

export interface ConsumerDetail {
  consumer_tag: string;
  channel_details: {
    name: string;
    peer_host?: string;
    peer_port?: number;
    connection_name?: string;
  };
  ack_required: boolean;
  prefetch_count: number;
  exclusive: boolean;
  arguments?: Record<string, unknown>;
}

export interface QueueMessage {
  payload: string;
  payload_encoding: "string" | "base64";
  routing_key: string;
  exchange: string;
  redelivered: boolean;
  properties: {
    content_type?: string;
    content_encoding?: string;
    headers?: Record<string, unknown>;
    delivery_mode?: number;
    priority?: number;
    correlation_id?: string;
    reply_to?: string;
    expiration?: string;
    message_id?: string;
    timestamp?: number;
    type?: string;
    app_id?: string;
  };
  message_count: number; // messages remaining after this one
}
```

Also add `type: "classic" | "quorum" | "stream"` to the Queue interface.

**Step 2: Build check**

```bash
cd /Users/e/dev/agdir/rask && pnpm tsc --noEmit 2>&1 | head -20
```
Expected: no errors (or only pre-existing ones unrelated to Queue type)

**Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(queues): add type field and consumer/message types"
```

---

### Task 2: Add rabbitmq.ts functions

**Files:**
- Modify: `lib/rabbitmq.ts`

**Step 1: Add queue operation functions**

Append to `lib/rabbitmq.ts`:

```ts
import type { ..., ConsumerDetail, QueueMessage } from "./types";

// ── queue operations ──────────────────────────────────────────────────────────

export async function getQueueConsumers(vhost: string, name: string): Promise<ConsumerDetail[]> {
  // /api/consumers returns all consumers; filter by vhost+queue
  const all = await rabbitFetch<Array<ConsumerDetail & { queue: { name: string; vhost: string } }>>("/consumers");
  return all
    .filter((c) => c.queue.vhost === vhost && c.queue.name === name)
    .map(({ queue: _q, ...rest }) => rest as ConsumerDetail);
}

export async function purgeQueue(vhost: string, name: string): Promise<void> {
  await rabbitFetch<void>(
    `/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}/contents`,
    { method: "DELETE" },
  );
}

export async function deleteQueue(vhost: string, name: string): Promise<void> {
  await rabbitFetch<void>(
    `/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
}

export async function getQueueMessages(
  vhost: string,
  name: string,
  count: number,
): Promise<QueueMessage[]> {
  return rabbitFetch<QueueMessage[]>(
    `/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}/get`,
    {
      method: "POST",
      body: JSON.stringify({
        count,
        ackmode: "ack_requeue_true",  // non-destructive peek
        encoding: "auto",
        truncate: 50000,
      }),
    },
  );
}

export async function publishToQueue(
  vhost: string,
  name: string,
  payload: {
    routing_key: string;
    payload: string;
    payload_encoding: "string" | "base64";
    properties: {
      content_type?: string;
      delivery_mode?: number;
      headers?: Record<string, unknown>;
    };
  },
): Promise<{ routed: boolean }> {
  // Publishing goes through the default exchange "" with routing_key = queue name
  return rabbitFetch<{ routed: boolean }>(
    `/exchanges/${encodeURIComponent(vhost)}/%2F/publish`,
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        routing_key: name, // always route to this queue via default exchange
      }),
    },
  );
}
```

**Step 2: Build check**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add lib/rabbitmq.ts lib/types.ts
git commit -m "feat(queues): add purge/delete/peek/publish/consumers to rabbitmq lib"
```

---

### Task 3: API routes — delete, purge, get messages, publish

**Files:**
- Create: `app/api/rabbitmq/queues/[vhost]/[name]/route.ts`
- Create: `app/api/rabbitmq/queues/[vhost]/[name]/purge/route.ts`
- Create: `app/api/rabbitmq/queues/[vhost]/[name]/get/route.ts`
- Create: `app/api/rabbitmq/queues/[vhost]/[name]/publish/route.ts`

**Step 1: Delete queue route**

`app/api/rabbitmq/queues/[vhost]/[name]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { deleteQueue } from "@/lib/rabbitmq";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    await deleteQueue(vhost, name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete queue";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

**Step 2: Purge route**

`app/api/rabbitmq/queues/[vhost]/[name]/purge/route.ts`:

```ts
import { NextResponse } from "next/server";
import { purgeQueue } from "@/lib/rabbitmq";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    await purgeQueue(vhost, name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to purge queue";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

**Step 3: Get messages (peek) route**

`app/api/rabbitmq/queues/[vhost]/[name]/get/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getQueueMessages } from "@/lib/rabbitmq";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    const body = (await req.json()) as { count?: number };
    const count = Math.min(Math.max(1, body.count ?? 10), 100);
    const messages = await getQueueMessages(vhost, name, count);
    return NextResponse.json({ data: messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get messages";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

**Step 4: Publish route**

`app/api/rabbitmq/queues/[vhost]/[name]/publish/route.ts`:

```ts
import { NextResponse } from "next/server";
import { publishToQueue } from "@/lib/rabbitmq";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    const body = await req.json() as {
      payload: string;
      content_type?: string;
      persistent?: boolean;
      headers?: Record<string, unknown>;
    };
    const result = await publishToQueue(vhost, name, {
      routing_key: name,
      payload: body.payload,
      payload_encoding: "string",
      properties: {
        content_type: body.content_type ?? "text/plain",
        delivery_mode: body.persistent ? 2 : 1,
        headers: body.headers,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish message";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

**Step 5: Build check**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

**Step 6: Commit**

```bash
git add app/api/rabbitmq/queues/
git commit -m "feat(queues): add delete/purge/peek/publish API routes"
```

---

### Task 4: Rewrite the queues page

**Files:**
- Modify: `app/(app)/queues/page.tsx`

This is the main task. Write the full page following the `connections/page.tsx` pattern exactly.

**Step 1: Write the full page**

Replace `app/(app)/queues/page.tsx` with:

```tsx
"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Queue, ConsumerDetail, QueueMessage } from "@/lib/types";

// ── formatters ────────────────────────────────────────────────────────────────

function fmtCount(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function fmtRate(rate: number | undefined): string {
  if (rate === undefined || rate === 0) return "0/s";
  return rate.toFixed(1) + "/s";
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(2) + " GiB";
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + " MiB";
  if (bytes >= 1_024) return (bytes / 1_024).toFixed(1) + " KiB";
  return bytes + " B";
}

function getArg<T>(args: Record<string, unknown>, key: string): T | undefined {
  return args[key] as T | undefined;
}

// ── badges ────────────────────────────────────────────────────────────────────

const STATE_STYLES: Record<string, string> = {
  running: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
  idle:    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  stopped: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400",
  crashed: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400",
  flow:    "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
};

const TYPE_STYLES: Record<string, string> = {
  classic: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  quorum:  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  stream:  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
};

function StateBadge({ state }: { state: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATE_STYLES[state] ?? "bg-muted text-muted-foreground border-border"}`}>
      {state}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium uppercase ${TYPE_STYLES[type] ?? "bg-muted text-muted-foreground"}`}>
      {type}
    </span>
  );
}

function DlxIcon({ exchange }: { exchange: string }) {
  return (
    <span title={`Dead letter exchange: ${exchange}`} className="ml-1 cursor-help">
      <svg className="inline w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none">
        <title>DLX: {exchange}</title>
        <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
      </svg>
    </span>
  );
}

// ── summary card ──────────────────────────────────────────────────────────────

function SumCard({ label, value, accent, sub }: { label: string; value: string | number; accent?: string; sub?: string }) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${accent ?? ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── pagination ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

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
      <button onClick={() => onChange(page - 1)} disabled={page === 1}
        className="px-2.5 py-1.5 border rounded bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">‹</button>
      {visible.map((v, i) =>
        v === "…"
          ? <span key={`e${i}`} className="px-2.5 py-1.5 text-muted-foreground">…</span>
          : <button key={v} onClick={() => onChange(v as number)}
              className={`px-2.5 py-1.5 border rounded font-medium transition-colors ${v === page ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>{v}</button>
      )}
      <button onClick={() => onChange(page + 1)} disabled={page === Math.ceil(total / PAGE_SIZE)}
        className="px-2.5 py-1.5 border rounded bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">›</button>
    </div>
  );
}

// ── detail drawer ─────────────────────────────────────────────────────────────

type DrawerTab = "overview" | "consumers" | "messages" | "actions";

function DetailDrawer({
  queue,
  onClose,
  onDeleted,
}: {
  queue: Queue;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [purging, setPurging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msgCount, setMsgCount] = useState(10);
  const [publishPayload, setPublishPayload] = useState("");
  const [publishContentType, setPublishContentType] = useState("application/json");
  const [publishPersistent, setPublishPersistent] = useState(true);
  const [publishHeaders, setPublishHeaders] = useState("");
  const [publishResult, setPublishResult] = useState<{ routed: boolean } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const dlx = getArg<string>(queue.arguments, "x-dead-letter-exchange");
  const ttl = getArg<number>(queue.arguments, "x-message-ttl");
  const isStream = queue.type === "stream";

  const { data: consumers, isLoading: consumersLoading } = useQuery<ConsumerDetail[]>({
    queryKey: ["queue-consumers", queue.vhost, queue.name],
    queryFn: async () => {
      const res = await fetch(`/api/rabbitmq/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}/consumers`);
      const json = (await res.json()) as { data?: ConsumerDetail[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    enabled: tab === "consumers",
    refetchInterval: 5_000,
  });

  const {
    data: messages,
    isLoading: messagesLoading,
    isError: messagesError,
    refetch: refetchMessages,
  } = useQuery<QueueMessage[]>({
    queryKey: ["queue-messages", queue.vhost, queue.name, msgCount],
    queryFn: async () => {
      const res = await fetch(
        `/api/rabbitmq/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}/get`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: msgCount }) },
      );
      const json = (await res.json()) as { data?: QueueMessage[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    enabled: false, // manual only
  });

  async function handlePurge() {
    setPurging(true);
    try {
      await fetch(`/api/rabbitmq/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}/purge`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["queues"] });
      setPurgeConfirm(false);
    } finally {
      setPurging(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/rabbitmq/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["queues"] });
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setPublishError(null);
    setPublishResult(null);
    try {
      let headers: Record<string, unknown> | undefined;
      if (publishHeaders.trim()) {
        headers = JSON.parse(publishHeaders) as Record<string, unknown>;
      }
      const res = await fetch(
        `/api/rabbitmq/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payload: publishPayload,
            content_type: publishContentType,
            persistent: publishPersistent,
            headers,
          }),
        },
      );
      const json = (await res.json()) as { routed?: boolean; error?: string };
      if (json.error) throw new Error(json.error);
      setPublishResult({ routed: json.routed ?? false });
      await queryClient.invalidateQueries({ queryKey: ["queues"] });
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  function formatPayload(msg: QueueMessage): string {
    if (msg.payload_encoding === "base64") return `[base64] ${msg.payload}`;
    try {
      return JSON.stringify(JSON.parse(msg.payload), null, 2);
    } catch {
      return msg.payload;
    }
  }

  const TABS: { id: DrawerTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "consumers", label: `Consumers (${queue.consumers})` },
    { id: "messages", label: "Messages" },
    { id: "actions", label: "Publish / Actions" },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-[560px] max-w-full bg-background border-l shadow-xl flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-start justify-between p-5 border-b">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-semibold truncate">{queue.name}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{queue.vhost}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <TypeBadge type={queue.type ?? "classic"} />
              <StateBadge state={queue.state} />
              {queue.durable && <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">durable</span>}
              {queue.auto_delete && <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">auto-delete</span>}
              {queue.exclusive && <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">exclusive</span>}
              {dlx && <span className="text-xs text-amber-600 border border-amber-300 rounded px-1.5 py-0.5">DLX: {dlx}</span>}
            </div>
          </div>
          <button onClick={onClose} className="ml-4 p-1.5 rounded hover:bg-muted transition-colors shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* tabs */}
        <div className="flex border-b bg-muted/30 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── overview ─────────────────────────────────────────────────── */}
          {tab === "overview" && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Message Counts</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total", value: fmtCount(queue.messages), accent: "" },
                    { label: "Ready", value: fmtCount(queue.messages_ready), accent: "" },
                    { label: "Unacked", value: fmtCount(queue.messages_unacknowledged), accent: queue.messages_unacknowledged > 0 ? "text-amber-500" : "" },
                  ].map(({ label, value, accent }) => (
                    <div key={label} className="border rounded-lg p-3 text-center">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">{label}</p>
                      <p className={`text-lg font-bold ${accent}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Queue Details</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {[
                    ["Node", queue.node],
                    ["Memory", fmtBytes(queue.memory ?? 0)],
                    ["Consumers", String(queue.consumers)],
                    ["Type", queue.type ?? "classic"],
                    ["Durable", queue.durable ? "Yes" : "No"],
                    ["Auto-delete", queue.auto_delete ? "Yes" : "No"],
                    ["Exclusive", queue.exclusive ? "Yes" : "No"],
                    ["Idle since", queue.idle_since ?? "—"],
                    ...(dlx ? [["Dead Letter Exchange", dlx]] : []),
                    ...(ttl !== undefined ? [["Message TTL", `${ttl}ms`]] : []),
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10px] uppercase font-semibold text-muted-foreground">{k}</dt>
                      <dd className="font-mono text-sm mt-0.5 break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {Object.keys(queue.arguments ?? {}).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Arguments</p>
                  <div className="border rounded-md overflow-hidden text-xs font-mono">
                    {Object.entries(queue.arguments).map(([k, v]) => (
                      <div key={k} className="flex gap-3 px-3 py-2 border-b last:border-b-0 hover:bg-muted/30">
                        <span className="text-muted-foreground min-w-[180px]">{k}</span>
                        <span className="break-all">{JSON.stringify(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── consumers ────────────────────────────────────────────────── */}
          {tab === "consumers" && (
            <div>
              {consumersLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !consumers || consumers.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-muted-foreground font-medium">No consumers</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {queue.messages > 0 ? "⚠ Messages are backlogged with no consumer" : "Queue is idle"}
                  </p>
                </div>
              ) : (
                <div className="border rounded-md overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-muted/50 text-muted-foreground uppercase font-semibold">
                      <tr>
                        <th className="px-3 py-2">Tag</th>
                        <th className="px-3 py-2">Channel</th>
                        <th className="px-3 py-2 text-center">Ack</th>
                        <th className="px-3 py-2 text-right">Prefetch</th>
                        <th className="px-3 py-2 text-center">Exclusive</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {consumers.map((c) => (
                        <tr key={c.consumer_tag} className="hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono max-w-[120px] truncate" title={c.consumer_tag}>{c.consumer_tag}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate" title={c.channel_details.name}>{c.channel_details.name}</td>
                          <td className="px-3 py-2 text-center">{c.ack_required ? "manual" : "auto"}</td>
                          <td className="px-3 py-2 text-right">{c.prefetch_count || "∞"}</td>
                          <td className="px-3 py-2 text-center">{c.exclusive ? "✓" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── messages ─────────────────────────────────────────────────── */}
          {tab === "messages" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <select
                  value={msgCount}
                  onChange={(e) => setMsgCount(Number(e.target.value))}
                  className="bg-background border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {[1, 5, 10, 25, 50].map((n) => <option key={n} value={n}>Peek {n}</option>)}
                </select>
                <button
                  onClick={() => refetchMessages()}
                  disabled={messagesLoading}
                  className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {messagesLoading ? "Loading…" : "Fetch"}
                </button>
                {isStream && (
                  <p className="text-xs text-muted-foreground">(stream queues: shows from start of stream)</p>
                )}
              </div>

              {messagesError && (
                <p className="text-sm text-destructive">Failed to fetch messages</p>
              )}

              {messages && messages.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">Queue is empty</p>
              )}

              {messages && messages.length > 0 && (
                <div className="space-y-3">
                  {messages.map((msg, i) => (
                    <div key={i} className="border rounded-lg overflow-hidden text-xs">
                      <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 text-muted-foreground font-mono border-b">
                        <span>#{i + 1}</span>
                        {msg.routing_key && <span>key: <span className="text-foreground">{msg.routing_key}</span></span>}
                        {msg.exchange && <span>exchange: <span className="text-foreground">{msg.exchange || "(default)"}</span></span>}
                        {msg.redelivered && <span className="text-amber-500">redelivered</span>}
                      </div>
                      <pre className="p-3 overflow-x-auto text-xs leading-relaxed max-h-48 bg-muted/10 whitespace-pre-wrap break-words">
                        {formatPayload(msg)}
                      </pre>
                      {msg.properties && Object.keys(msg.properties).filter(k => msg.properties[k as keyof typeof msg.properties] !== undefined).length > 0 && (
                        <div className="px-3 py-2 border-t text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                          {Object.entries(msg.properties).map(([k, v]) =>
                            v !== undefined ? (
                              <span key={k}><span className="font-medium">{k}:</span> {String(v)}</span>
                            ) : null
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── actions ──────────────────────────────────────────────────── */}
          {tab === "actions" && (
            <div className="space-y-6">
              {/* publish */}
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Publish Message</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block">Content-Type</label>
                      <input
                        value={publishContentType}
                        onChange={(e) => setPublishContentType(e.target.value)}
                        className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Persistent</label>
                      <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <input type="checkbox" checked={publishPersistent} onChange={(e) => setPublishPersistent(e.target.checked)} className="rounded" />
                        <span className="text-sm">delivery-mode: 2</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Headers (JSON, optional)</label>
                    <input
                      value={publishHeaders}
                      onChange={(e) => setPublishHeaders(e.target.value)}
                      placeholder='{"x-custom": "value"}'
                      className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Payload</label>
                    <textarea
                      value={publishPayload}
                      onChange={(e) => setPublishPayload(e.target.value)}
                      rows={6}
                      placeholder='{"key": "value"}'
                      className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono resize-y"
                    />
                  </div>

                  {publishResult && (
                    <p className={`text-sm font-medium ${publishResult.routed ? "text-emerald-600" : "text-amber-600"}`}>
                      {publishResult.routed ? "✓ Message routed successfully" : "⚠ Message was not routed (no binding?)"}
                    </p>
                  )}
                  {publishError && <p className="text-sm text-destructive">{publishError}</p>}

                  <button
                    onClick={handlePublish}
                    disabled={publishing || !publishPayload.trim()}
                    className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {publishing ? "Publishing…" : "Publish Message"}
                  </button>
                </div>
              </div>

              {/* purge */}
              <div className="border-t pt-6">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Danger Zone</p>
                {!isStream ? (
                  !purgeConfirm ? (
                    <button
                      onClick={() => setPurgeConfirm(true)}
                      className="w-full px-4 py-2 bg-amber-50 text-amber-700 border border-amber-300 rounded-md text-sm font-medium hover:bg-amber-100 transition-colors dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                    >
                      Purge Queue
                    </button>
                  ) : (
                    <div className="space-y-3 border border-amber-300 rounded-lg p-4 bg-amber-50/50 dark:bg-amber-900/10">
                      <p className="text-sm font-medium">Purge all {fmtCount(queue.messages)} messages from <span className="font-mono text-amber-700">{queue.name}</span>?</p>
                      <p className="text-xs text-muted-foreground">This permanently removes all messages. Cannot be undone.</p>
                      <div className="flex gap-2">
                        <button onClick={handlePurge} disabled={purging}
                          className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50">
                          {purging ? "Purging…" : "Yes, purge all"}
                        </button>
                        <button onClick={() => setPurgeConfirm(false)}
                          className="flex-1 px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground py-2">Purge is not available for stream queues.</p>
                )}

                <div className="mt-3">
                  {!deleteConfirm ? (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="w-full px-4 py-2 bg-destructive/10 text-destructive border border-destructive/30 rounded-md text-sm font-medium hover:bg-destructive/20 transition-colors"
                    >
                      Delete Queue
                    </button>
                  ) : (
                    <div className="space-y-3 border border-destructive/30 rounded-lg p-4 bg-destructive/5">
                      <p className="text-sm font-medium">Delete queue <span className="font-mono text-destructive">{queue.name}</span>?</p>
                      <p className="text-xs text-muted-foreground">All messages will be lost. This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button onClick={handleDelete} disabled={deleting}
                          className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50">
                          {deleting ? "Deleting…" : "Yes, delete it"}
                        </button>
                        <button onClick={() => setDeleteConfirm(false)}
                          className="flex-1 px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

const ALL_STATES = ["running", "idle", "stopped", "crashed", "flow"] as const;
const ALL_TYPES  = ["classic", "quorum", "stream"] as const;

export default function QueuesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch]       = useState("");
  const [vhostFilter, setVhost]   = useState("all");
  const [typeFilter, setType]     = useState("all");
  const [stateFilter, setState]   = useState("all");
  const [page, setPage]           = useState(1);
  const [selected, setSelected]   = useState<Queue | null>(null);

  const { data, isError, error, dataUpdatedAt } = useQuery<Queue[]>({
    queryKey: ["queues"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/queues");
      const json = (await res.json()) as { data?: Queue[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 5_000,
  });

  const vhosts = useMemo(() => Array.from(new Set(data?.map((q) => q.vhost) ?? [])).sort(), [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((queue) => {
      const matchSearch = !q || queue.name.toLowerCase().includes(q) || queue.vhost.toLowerCase().includes(q);
      const matchVhost  = vhostFilter === "all" || queue.vhost === vhostFilter;
      const matchType   = typeFilter === "all" || (queue.type ?? "classic") === typeFilter;
      const matchState  = stateFilter === "all" || queue.state === stateFilter;
      return matchSearch && matchVhost && matchType && matchState;
    });
  }, [data, search, vhostFilter, typeFilter, stateFilter]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // summary stats
  const totalMessages  = data?.reduce((s, q) => s + (q.messages ?? 0), 0) ?? 0;
  const totalUnacked   = data?.reduce((s, q) => s + (q.messages_unacknowledged ?? 0), 0) ?? 0;
  const totalConsumers = data?.reduce((s, q) => s + q.consumers, 0) ?? 0;
  const noConsumerBusy = data?.filter((q) => q.consumers === 0 && q.messages > 0).length ?? 0;

  function rowClass(q: Queue): string {
    const isCritical = (q.state === "crashed" || q.state === "stopped") || (q.messages > 0 && q.consumers === 0);
    const isWarning  = !isCritical && q.messages_unacknowledged > 0;
    if (isCritical) return "bg-rose-50/60 dark:bg-rose-900/10 hover:bg-rose-50 dark:hover:bg-rose-900/20";
    if (isWarning)  return "bg-amber-50/40 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20";
    return "hover:bg-muted/30";
  }

  function relativeTime(ms: number): string {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  }

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Queues</h1>
        {data && (
          <span className="px-2 py-0.5 bg-muted rounded-full text-sm font-semibold text-muted-foreground">
            {data.length}
          </span>
        )}
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load queues"}
        </div>
      )}

      {/* summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SumCard label="Total Messages" value={fmtCount(totalMessages)} />
        <SumCard
          label="Unacknowledged"
          value={fmtCount(totalUnacked)}
          accent={totalUnacked > 0 ? "text-amber-500" : ""}
          sub={totalUnacked > 0 ? "pending ack" : undefined}
        />
        <SumCard label="Total Consumers" value={totalConsumers} />
        <SumCard
          label="No Consumer"
          value={noConsumerBusy}
          accent={noConsumerBusy > 0 ? "text-rose-500" : ""}
          sub={noConsumerBusy > 0 ? "queues with backlog" : undefined}
        />
      </div>

      {/* filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className="w-full pl-9 pr-4 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Search by name or vhost…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {[
          { label: "Vhost",  value: vhostFilter, set: setVhost,  opts: vhosts },
          { label: "Type",   value: typeFilter,  set: setType,   opts: ALL_TYPES as unknown as string[] },
          { label: "State",  value: stateFilter, set: setState,  opts: ALL_STATES as unknown as string[] },
        ].map(({ label, value, set, opts }) => (
          <select key={label}
            className="bg-background border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={value}
            onChange={(e) => { set(e.target.value); setPage(1); }}
          >
            <option value="all">{label}: All</option>
            {opts.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
          </select>
        ))}
      </div>

      {/* table */}
      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Vhost</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3 text-right">Ready</th>
                <th className="px-5 py-3 text-right">Unacked</th>
                <th className="px-5 py-3 text-right">Consumers</th>
                <th className="px-5 py-3 text-right">In</th>
                <th className="px-5 py-3 text-right">Deliver</th>
                <th className="px-5 py-3 text-right">Memory</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data ? (
                <tr><td colSpan={10} className="px-5 py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center">
                    <p className="text-muted-foreground font-medium">No queues found</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      {search || vhostFilter !== "all" || typeFilter !== "all" || stateFilter !== "all"
                        ? "Try adjusting your filters"
                        : "No queues declared in this broker"}
                    </p>
                  </td>
                </tr>
              ) : (
                paged.map((q) => {
                  const dlxArg = getArg<string>(q.arguments ?? {}, "x-dead-letter-exchange");
                  const noConsumerAlert = q.consumers === 0 && q.messages > 0;
                  return (
                    <tr
                      key={`${q.vhost}/${q.name}`}
                      onClick={() => setSelected(q)}
                      className={`cursor-pointer transition-colors ${rowClass(q)}`}
                    >
                      <td className="px-5 py-3">
                        <span className="font-medium">{q.name}</span>
                        {dlxArg && <DlxIcon exchange={dlxArg} />}
                      </td>
                      <td className="px-5 py-3 font-mono text-sm text-muted-foreground">{q.vhost}</td>
                      <td className="px-5 py-3"><TypeBadge type={q.type ?? "classic"} /></td>
                      <td className="px-5 py-3"><StateBadge state={q.state} /></td>
                      <td className="px-5 py-3 text-right font-mono">{fmtCount(q.messages_ready)}</td>
                      <td className={`px-5 py-3 text-right font-mono font-semibold ${q.messages_unacknowledged > 0 ? "text-amber-500" : ""}`}>
                        {fmtCount(q.messages_unacknowledged)}
                      </td>
                      <td className={`px-5 py-3 text-right font-mono font-semibold ${noConsumerAlert ? "text-rose-500" : ""}`}>
                        {q.consumers}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                        {fmtRate(q.message_stats?.publish_details?.rate)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                        {fmtRate(q.message_stats?.deliver_get_details?.rate)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                        {fmtBytes(q.memory ?? 0)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 bg-muted/30 border-t flex justify-between items-center text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              {filtered.length === 0 ? "0 queues" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
            </span>
            {dataUpdatedAt > 0 && <span>· Updated {relativeTime(dataUpdatedAt)}</span>}
          </div>
          <Pagination page={page} total={filtered.length} onChange={setPage} />
        </div>
      </div>

      {selected && (
        <DetailDrawer
          queue={selected}
          onClose={() => setSelected(null)}
          onDeleted={() => {
            setSelected(null);
            void queryClient.invalidateQueries({ queryKey: ["queues"] });
          }}
        />
      )}
    </div>
  );
}
```

**Step 2: Add `type` to Queue in types.ts** (if not done in Task 1)

```ts
// In the Queue interface:
type: "classic" | "quorum" | "stream";
```

**Step 3: Build check**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

**Step 4: Commit**

```bash
git add app/\(app\)/queues/page.tsx
git commit -m "feat(queues): full queues page with table, filters, and detail drawer"
```

---

### Task 5: Add consumers API route

**Files:**
- Create: `app/api/rabbitmq/queues/[vhost]/[name]/consumers/route.ts`

The detail drawer's consumers tab fetches `/api/rabbitmq/queues/{vhost}/{name}/consumers`.

**Step 1: Create the route**

```ts
import { NextResponse } from "next/server";
import { getQueueConsumers } from "@/lib/rabbitmq";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    const consumers = await getQueueConsumers(vhost, name);
    return NextResponse.json({ data: consumers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch consumers";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

**Step 2: Build check**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

**Step 3: Final build**

```bash
pnpm build 2>&1 | tail -20
```
Expected: successful build, no type errors.

**Step 4: Commit**

```bash
git add app/api/rabbitmq/queues/
git commit -m "feat(queues): add consumers API route"
```

---

### Task 6: Final verification

**Step 1: Check the page renders**

```bash
pnpm dev &
# open http://localhost:3000/queues in browser
```

Verify:
- Summary cards show
- Table has type/state badges, memory, rates
- Red row for queue with messages but no consumers
- Click a row → drawer opens with 4 tabs
- Consumers tab loads (may be empty)
- Messages tab → Fetch button → shows messages or "Queue is empty"
- Publish tab → fill payload → click Publish → shows success/fail

**Step 2: Commit everything**

```bash
git add -A
git commit -m "feat(queues): complete queues page — table, filters, drawer with inspect/publish/purge/delete"
```
