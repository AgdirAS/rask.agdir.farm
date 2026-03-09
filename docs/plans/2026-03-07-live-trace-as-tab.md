# Live Trace as Detail Drawer Tab — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hidden Activity-button-triggered `TraceSidebar` Sheet overlay with a "Live Trace" tab inside each entity's existing detail drawer (queues, exchanges, channels).

**Architecture:** Extract the trace event log into a reusable `TraceTab` component. Move `useTraceStream` from page level into each detail drawer component. Wire trace start/stop to the tab's active state. Remove Activity row buttons and `TraceSidebar` Sheet from all three pages.

**Tech Stack:** Next.js App Router, React, shadcn/ui, TailwindCSS v4, existing `useTraceStream` hook, existing `TraceEvent` type.

---

### Task 1: Extract `TraceTab` component

**Files:**
- Create: `components/trace-tab.tsx`

The `TraceSidebar` Sheet is being replaced. Rather than delete it immediately, we extract the reusable "event log body" into its own component first.

**Step 1: Create `components/trace-tab.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { TraceEvent } from "@/lib/types";
import type { UseTraceStreamReturn } from "@/lib/use-trace-stream";

interface Props {
  trace: UseTraceStreamReturn;
  events: TraceEvent[]; // already filtered by caller
}

export function TraceTab({ trace, events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {trace.active && (
        <div className="mx-3 mt-3 p-2 rounded border border-amber-300 bg-amber-50/60 dark:bg-amber-900/10 text-[11px] text-amber-700 dark:text-amber-400 shrink-0">
          <strong>Firehose active</strong> — adds CPU/memory overhead. Switch tabs or close drawer to stop.
        </div>
      )}
      {trace.error && (
        <div className="mx-3 mt-2 p-2 rounded border border-rose-300 bg-rose-50 dark:bg-rose-900/10 text-xs text-rose-700 dark:text-rose-400 shrink-0">
          {trace.error}
        </div>
      )}
      <div className="flex-1 overflow-y-auto text-xs font-mono min-h-0">
        {events.length === 0 ? (
          <p className="p-4 text-muted-foreground italic">
            {trace.active ? "Waiting for messages…" : "Starting trace…"}
          </p>
        ) : (
          events.map((e, i) => (
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
                {e.payload.slice(0, 120)}{e.payload.length > 120 ? "…" : ""}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/trace-tab.tsx
git commit -m "feat(trace): extract TraceTab component for drawer embedding"
```

---

### Task 2: Wire Live Trace tab into queues DetailDrawer

**Files:**
- Modify: `app/(app)/queues/page.tsx`

The `DetailDrawer` function (around line 387) currently has `DrawerTab = "overview" | "consumers" | "messages" | "actions"`. We extend this and add the tab.

**Step 1: Add imports inside the file**

At the top of `queues/page.tsx`, find the existing imports block. Add:

```typescript
import { TraceTab } from "@/components/trace-tab";
import { useTraceStream } from "@/lib/use-trace-stream";
```

The `Activity` import from lucide and the imports for `useTraceStream`, `TraceSidebar`, `TraceSidebarEntity` that currently exist at the page level will be removed (see Step 5).

**Step 2: Extend `DrawerTab` type inside `DetailDrawer`**

Find the line (around line 390):
```typescript
type DrawerTab = "overview" | "consumers" | "messages" | "actions";
```
Replace with:
```typescript
type DrawerTab = "overview" | "consumers" | "messages" | "actions" | "trace";
```

**Step 3: Add `useTraceStream` and filtered events inside `DetailDrawer`**

Inside `DetailDrawer`, after the existing `useState` for `tab`, add:

```typescript
const trace = useTraceStream();
const traceEvents = trace.events.filter(
  (e) => e.queue === queue.name || e.routingKey === queue.name
);
```

**Step 4: Add trace lifecycle effect inside `DetailDrawer`**

After the existing useEffect hooks inside `DetailDrawer`, add:

