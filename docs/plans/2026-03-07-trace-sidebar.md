# Trace Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a slide-in sidebar to queues, exchanges, connections, and channels pages that shows live RabbitMQ trace events filtered to the selected entity.

**Architecture:** Extract trace EventSource logic into a `useTraceStream` hook. A shared `TraceSidebar` component renders a right-side panel that auto-starts tracing on open and stops on close. Filtering (queue/exchange name) happens client-side against the shared `TraceEvent` type. Connections and channels show an unfiltered global feed since trace events don't carry connection/channel metadata.

**Tech Stack:** Next.js App Router, React, TanStack Query, shadcn/ui (Sheet), TailwindCSS v4, amqplib SSE stream already at `/api/rabbitmq/trace/stream`

---

### Task 1: Add Sheet UI component

**Files:**
- Create: `components/ui/sheet.tsx`

**Step 1: Add via shadcn CLI**

```bash
pnpm dlx shadcn@latest add sheet
```

Expected: creates `components/ui/sheet.tsx` with Radix Dialog-based slide-in panel.

**Step 2: Verify file exists**

```bash
ls components/ui/sheet.tsx
```

**Step 3: Commit**

```bash
git add components/ui/sheet.tsx
git commit -m "chore(ui): add Sheet component"
```

---

### Task 2: Create `useTraceStream` hook

**Files:**
- Create: `lib/use-trace-stream.ts`

**Step 1: Create the hook**

```typescript
// lib/use-trace-stream.ts
"use client";

import { useState, useRef, useCallback } from "react";
import type { TraceEvent } from "@/lib/types";

export interface UseTraceStreamReturn {
  events: TraceEvent[];
  active: boolean;
  error: string | null;
  start: (vhost: string) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
}

export function useTraceStream(): UseTraceStreamReturn {
  const [events, setEvents]   = useState<TraceEvent[]>([]);
  const [active, setActive]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const esRef                 = useRef<EventSource | null>(null);
  const vhostRef              = useRef<string>("/");

  const start = useCallback(async (vhost: string) => {
    setError(null);
    vhostRef.current = vhost;
    try {
      const res = await fetch(`/api/rabbitmq/vhosts/${encodeURIComponent(vhost)}/trace-on`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to enable tracing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enable tracing");
      return;
    }
    const es = new EventSource(`/api/rabbitmq/trace/stream?vhost=${encodeURIComponent(vhost)}`);
    esRef.current = es;
    es.addEventListener("error", (e) => {
      const me = e as MessageEvent;
      if (me.data) {
        try { setError((JSON.parse(me.data as string) as { error: string }).error); } catch { /* ignore */ }
      }
    });
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as TraceEvent;
        setEvents((prev) => [...prev.slice(-299), event]);
      } catch { /* skip */ }
    };
    setActive(true);
  }, []);

  const stop = useCallback(async () => {
    esRef.current?.close();
    esRef.current = null;
    setActive(false);
    try {
      await fetch(`/api/rabbitmq/vhosts/${encodeURIComponent(vhostRef.current)}/trace-off`, { method: "POST" });
    } catch { /* best effort */ }
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  return { events, active, error, start, stop, clear };
}
```

**Step 2: Commit**

```bash
git add lib/use-trace-stream.ts
git commit -m "feat(trace): add useTraceStream hook"
```

---

### Task 3: Create `TraceSidebar` component

The sidebar filters events client-side:
- `type: "queue"` → show events where `event.queue === name` OR `event.routingKey === name`
- `type: "exchange"` → show events where `event.exchange === name`
- `type: "connection"` | `"channel"` → show all events (no filter)

**Files:**
- Create: `components/trace-sidebar.tsx`

**Step 1: Create the component**

