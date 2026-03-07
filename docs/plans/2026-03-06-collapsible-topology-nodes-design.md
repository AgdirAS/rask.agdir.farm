# Collapsible Topology Nodes

**Date:** 2026-03-06

## Problem

Topology nodes in the ReactFlow graph always show full details (name, type, stats, rate). With many exchanges and queues this creates visual noise. Users want a compact default view.

## Design

### Node state

Add `expanded: boolean` (default `false`) to both `ExchangeNodeData` and `QueueNodeData`. Set when building raw nodes in the `useEffect`.

### Node components

- **Collapsed (36px):** name only, styled consistently with existing border/color scheme
- **Expanded (60px):** current full view — type/rate for exchanges; messages/consumers/rate for queues
- Clicking the card calls `useReactFlow().updateNode(id, { data: { ...data, expanded: !data.expanded } })` — no prop drilling, no re-layout

### Layout

Dagre keeps `NODE_H = 60` for spacing. Collapsed nodes simply occupy less visual space than their allocated slot, giving natural breathing room.

### Toolbar

Two new buttons: **Expand all** / **Collapse all** — use `setNodes(nodes => nodes.map(n => ({ ...n, data: { ...n.data, expanded: true/false } })))`.

## Files Changed

- `app/(app)/topology/page.tsx` — only file touched