```typescript
useEffect(() => {
  if (tab === "trace") {
    void trace.start(queue.vhost);
  } else {
    void trace.stop();
    trace.clear();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab]);

// Stop on unmount
useEffect(() => {
  return () => { void trace.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

**Step 5: Add "Live Trace" to TABS constant**

Find:
```typescript
const TABS: { id: DrawerTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "consumers", label: `Consumers (${queue.consumers})` },
  { id: "messages", label: "Messages" },
  { id: "actions", label: "Publish / Actions" },
];
```
Replace with:
```typescript
const TABS: { id: DrawerTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "consumers", label: `Consumers (${queue.consumers})` },
  { id: "messages", label: "Messages" },
  { id: "actions", label: "Publish / Actions" },
  { id: "trace", label: trace.active ? "Live Trace ●" : "Live Trace" },
];
```

**Step 6: Add trace tab body**

Inside the tab body section, find where the last tab body ends (around the `{tab === "actions" && ...}` block closing). After it, add:

```tsx
{tab === "trace" && (
  <div className="flex-1 min-h-0 flex flex-col">
    <TraceTab trace={trace} events={traceEvents} />
  </div>
)}
```

**Step 7: Remove page-level trace state, imports, Activity button, and TraceSidebar**

At the page-component level (the `QueuesPage` function, around line 860+):
- Remove: `const [tracedEntity, setTracedEntity] = useState<TraceSidebarEntity | null>(null);`
- Remove: `const trace = useTraceStream();`
- Remove the `<td>` cell containing the Activity button from each queue table row
- Remove the `<TraceSidebar ... />` from the page return
- Remove unused imports at top of file: `Activity` from lucide, `useTraceStream`, `TraceSidebar`, `TraceSidebarEntity`

**Step 8: Commit**

```bash
git add app/(app)/queues/page.tsx
git commit -m "feat(queues): move live trace into detail drawer tab"
```

---

### Task 3: Wire Live Trace tab into exchanges ExchangeDrawer

**Files:**
- Modify: `app/(app)/exchanges/page.tsx`

The `ExchangeDrawer` function uses `DrawerTab = "details" | "test"`.

**Step 1: Add imports**

At the top of the file, find existing imports and add:
```typescript
import { TraceTab } from "@/components/trace-tab";
import { useTraceStream } from "@/lib/use-trace-stream";
```
(These may already be imported at page level — we're moving them to be used inside `ExchangeDrawer` instead.)

**Step 2: Extend `DrawerTab` type**

Find:
```typescript
type DrawerTab = "details" | "test";
```
Replace with:
```typescript
type DrawerTab = "details" | "test" | "trace";
```

**Step 3: Add `useTraceStream` and filtered events inside `ExchangeDrawer`**

Inside `ExchangeDrawer`, after the `useState` for `drawerTab`, add:

```typescript
const trace = useTraceStream();
const traceEvents = trace.events.filter((e) => e.exchange === exchange.name);
```

**Step 4: Add trace lifecycle effect**

```typescript
useEffect(() => {
  if (drawerTab === "trace") {
    void trace.start(exchange.vhost);
  } else {
    void trace.stop();
    trace.clear();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [drawerTab]);

useEffect(() => {
  return () => { void trace.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

**Step 5: Add "Live Trace" tab button**

Find the tab buttons section:
```jsx
{(["details", "test"] as DrawerTab[]).map((t) => (
```
Replace the array and label logic:
```tsx
{(["details", "test", "trace"] as DrawerTab[]).map((t) => (
  <button
    key={t}
    onClick={() => setDrawerTab(t)}
    className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${drawerTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
  >
    {t === "details" ? "Details" : t === "test" ? "Test Routing Key" : trace.active ? "Live Trace ●" : "Live Trace"}
  </button>
))}
```

**Step 6: Add trace tab body**

In the tab body section, after the existing `{drawerTab === "details" && ...}` block, add:

```tsx
{drawerTab === "trace" && (
  <div className="flex-1 min-h-0 flex flex-col">
    <TraceTab trace={trace} events={traceEvents} />
  </div>
)}
```

Note: The wrapping `<div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">` around the existing tab bodies may need `overflow-y-auto` removed or the trace tab rendered outside it — check visually that the event list scrolls correctly. If needed, render the trace tab body as a sibling outside the scroll wrapper.

**Step 7: Remove page-level trace state, Activity button, TraceSidebar**

At the `ExchangesPage` function level:
- Remove: `const [tracedEntity, setTracedEntity] = useState<TraceSidebarEntity | null>(null);`
- Remove: `const trace = useTraceStream();`
- Remove the Activity `<TableCell>` from each exchange table row
- Remove `<TraceSidebar ... />` from page return
- Remove unused imports: `Activity`, `useTraceStream`, `TraceSidebar`, `TraceSidebarEntity`

**Step 8: Commit**

```bash
git add app/(app)/exchanges/page.tsx
git commit -m "feat(exchanges): move live trace into detail drawer tab"
```

---

### Task 4: Wire Live Trace tab into channels DetailDrawer

**Files:**
- Modify: `app/(app)/channels/page.tsx`

The channels `DetailDrawer` currently has **no tabs** — it's a single-panel layout. We add a tab bar with "Overview" (existing content) and "Live Trace".

**Step 1: Add imports**

```typescript
import { TraceTab } from "@/components/trace-tab";
import { useTraceStream } from "@/lib/use-trace-stream";
```

**Step 2: Add tab state and trace inside `DetailDrawer`**

At the top of the `DetailDrawer` function (after the first line), add:

```typescript
type ChannelTab = "overview" | "trace";
const [tab, setTab] = useState<ChannelTab>("overview");
const trace = useTraceStream();
// channels don't filter — trace events have no channel metadata, show global feed
const traceEvents = trace.events;
```

**Step 3: Add trace lifecycle effect**

```typescript
useEffect(() => {
  if (tab === "trace") {
    void trace.start(channel.vhost);
  } else {
    void trace.stop();
    trace.clear();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab]);

useEffect(() => {
  return () => { void trace.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

**Step 4: Add tab bar to the drawer JSX**

Find the drawer's JSX return. After the header section (the div with the channel name, close button, and badges), add the tab bar before the content body:

```tsx
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
```

**Step 5: Wrap existing content in overview tab**

Find the start of the content area (the div with `overflow-y-auto` that contains the channel details). Wrap the entire content body:

```tsx
{tab === "overview" && (
  <div className="flex-1 overflow-y-auto p-5 space-y-5">
    {/* ... existing channel detail content unchanged ... */}
  </div>
)}
{tab === "trace" && (
  <div className="flex-1 min-h-0 flex flex-col">
    <TraceTab trace={trace} events={traceEvents} />
  </div>
)}
```

**Step 6: Remove page-level trace state, Activity button, TraceSidebar**

At the `ChannelsPage` function level:
- Remove: `const [tracedEntity, setTracedEntity] = useState<TraceSidebarEntity | null>(null);`
- Remove: `const trace = useTraceStream();`
- Remove the Activity `<td>` from the channel table row
- Remove `<TraceSidebar ... />` from page return
- Remove unused imports: `Activity`, `useTraceStream`, `TraceSidebar`, `TraceSidebarEntity`

**Step 7: Commit**

```bash
git add app/(app)/channels/page.tsx
git commit -m "feat(channels): move live trace into detail drawer tab"
```

---

### Task 5: Clean up TraceSidebar

**Files:**
- Delete: `components/trace-sidebar.tsx` (no longer used by any page)

**Step 1: Verify no remaining imports**

```bash
grep -r "TraceSidebar\|trace-sidebar" app/ components/ lib/ --include="*.tsx" --include="*.ts"
```

Expected: no matches (only the file itself).

**Step 2: Delete the file**

```bash
rm components/trace-sidebar.tsx
```

**Step 3: Commit**

```bash
git add -A
git commit -m "chore(trace): remove TraceSidebar Sheet (replaced by TraceTab)"
```

---

### Task 6: Lint + build verification

**Step 1: Run lint**

```bash
pnpm lint
```

Expected: no errors. Fix any "unused import" warnings if missed in earlier tasks.

**Step 2: Run build**

```bash
pnpm build
```

Expected: clean build, no TypeScript errors.

**Step 3: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: fix lint warnings after trace tab refactor"
```

---

### Manual smoke-test checklist

- [ ] Queues: click a queue row → drawer opens → "Live Trace" tab visible → click it → firehose warning appears, events stream in
- [ ] Queues: switch to another tab → tracing stops (no more events)
- [ ] Queues: close drawer → trace stops
- [ ] Exchanges: same flow for an exchange
- [ ] Channels: click a channel → "Overview" and "Live Trace" tabs visible → trace tab shows global feed
- [ ] No Activity icon visible in any table row
- [ ] No second Sheet/overlay appearing anywhere
- [ ] Dark mode looks correct