```tsx
// components/trace-sidebar.tsx
"use client";

import { useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { TraceEvent } from "@/lib/types";
import type { UseTraceStreamReturn } from "@/lib/use-trace-stream";

export type TraceSidebarEntity = {
  type: "queue" | "exchange" | "connection" | "channel";
  name: string;
  vhost: string;
};

interface Props {
  entity: TraceSidebarEntity | null;
  trace: UseTraceStreamReturn;
  onClose: () => void;
}

function filterEvents(events: TraceEvent[], entity: TraceSidebarEntity): TraceEvent[] {
  if (entity.type === "queue") {
    return events.filter((e) => e.queue === entity.name || e.routingKey === entity.name);
  }
  if (entity.type === "exchange") {
    return events.filter((e) => e.exchange === entity.name);
  }
  return events; // connection / channel: unfiltered
}

const TYPE_COLOR: Record<TraceSidebarEntity["type"], string> = {
  queue:      "text-blue-500",
  exchange:   "text-violet-500",
  connection: "text-slate-500",
  channel:    "text-emerald-500",
};

export function TraceSidebar({ entity, trace, onClose }: Props) {
  const open = entity !== null;
  const bottomRef = useRef<HTMLDivElement>(null);
  const visible = entity ? filterEvents(trace.events, entity) : [];

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible.length]);

  // Start/stop tracing when entity changes
  useEffect(() => {
    if (entity) {
      void trace.start(entity.vhost);
    } else {
      void trace.stop();
      trace.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity?.name, entity?.vhost]);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm font-mono truncate max-w-[260px]" title={entity?.name ?? ""}>
              {entity && (
                <>
                  <span className={`text-xs uppercase font-bold mr-2 ${TYPE_COLOR[entity.type]}`}>
                    {entity.type}
                  </span>
                  {entity.name || <span className="italic text-muted-foreground">(default)</span>}
                </>
              )}
            </SheetTitle>
            <div className="flex items-center gap-2 shrink-0">
              {trace.active && (
                <span className="flex items-center gap-1 text-xs text-rose-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  live
                </span>
              )}
              <button
                onClick={trace.clear}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </SheetHeader>

        {/* Firehose warning */}
        {trace.active && (
          <div className="mx-3 mt-2 p-2 rounded border border-amber-300 bg-amber-50/60 dark:bg-amber-900/10 text-[11px] text-amber-700 dark:text-amber-400 shrink-0">
            <strong>Firehose active</strong> — adds CPU/memory overhead. Close panel to stop.
          </div>
        )}

        {trace.error && (
          <div className="mx-3 mt-2 p-2 rounded border border-rose-300 bg-rose-50 dark:bg-rose-900/10 text-xs text-rose-700 dark:text-rose-400 shrink-0">
            {trace.error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto text-xs font-mono min-h-0">
          {visible.length === 0 ? (
            <p className="p-4 text-muted-foreground italic">
              {trace.active ? "Waiting for messages…" : "Starting trace…"}
            </p>
          ) : (
            visible.map((e, i) => (
              <div
                key={i}
                className={`px-3 py-2 border-b hover:bg-muted/30 ${
                  e.type === "publish"
                    ? "border-l-2 border-l-violet-400"
                    : "border-l-2 border-l-emerald-400"
                }`}
              >
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-0.5">
                  <span className={e.type === "publish" ? "text-violet-500 font-semibold" : "text-emerald-500 font-semibold"}>
                    {e.type}
                  </span>
                  <span>{new Date(e.timestamp).toLocaleTimeString()}</span>
                  {e.routingKey && e.routingKey !== e.queue && (
                    <span className="text-muted-foreground/60">key: {e.routingKey}</span>
                  )}
                </div>
                <div className="text-foreground truncate">
                  {e.exchange || "(default)"}{e.queue ? ` → ${e.queue}` : ""}
                </div>
                <div className="text-muted-foreground truncate mt-0.5">
                  {e.payload.slice(0, 100)}{e.payload.length > 100 ? "…" : ""}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Commit**

```bash
git add components/trace-sidebar.tsx
git commit -m "feat(trace): add TraceSidebar component"
```

---

### Task 4: Wire TraceSidebar into queues page

The queues page already has a detailed selected-queue panel. We're adding a second selection concept for trace — a separate `tracedQueue` state so the existing detailed panel isn't disrupted.

**Files:**
- Modify: `app/(app)/queues/page.tsx`

**Step 1: Add imports at the top of the file**

Find the existing imports block and add:

```typescript
import { useTraceStream } from "@/lib/use-trace-stream";
import { TraceSidebar, type TraceSidebarEntity } from "@/components/trace-sidebar";
import { Activity } from "lucide-react";
```

**Step 2: Add state inside the page component**

Find the existing `useState` declarations near the top of the `QueuesPage` component function and add:

```typescript
const [tracedEntity, setTracedEntity] = useState<TraceSidebarEntity | null>(null);
const trace = useTraceStream();
```

**Step 3: Add a trace button column to each queue row**

Inside the table row for each queue (look for `<TableRow` in the queues table body), add a cell with a trace button. Find where the row actions are rendered (likely near the purge/peek buttons) and add:

```tsx
<button
  title="Live trace"
  onClick={(e) => {
    e.stopPropagation();
    setTracedEntity({ type: "queue", name: q.name, vhost: q.vhost });
  }}
  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
>
  <Activity className="h-3.5 w-3.5" />
</button>
```

**Step 4: Render `TraceSidebar` at the bottom of the page component return**

Just before the closing `</div>` of the page return, add:

```tsx
<TraceSidebar
  entity={tracedEntity}
  trace={trace}
  onClose={() => setTracedEntity(null)}
