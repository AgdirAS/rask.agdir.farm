# Collapsible Topology Nodes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make topology graph nodes collapsed (name only, 36px) by default, expandable to full stats (60px) on click, with Expand all / Collapse all toolbar buttons.

**Architecture:** Single file change to `app/(app)/topology/page.tsx`. Add `expanded: boolean` to node data types, render two heights in node components, wire click → `useReactFlow().updateNode()`, add toolbar buttons using `setNodes`.

**Tech Stack:** ReactFlow (`@xyflow/react`), React, TailwindCSS v4

> Note: No test suite is configured for this project. Skip test steps.

---

### Task 1: Add `expanded` field to node data types and defaults

**Files:**
- Modify: `app/(app)/topology/page.tsx:49-50` (type declarations)
- Modify: `app/(app)/topology/page.tsx:211-234` (rawNodes builder in useEffect)

**Step 1: Update type declarations**

In the type aliases near the top of the file, add `expanded: boolean`:

```ts
type ExchangeNodeData = { label: string; exchangeType: string; rate: number; expanded: boolean };
type QueueNodeData = { label: string; messages: number; consumers: number; state: string; rate: number; expanded: boolean };
```

**Step 2: Set `expanded: false` when building raw nodes**

In the `useEffect` that builds `rawNodes`, add `expanded: false` to each node's data object:

```ts
// exchange nodes
data: {
  label: e.name || "(default)",
  exchangeType: e.type,
  rate: e.message_stats?.publish_details?.rate ?? 0,
  expanded: false,          // ← add this
},

// queue nodes
data: {
  label: q.name,
  messages: q.messages ?? 0,
  consumers: q.consumers,
  state: q.state,
  rate: q.message_stats?.publish_details?.rate ?? 0,
  expanded: false,          // ← add this
},
```

**Step 3: Commit**

```bash
git add app/(app)/topology/page.tsx
git commit -m "feat(topology): add expanded field to node data types"
```

---

### Task 2: Update `ExchangeNode` to render collapsed/expanded states

**Files:**
- Modify: `app/(app)/topology/page.tsx:52-69` (ExchangeNode component)

**Step 1: Import `useReactFlow` (already imported from `@xyflow/react` — just add to the import list)**

Ensure `useReactFlow` is in the import from `@xyflow/react`:

```ts
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,       // ← add this
  Position,
  Handle,
  getBezierPath,
  BaseEdge,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
} from "@xyflow/react";
```

**Step 2: Rewrite `ExchangeNode`**

Replace the entire `ExchangeNode` function with:

```tsx
function ExchangeNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ExchangeNodeData;
  const { updateNode } = useReactFlow();

  function toggle() {
    updateNode(id, (n) => ({ data: { ...n.data, expanded: !d.expanded } }));
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
```

**Step 3: Commit**

```bash
git add app/(app)/topology/page.tsx
git commit -m "feat(topology): exchange nodes collapse/expand on click"
```

---

### Task 3: Update `QueueNode` to render collapsed/expanded states

**Files:**
- Modify: `app/(app)/topology/page.tsx:71-96` (QueueNode component)

**Step 1: Rewrite `QueueNode`**

Replace the entire `QueueNode` function with:

```tsx
function QueueNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as QueueNodeData;
  const { updateNode } = useReactFlow();
  const noConsumers = d.consumers === 0 && d.messages > 0;
  const isCritical = d.state === "crashed" || d.state === "stopped" || noConsumers;

  function toggle() {
    updateNode(id, (n) => ({ data: { ...n.data, expanded: !d.expanded } }));
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
```

**Step 2: Commit**

```bash
git add app/(app)/topology/page.tsx
git commit -m "feat(topology): queue nodes collapse/expand on click"
```

---

### Task 4: Add Expand all / Collapse all toolbar buttons

**Files:**
- Modify: `app/(app)/topology/page.tsx:314-357` (toolbar JSX in `TopologyPage` return)

**Step 1: Add toolbar buttons**

In the toolbar `<div>` (the one with `flex flex-wrap items-center gap-3 mb-3`), add two buttons after the Stop/Start Tracing button group:

```tsx
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
```

Place these after the tracing button / hide-feed button group, before the `traceError` span and the legend `div.ml-auto`.

**Step 2: Verify in browser**

- Open `/topology`
- All nodes should render at 36px (collapsed, name only)
- Click a node → expands to 60px showing stats
- Click again → collapses
- "Expand all" button → all nodes expand
- "Collapse all" button → all nodes collapse

**Step 3: Commit**

```bash
git add app/(app)/topology/page.tsx
git commit -m "feat(topology): add expand all / collapse all toolbar buttons"
```
