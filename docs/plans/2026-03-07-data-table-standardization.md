# DataTable Standardization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all raw `<table>` HTML and inconsistent shadcn Table usages with a shared `<DataTable>` component, and standardize all edit/open interactions to row-click.

**Architecture:** A headless `useDataTable` hook manages sort + pagination state. A `<DataTable>` component renders using shadcn Table primitives. Pages own their filter logic and pass pre-filtered data in. Row click replaces inline pencil/edit buttons.

**Tech Stack:** React hooks, shadcn/ui Table primitives (`components/ui/table.tsx`), TailwindCSS v4, TypeScript.

---

## Task 1: Create `useDataTable` hook

**Files:**
- Create: `components/data-table/use-data-table.ts`

**Step 1: Write the hook**

```ts
"use client";

import { useState, useMemo } from "react";

export type SortDir = "asc" | "desc";

export interface UseDataTableOptions<T> {
  data: T[];
  pageSize?: number;
  defaultSortKey?: string;
  defaultSortDir?: SortDir;
  getSortValue?: (row: T, key: string) => string | number;
}

export function useDataTable<T>({
  data,
  pageSize = 15,
  defaultSortKey,
  defaultSortDir = "asc",
  getSortValue,
}: UseDataTableOptions<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);
  const [page, setPage] = useState(1);

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const sorted = useMemo(() => {
    if (!sortKey || !getSortValue) return data;
    return [...data].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, getSortValue]);

  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const pagedData = pageSize > 0 ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted;

  return { sortKey, sortDir, toggleSort, page, setPage, pageCount, pagedData, totalCount: data.length };
}
```

**Step 2: Verify types compile**

```bash
cd /Users/e/dev/agdir/rask.agdir.farm && pnpm build 2>&1 | grep -E "error TS|✓|Failed"
```

Expected: no TypeScript errors in the new file.

**Step 3: Commit**

```bash
git add components/data-table/use-data-table.ts
git commit -m "feat(data-table): add useDataTable hook for sort + pagination state"
```

---

## Task 2: Create `DataTablePagination` component

**Files:**
- Create: `components/data-table/data-table-pagination.tsx`