/>
```

**Step 5: Verify visually**

```bash
pnpm dev
```

Open http://localhost:35672/queues, click the Activity icon on a queue row — sidebar should slide in and start showing trace events.

**Step 6: Commit**

```bash
git add app/(app)/queues/page.tsx
git commit -m "feat(queues): add live trace sidebar"
```

---

### Task 5: Wire TraceSidebar into exchanges page

**Files:**
- Modify: `app/(app)/exchanges/page.tsx`

**Step 1: Add imports**

```typescript
import { useTraceStream } from "@/lib/use-trace-stream";
import { TraceSidebar, type TraceSidebarEntity } from "@/components/trace-sidebar";
import { Activity } from "lucide-react";
```

**Step 2: Add state inside `ExchangesPage`**

```typescript
const [tracedEntity, setTracedEntity] = useState<TraceSidebarEntity | null>(null);
const trace = useTraceStream();
```

**Step 3: Add trace button to each exchange row**

In the table row actions area, add:

```tsx
<button
  title="Live trace"
  onClick={(e) => {
    e.stopPropagation();
    setTracedEntity({ type: "exchange", name: ex.name, vhost: ex.vhost });
  }}
  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
>
  <Activity className="h-3.5 w-3.5" />
</button>
```

**Step 4: Render `TraceSidebar`**

```tsx
<TraceSidebar
  entity={tracedEntity}
  trace={trace}
  onClose={() => setTracedEntity(null)}
/>
```

**Step 5: Commit**

```bash
git add app/(app)/exchanges/page.tsx
git commit -m "feat(exchanges): add live trace sidebar"
```

---

### Task 6: Wire TraceSidebar into connections page

**Files:**
- Modify: `app/(app)/connections/page.tsx`

**Step 1: Add imports**

```typescript
import { useTraceStream } from "@/lib/use-trace-stream";
import { TraceSidebar, type TraceSidebarEntity } from "@/components/trace-sidebar";
import { Activity } from "lucide-react";
```

**Step 2: Add state inside the connections page component**

```typescript
const [tracedEntity, setTracedEntity] = useState<TraceSidebarEntity | null>(null);
const trace = useTraceStream();
```

**Step 3: Add trace button to each connection row**

```tsx
<button
  title="Live trace (global feed)"
  onClick={(e) => {
    e.stopPropagation();
    setTracedEntity({ type: "connection", name: conn.name, vhost: conn.vhost });
  }}
  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
>
  <Activity className="h-3.5 w-3.5" />
</button>
```

**Step 4: Render `TraceSidebar`**

```tsx
<TraceSidebar
  entity={tracedEntity}
  trace={trace}
  onClose={() => setTracedEntity(null)}
/>
```

**Step 5: Commit**

```bash
git add app/(app)/connections/page.tsx
git commit -m "feat(connections): add live trace sidebar"
```

---

### Task 7: Wire TraceSidebar into channels page

**Files:**
- Modify: `app/(app)/channels/page.tsx`

**Step 1: Add imports**

```typescript
import { useTraceStream } from "@/lib/use-trace-stream";
import { TraceSidebar, type TraceSidebarEntity } from "@/components/trace-sidebar";
import { Activity } from "lucide-react";
```

**Step 2: Add state inside the channels page component**

```typescript
const [tracedEntity, setTracedEntity] = useState<TraceSidebarEntity | null>(null);
const trace = useTraceStream();
```

**Step 3: Add trace button to each channel row**

```tsx
<button
  title="Live trace (global feed)"
  onClick={(e) => {
    e.stopPropagation();
    setTracedEntity({ type: "channel", name: ch.name, vhost: ch.vhost });
  }}
  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
>
  <Activity className="h-3.5 w-3.5" />
</button>
```

**Step 4: Render `TraceSidebar`**

```tsx
<TraceSidebar
  entity={tracedEntity}
  trace={trace}
  onClose={() => setTracedEntity(null)}
/>
```

**Step 5: Commit**

```bash
git add app/(app)/channels/page.tsx
git commit -m "feat(channels): add live trace sidebar"
```

---

### Task 8: Final verification

**Step 1: Build check**

```bash
pnpm build
```

Expected: no TypeScript errors, clean build.

**Step 2: Lint**

```bash
pnpm lint
```

**Step 3: Manual smoke test checklist**

- [ ] Queues page: click Activity icon → sidebar opens, shows only events for that queue
- [ ] Exchanges page: click Activity icon → sidebar shows only events for that exchange
- [ ] Connections page: click Activity icon → sidebar shows all events (global feed)
- [ ] Channels page: same
- [ ] Closing sidebar stops tracing (trace-off called)
- [ ] Firehose warning is visible while sidebar is open
- [ ] Clear button works
- [ ] Dark mode looks correct

**Step 4: Final commit**

```bash
git add -p  # stage any remaining changes
git commit -m "chore(trace): final cleanup and verification"
```
