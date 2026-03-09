# DataTable Standardization Design

**Date:** 2026-03-07
**Status:** Approved

## Goal

Standardize all table UIs across Rask into a shared `<DataTable>` component, and make row-click the consistent interaction pattern for opening detail/edit drawers.

## Scope

### Pages with tables to migrate

| Page | Current impl | Has row click? | Has pencil/edit btn? |
|---|---|---|---|
| queues | raw HTML (complex) | yes | no |
| exchanges | shadcn Table | yes | no |
| connections | shadcn Table | yes | no |
| channels | raw HTML | yes | no |
| bindings | raw HTML | no | no (delete only) |
| users | raw HTML | no | yes → convert to row click |
| vhosts | shadcn Table | yes | no |
| limits | raw HTML | no | yes → convert to row click |
| permissions | raw HTML | no | yes → convert to row click |
| parameters | raw HTML | no | yes → convert to row click |
| policies | raw HTML (TBD) | TBD | TBD |
| feature-flags | raw HTML (3 tables) | no | no (enable btn stays) |

### Interaction standardization

- **Row click** opens detail/edit drawer on all pages
- Remove inline pencil/edit icon buttons from: users, permissions, limits, parameters
- Delete buttons remain inline (destructive actions should stay explicit)
- feature-flags "Enable" button stays inline (it's an action, not navigation)

## Architecture

### No new dependencies

Use existing shadcn `Table` primitives + custom hook. No `@tanstack/react-table`.

### File structure

```
components/
  data-table/
    data-table.tsx            ← main component
    data-table-pagination.tsx ← shared pagination UI
    use-data-table.ts         ← sort + paginate state hook
```

Filters stay page-level (too varied to generalize). Pages pass already-filtered data to `<DataTable>`.

### Column definition type

```ts
type DataTableColumn<T> = {
  key: string
  header: string
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  render: (row: T) => ReactNode
}
```

### DataTable props

```ts
type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  data: T[]
  pageSize?: number          // default 15, pass 0 for no pagination
  onRowClick?: (row: T) => void
  isLoading?: boolean
  skeletonRows?: number      // default 5
  getRowClassName?: (row: T) => string  // for colored rows (blocked, amber, etc.)
}
```

### useDataTable hook

Handles:
- Sort state (key + direction)
- Pagination (current page, derived slice)
- Returns: `sortedData`, `pagedData`, `sort`, `setSort`, `page`, `setPage`, `pageCount`

Pages handle filtering with their own `useMemo` on raw data, then pass filtered array to `<DataTable>`.

## Interaction pattern

```
User clicks row
  → onRowClick(row) fires
  → page sets selectedItem state
  → drawer opens with item detail/edit

User clicks delete button (inline)
  → confirm dialog
  → mutation fires
  → table refetches
```

## Migration order

1. Build `DataTable` component + hook
2. Migrate simple pages first: bindings, limits, parameters
3. Migrate medium pages: users, permissions, channels
4. Migrate complex pages: exchanges, connections, vhosts, feature-flags
5. Migrate queues last (most complex)