**Step 1: Write the component**

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface DataTablePaginationProps {
  page: number;
  pageCount: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function DataTablePagination({
  page,
  pageCount,
  totalCount,
  pageSize,
  onPageChange,
}: DataTablePaginationProps) {
  if (pageCount <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
      <span>
        {from}–{to} of {totalCount}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2 tabular-nums">
          {page} / {pageCount}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === pageCount}
          className="p-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify compile**

```bash
pnpm build 2>&1 | grep -E "error TS|✓|Failed"
```

**Step 3: Commit**

```bash
git add components/data-table/data-table-pagination.tsx
git commit -m "feat(data-table): add DataTablePagination component"
```

---

## Task 3: Create `DataTable` component

**Files:**
- Create: `components/data-table/data-table.tsx`
- Create: `components/data-table/index.ts`

**Step 1: Write the main component**

```tsx
"use client";

import { ReactNode } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { DataTablePagination } from "./data-table-pagination";
import { cn } from "@/lib/utils";
import type { SortDir } from "./use-data-table";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];          // pre-filtered, all items; DataTable handles sort + paginate
  pageSize?: number;  // 0 = no pagination
  isLoading?: boolean;
  skeletonRows?: number;
  onRowClick?: (row: T) => void;
  getRowClassName?: (row: T) => string;
  emptyMessage?: string;
  // sort state — passed in from useDataTable
  sortKey?: string;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  // pagination state — passed in from useDataTable
  page?: number;
  pageCount?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
  return dir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 ml-1" />
    : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
}

export function DataTable<T>({
  columns,
  data,
  pageSize = 15,
  isLoading,
  skeletonRows = 5,
  onRowClick,
  getRowClassName,
  emptyMessage = "No results",
  sortKey,
  sortDir = "asc",
  onSort,
  page = 1,
  pageCount = 1,
  totalCount,
  onPageChange,
}: DataTableProps<T>) {
  const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(alignClass[col.align ?? "left"], col.sortable && onSort && "cursor-pointer select-none")}
                onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
              >
                <span className="inline-flex items-center">
                  {col.header}
                  {col.sortable && onSort && (
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    <div className="h-4 rounded bg-muted animate-pulse" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-10">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, i) => (
              <TableRow
                key={i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  onRowClick && "cursor-pointer",
                  getRowClassName?.(row),
                )}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={alignClass[col.align ?? "left"]}>
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {onPageChange && pageSize > 0 && (
        <DataTablePagination
          page={page}
          pageCount={pageCount}
          totalCount={totalCount ?? data.length}
          pageSize={pageSize}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
```

**Step 2: Write the barrel export**

```ts
// components/data-table/index.ts
export { DataTable } from "./data-table";
export { DataTablePagination } from "./data-table-pagination";
export { useDataTable } from "./use-data-table";
export type { DataTableColumn } from "./data-table";
export type { SortDir } from "./use-data-table";
```

**Step 3: Verify compile**

```bash
pnpm build 2>&1 | grep -E "error TS|✓|Failed"
```

**Step 4: Commit**

```bash
git add components/data-table/
git commit -m "feat(data-table): add DataTable component with sort/paginate/skeleton/row-click"
```

---

## Task 4: Migrate `limits/page.tsx`

Limits is the simplest page — no sorting, no filtering, no pagination. Good warm-up migration.

**Files:**
- Modify: `app/(app)/limits/page.tsx`

**What changes:**
1. Remove raw `<table>` and replace with `<DataTable>`
2. Remove inline pencil edit button — row click opens the drawer instead
3. Delete button stays inline

**Step 1: Add imports at top of file**

Replace the existing import block by adding:
```ts
import { DataTable, type DataTableColumn } from "@/components/data-table";
```

**Step 2: Define columns above the `return` inside `LimitsPage`**

Add this before the `return` statement (after the existing hooks):
```tsx
const columns: DataTableColumn<VhostLimit>[] = [
  {
    key: "vhost",
    header: "Virtual Host",
    render: (limit) => <span className="font-mono font-medium">{limit.vhost}</span>,
  },
  {
    key: "max-connections",
    header: "Max Connections",
    render: (limit) => fmtLimit(limit.value["max-connections"]),
  },
  {
    key: "max-queues",
    header: "Max Queues",
    render: (limit) => fmtLimit(limit.value["max-queues"]),
  },
  {
    key: "actions",
    header: "",
    align: "right",
    render: (limit) => (
      <button
        onClick={(e) => { e.stopPropagation(); handleDelete(limit); }}
        disabled={deleting === limit.vhost}
        className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
        title="Delete"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
          <path d="M3 5h10M6 5V3h4v2M7 8v4M9 8v4M4 5l1 9h6l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    ),
  },
];
```

**Step 3: Replace table JSX in the return**

Replace the entire `<table>...</table>` block (lines 212–266) with:
```tsx
<DataTable
  columns={columns}
  data={limits ?? []}
  isLoading={!limits}
  pageSize={0}
  onRowClick={(limit) => openEdit(limit)}
  emptyMessage="No limits configured"
/>
```

**Step 4: Verify lint + build**

```bash
pnpm lint && pnpm build 2>&1 | grep -E "error|warning|✓|Failed"
```

**Step 5: Commit**

```bash
git add app/(app)/limits/page.tsx
git commit -m "feat(limits): migrate to DataTable, row click opens edit drawer"
```

---

## Task 5: Migrate `parameters/page.tsx`

No pagination, no sort. Same pattern as limits.

**Files:**
- Modify: `app/(app)/parameters/page.tsx`

**Step 1: Read the file first**

```bash
cat -n app/\(app\)/parameters/page.tsx
```

**Step 2: Add import**

```ts
import { DataTable, type DataTableColumn } from "@/components/data-table";
```

**Step 3: Define columns + replace table**

Identify the `Parameter` type columns (name, component, value, actions). Delete button stays with `e.stopPropagation()`. Row click calls the existing `openEdit` function.

Pattern for the actions column:
```tsx
{
  key: "actions",
  header: "",
  align: "right",
  render: (param) => (
    <button
      onClick={(e) => { e.stopPropagation(); handleDelete(param); }}
      ...
    />
  ),
},
```

**Step 4: Replace `<table>` with `<DataTable>`**

```tsx
<DataTable
  columns={columns}
  data={parameters ?? []}
  isLoading={!parameters}
  pageSize={0}
  onRowClick={(p) => openEdit(p)}
/>
```

**Step 5: Lint + build**

```bash
pnpm lint && pnpm build 2>&1 | grep -E "error|warning|✓|Failed"
```

**Step 6: Commit**

```bash
git add app/(app)/parameters/page.tsx
git commit -m "feat(parameters): migrate to DataTable, row click opens edit drawer"
```

---

## Task 6: Migrate `bindings/page.tsx`

No edit button (delete only). No row-click drawer currently — skip `onRowClick` for this one. Just standardize the table markup.

**Files:**
- Modify: `app/(app)/bindings/page.tsx`

**Step 1: Read the file**

```bash
cat -n app/\(app\)/bindings/page.tsx
```

**Step 2: Add import + define columns**

Columns: source exchange, vhost, destination, routing key, arguments, delete action. Delete button with `e.stopPropagation()`.

**Step 3: Replace `<table>` with `<DataTable>`**

```tsx
<DataTable
  columns={columns}
  data={filtered}
  pageSize={0}
  emptyMessage="No bindings found"
/>
```

**Step 4: Lint + build + commit**

```bash
pnpm lint && pnpm build
git add app/(app)/bindings/page.tsx
git commit -m "feat(bindings): migrate to DataTable"
```

---

## Task 7: Migrate `users/page.tsx`

Has inline pencil edit + delete buttons. Convert to row-click for edit, keep delete inline.

**Files:**
- Modify: `app/(app)/users/page.tsx`

**Step 1: Read the file**

```bash
cat -n app/\(app\)/users/page.tsx
```

**Step 2: Wire up sort + pagination with `useDataTable`**

```tsx
import { DataTable, useDataTable, type DataTableColumn } from "@/components/data-table";

// inside component:
const { pagedData, sortKey, sortDir, toggleSort, page, setPage, pageCount } = useDataTable({
  data: filtered,
  pageSize: 10,
  getSortValue: (user, key) => (user as Record<string, unknown>)[key] as string ?? "",
});
```

**Step 3: Define columns**

Username column shows "You" badge. Tags column shows badge list. Actions column: delete button only (no pencil). Row click opens edit drawer.

```tsx
const columns: DataTableColumn<User>[] = [
  { key: "name", header: "Username", sortable: true, render: (u) => (
    <span className="font-medium">
      {u.name}
      {u.name === currentUser && <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">You</span>}
    </span>
  )},
  { key: "tags", header: "Tags", render: (u) => /* existing tag badge logic */ },
  { key: "actions", header: "", align: "right", render: (u) => (
    <button onClick={(e) => { e.stopPropagation(); openDeleteConfirm(u); }} ...>
      {/* trash icon */}
    </button>
  )},
];
```

**Step 4: Replace table + pagination with `<DataTable>`**

```tsx
<DataTable
  columns={columns}
  data={pagedData}
  onRowClick={(u) => openEdit(u)}
  pageSize={10}
  page={page}
  pageCount={pageCount}
  totalCount={filtered.length}
  onPageChange={setPage}
/>
```

**Step 5: Lint + build + commit**

```bash
pnpm lint && pnpm build
git add app/(app)/users/page.tsx
git commit -m "feat(users): migrate to DataTable, row click opens edit drawer"
```

---

## Task 8: Migrate `permissions/page.tsx`

Has inline edit + delete. Row-click for edit, delete stays inline. Has pagination.

**Files:**
- Modify: `app/(app)/permissions/page.tsx`

**Step 1: Read file, identify current pagination and filter logic**

```bash
cat -n app/\(app\)/permissions/page.tsx
```

**Step 2: Add `useDataTable` + `DataTable` import, define columns**

Preserve the amber row highlight for no-access rows via `getRowClassName`:
```tsx
getRowClassName={(perm) =>
  perm.configure === "" && perm.write === "" && perm.read === ""
    ? "bg-amber-50/60 dark:bg-amber-900/10"
    : ""
}
```

Actions column: delete button only with `e.stopPropagation()`.

**Step 3: Wire pagination through `useDataTable`**

**Step 4: Replace table + pagination**

**Step 5: Lint + build + commit**

```bash
pnpm lint && pnpm build
git add app/(app)/permissions/page.tsx
git commit -m "feat(permissions): migrate to DataTable, row click opens edit drawer"
```

---

## Task 9: Migrate `channels/page.tsx`

Has custom `SortTh` component, custom sort state, pagination. Migrate sort state to `useDataTable`.

**Files:**
- Modify: `app/(app)/channels/page.tsx`

**Step 1: Read current sort + pagination logic**

Review lines 220–330 for sort state and the `SortTh` component definition.

**Step 2: Remove `SortTh`, remove manual sort state (`sortKey`, `setSortKey`, `sortDir`, `setSortDir`, `page`, `setPage`)**

**Step 3: Add `useDataTable` with `getSortValue`**

```tsx
const { pagedData, sortKey, sortDir, toggleSort, page, setPage, pageCount } = useDataTable({
  data: filtered,
  pageSize: 10,
  defaultSortKey: "name",
  getSortValue: (ch, key) => {
    const map: Record<string, unknown> = {
      name: ch.name,
      vhost: ch.vhost,
      state: ch.state,
      messages_unacknowledged: ch.messages_unacknowledged,
      prefetch_count: ch.prefetch_count,
      consumer_count: ch.consumer_count,
    };
    return (map[key] as string | number) ?? "";
  },
});
```

**Step 4: Define columns with sortable flags**

Use `onRowClick` for the existing `setSelected(ch)` call.

Preserve rose row highlight for blocked:
```tsx
getRowClassName={(ch) =>
  ch.state === "blocked"
    ? "bg-rose-50/60 dark:bg-rose-900/10 hover:bg-rose-50"
    : ""
}
```

**Step 5: Replace table + `SortTh` with `<DataTable>`**

**Step 6: Lint + build + commit**

```bash
pnpm lint && pnpm build
git add app/(app)/channels/page.tsx
git commit -m "feat(channels): migrate to DataTable, remove SortTh, use useDataTable"
```

---

## Task 10: Migrate `exchanges/page.tsx`

Already uses shadcn Table. Has custom `SortButton` component, custom sort state. Migrate sort state to `useDataTable`, replace `SortButton` with DataTable's built-in sort icons.

**Files:**
- Modify: `app/(app)/exchanges/page.tsx`

**Step 1: Read current SortButton + sort state**

Review lines 1–100 for `SortButton` definition and sort state initialization.

**Step 2: Remove `SortButton` component + manual sort state**

**Step 3: Add `useDataTable`**

Note: exchanges page passes **all** filtered data (no pre-slicing for pagination). Exchanges page currently has no pagination (shows all). Pass `pageSize={0}`.

```tsx
const { pagedData: sortedData, sortKey, sortDir, toggleSort } = useDataTable({
  data: filtered,
  pageSize: 0,
  defaultSortKey: "name",
  getSortValue: (ex, key) => {
    if (key === "bindings") return bindingsCountMap.get(`${ex.vhost}/${ex.name}`) ?? 0;
    return (ex as Record<string, unknown>)[key] as string ?? "";
  },
});
```

**Step 4: Replace `Table`/`TableHeader`/`TableBody` with `<DataTable>`**

Preserve the existing `onClick={() => setSelected(exchange)}` row behavior via `onRowClick`.

Preserve opacity-60 for system/default exchanges via `getRowClassName`.

**Step 5: Remove unused imports (`Table`, `TableHeader`, etc.) — now provided by DataTable**

**Step 6: Lint + build + commit**

```bash
pnpm lint && pnpm build
git add app/(app)/exchanges/page.tsx
git commit -m "feat(exchanges): migrate to DataTable, remove SortButton"
```

---

## Task 11: Migrate `connections/page.tsx`

Already uses shadcn Table. Has pagination. Nested channels table inside the detail drawer — migrate that nested table too.

**Files:**
- Modify: `app/(app)/connections/page.tsx`

**Step 1: Read sort + pagination state**

**Step 2: Add `useDataTable`, define columns**

The nested channels table inside `DetailDrawer` is simple (no sort/paginate) — convert it to `<DataTable pageSize={0}>` as well.

**Step 3: Replace outer table + nested drawer table**

**Step 4: Lint + build + commit**

```bash
pnpm lint && pnpm build
git add app/(app)/connections/page.tsx
git commit -m "feat(connections): migrate to DataTable, including nested channels table"
```

---

## Task 12: Migrate `vhosts/page.tsx`

Already uses shadcn Table. Has a nested permissions table and cluster state table inside the drawer.

**Files:**
- Modify: `app/(app)/vhosts/page.tsx`

**Step 1: Read the existing table + drawer**

**Step 2: Migrate outer vhosts table to `<DataTable>`**

**Step 3: Migrate nested tables inside drawer (user permissions grid, cluster state) to `<DataTable pageSize={0}>`**

**Step 4: Lint + build + commit**

```bash
pnpm lint && pnpm build
git add app/(app)/vhosts/page.tsx
git commit -m "feat(vhosts): migrate to DataTable including drawer nested tables"
```

---

## Task 13: Migrate `feature-flags/page.tsx`

Three separate tables grouped by state (enabled / disabled / unavailable). No row-click needed (enable/disable is the action). Convert each raw table to `<DataTable pageSize={0}>`.

**Files:**
- Modify: `app/(app)/feature-flags/page.tsx`

**Step 1: Read the file**

```bash
cat -n app/\(app\)/feature-flags/page.tsx
```

**Step 2: Define a single shared `columns` array used by all three tables**

The "Enable" button in the actions column stays inline — it is an action, not navigation. No `onRowClick`.

**Step 3: Replace all three raw `<table>` blocks**

Each section becomes:
```tsx
<DataTable
  columns={columns}
  data={enabledFlags}
  pageSize={0}
  emptyMessage="No enabled flags"
/>
```

**Step 4: Lint + build + commit**

```bash
pnpm lint && pnpm build
git add app/(app)/feature-flags/page.tsx
git commit -m "feat(feature-flags): migrate all three tables to DataTable"
```

---

## Task 14: Migrate `queues/page.tsx`

Most complex page. Has custom sort, pagination, inline actions (peek/publish/purge/trace). Tackle last.

**Files:**
- Modify: `app/(app)/queues/page.tsx`

**Step 1: Read the full page**

```bash
wc -l app/\(app\)/queues/page.tsx
cat -n app/\(app\)/queues/page.tsx | head -200
```

**Step 2: Identify all sort state, pagination state, and the table JSX block**

**Step 3: Replace sort state with `useDataTable`**

The queue page likely has complex `getSortValue` — implement it to match the existing sort fields.

**Step 4: Preserve inline action buttons**

Peek/publish/purge/trace buttons live in the last column. Keep them with `e.stopPropagation()`. Row click opens the detail drawer.

**Step 5: Lint + build + commit**

```bash
pnpm lint && pnpm build
git add app/(app)/queues/page.tsx
git commit -m "feat(queues): migrate to DataTable, row click opens detail drawer"
```

---

## Task 15: Final verification

**Step 1: Full lint + build**

```bash
pnpm lint && pnpm build
```

Expected: zero errors, zero warnings.

**Step 2: Remove `SortTh`, `SortButton`, or any other one-off sort header components that are now unused**

```bash
rg "SortTh|SortButton" app/ --files-with-matches
```

If a file only had the component defined and used internally and you've removed both — delete the definition too.

**Step 3: Verify no raw `<table>` tags remain in page files**

```bash
rg "<table" app/\(app\)/ --files-with-matches
```

Expected: zero matches (or only legitimate exceptions like the dashboard nodes table).

**Step 4: Final commit**

```bash
git add -u
git commit -m "chore(data-table): remove leftover one-off table components after migration"
```
