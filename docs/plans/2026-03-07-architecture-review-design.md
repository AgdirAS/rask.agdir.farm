# Architecture Review & Refactor Plan

**Date:** 2026-03-07
**Scope:** Full codebase review — bug fix, surgical cleanup, header-toolbar migration completion, structural improvements

---

## Infinite Loop Bug (Critical)

### Root cause

`policies/page.tsx` line 773:

```ts
// ❌ = [] creates a NEW array reference on every render when data is undefined
const { data: vhosts = [] } = useQuery<Vhost[]>({ ... });
const vhostNames = useMemo(() => vhosts.map((v) => v.name).sort(), [vhosts]);
useEffect(() => { setActions(<JSX with vhostNames>) }, [..., vhostNames, setActions]);
```

Loop chain:
1. `data` is `undefined` on first render → `vhosts` defaults to `[]` (new reference)
2. `useMemo([vhosts])` recomputes → `vhostNames` is a new `[]` reference
3. `useEffect([..., vhostNames, ...])` sees dep changed → runs → `setActions(JSX)`
4. `HeaderActionsProvider` context updates → all consumers re-render (including policies page)
5. Goto 1 → "Maximum update depth exceeded"

### Fix

```ts
// ✅ vhostsData is stable undefined until loaded — useMemo only recomputes when data arrives
const { data: vhostsData } = useQuery<Vhost[]>({ ... });
const vhostNames = useMemo(() => (vhostsData ?? []).map((v) => v.name).sort(), [vhostsData]);
```

**Rule:** Never use `= []` as a destructuring default for query data that feeds into `useMemo` dep arrays or `useEffect` dep arrays. Keep fallbacks inside the computation, not in the destructuring.

### Secondary fix

`HeaderActionsProvider` creates a new context value object on every render:
```ts
// ❌ new object reference every render → all consumers re-render unnecessarily
<HeaderActionsCtx.Provider value={{ actions, setActions }}>

// ✅ stable reference unless actions actually changes
const value = useMemo(() => ({ actions, setActions }), [actions]);
<HeaderActionsCtx.Provider value={value}>
```

---

## Header-Toolbar Migration Status

Moving search/filter/action toolbars from inline `<Toolbar>` in page body into the app header via `HeaderActionsContext`.

### Two patterns in use

**Pattern A — `useSetHeaderActions(node)`** (static action buttons only)
- Mount-only (`[]` deps), stale closure is acceptable because `onClick` handlers only call stable `useState` setters
- Do NOT use if the JSX contains data-driven content (dropdowns populated from fetched data)

**Pattern B — `setActions` in `useEffect` with deps** (dynamic filters)
- Required when toolbar contains search inputs or dropdowns populated from fetched data
- The infinite loop bug above came from incorrect dep array hygiene in this pattern
- Rule: never let an unstable reference enter the dep array

### Migration status

| Page | Status | Pattern |
|---|---|---|
| vhosts | ✅ Migrated | A — Add Vhost button |
| limits | ✅ Migrated | A — Add Limit button |
| users | ✅ Migrated | A — Add User button |
| parameters | ✅ Migrated | A — Add Parameter button |
| permissions | ✅ Migrated | A — Add Permission button |
| policies | ✅ Migrated | B — search + vhost/apply-to filters (bug fixed) |
| bindings | ✅ Migrated | B — search + vhost/exchange filters |
| exchanges | ❌ Not migrated | Inline `<Toolbar>` |
| connections | ❌ Not migrated | Inline `<Toolbar>` |
| queues | ❌ Not migrated | Inline `<Toolbar>` |
| channels | ❌ Not migrated | Inline `<Toolbar>` |
| feature-flags | ❌ Not migrated | Inline `<Toolbar>` |

---

## Surgical Cleanup (no file restructure)

1. **Duplicate `relativeTime`** — defined in both `lib/utils.ts` and `connections/page.tsx`. Delete the local copy, import from `lib/utils.ts`.

2. **Duplicate `fmtBytes`** — 2–3 slightly different implementations across pages. Consolidate into `lib/utils.ts` with two exports: `fmtBytes(bytes)` (size) and `fmtRate(bytes)` (rate with `/s`).

3. **Inconsistent component usage in `connections/page.tsx`** — only page still using raw `<table>`, `<button>`, `<input>` HTML elements. All other pages use shadcn `<Table>`, `<Button>`, `<Input>`. Standardize to shadcn.

---

## Structural Improvements

### `lib/api.ts` — browser-safe API client

Currently every page writes raw `fetch("/api/rabbitmq/...")` inline inside `useQuery` `queryFn`. Create a typed client module mirroring the shape of `lib/rabbitmq.ts` but targeting the Next.js proxy routes.

```ts
// lib/api.ts
export async function apiGetExchanges(): Promise<Exchange[]> { ... }
export async function apiDeleteExchange(vhost: string, name: string): Promise<void> { ... }
// etc.
```

### `lib/hooks.ts` — shared query hooks

Encapsulate `queryKey` + `queryFn` + `refetchInterval` into named hooks. Pages import these instead of inline `useQuery`.

```ts
export function useExchanges() { return useQuery({ queryKey: ["exchanges"], queryFn: apiGetExchanges, refetchInterval: 10_000 }); }
export function useQueues() { ... }
export function useConnections() { ... }
export function useBindings() { ... }
export function useVhosts() { ... }
```

### Detail drawers — adopt shadcn `<Sheet>`

The backdrop + fixed right panel + header/body/footer drawer pattern is re-implemented from scratch in at least 4 pages (exchanges, connections, queues, bindings). The shadcn `Sheet` component was already added to the project. Migrate all detail drawers to use it.

---

## Implementation Order

1. **Bug fix** — `policies/page.tsx` + `HeaderActionsProvider` memoization
2. **Surgical cleanup** — utils consolidation + connections page shadcn standardization
3. **Header migration** — migrate remaining 5 pages (exchanges, connections, queues, channels, feature-flags)
4. **`lib/api.ts`** — client API module
5. **`lib/hooks.ts`** — shared query hooks
6. **Sheet adoption** — replace custom drawers
