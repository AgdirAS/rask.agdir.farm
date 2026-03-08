# Server Color Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let each RabbitMQ environment have a background and text color that gets applied to the sidebar's ServerPanel, so users can instantly tell which server they're on (e.g. orange = staging, red = production).

**Architecture:** Store `bgColor`/`textColor` as env-file variables (`RASK_ENV_BG_COLOR`, `RASK_ENV_TEXT_COLOR`) alongside existing fields. Extend the `EnvEntry` type, update serialization/parsing, add color pickers to `EnvGateway` forms, and apply the active env's colors as inline styles on the sidebar `ServerPanel`.

**Tech Stack:** Next.js 15, TypeScript, TailwindCSS v4, shadcn/ui, TanStack Query

---

### Task 1: Extend `EnvEntry` type and env serialization

**Files:**
- Modify: `lib/types.ts` (EnvEntry interface)
- Modify: `lib/env.ts` (serializeEnv, listEnvs, createEnv, updateEnv)

**Step 1: Add optional color fields to `EnvEntry`**

In `lib/types.ts`, update the `EnvEntry` interface (currently at line 183):

```ts
export interface EnvEntry {
  slug: string;
  name: string;
  managementUrl: string;
  amqpPort: string;
  user: string;
  password: string;
  vhost: string;
  bgColor?: string;   // hex color e.g. "#ff4400"
  textColor?: string; // hex color e.g. "#ffffff"
}
```

**Step 2: Update `serializeEnv` to write color fields**

In `lib/env.ts`, the `serializeEnv` function (line 109) currently builds a 6-line string. Update it to append color lines when set:

```ts
function serializeEnv(entry: EnvEntry): string {
  const lines = [
    `RABBITMQ_MANAGEMENT_URL=${entry.managementUrl}`,
    `RABBITMQ_AMQP_PORT=${entry.amqpPort}`,
    `RABBITMQ_USER=${entry.user}`,
    `RABBITMQ_PASSWORD=${entry.password}`,
    `RABBITMQ_VHOST=${entry.vhost}`,
    `RASK_ENV_NAME=${entry.name}`,
  ];
  if (entry.bgColor) lines.push(`RASK_ENV_BG_COLOR=${entry.bgColor}`);
  if (entry.textColor) lines.push(`RASK_ENV_TEXT_COLOR=${entry.textColor}`);
  return lines.join("\n");
}
```

**Step 3: Update `listEnvs` to parse color fields**

In `lib/env.ts`, the `listEnvs` function builds the return object (line 138). Add color fields:

```ts
return {
  slug,
  name: vars.RASK_ENV_NAME ?? slug,
  managementUrl: vars.RABBITMQ_MANAGEMENT_URL ?? "http://localhost:15672",
  amqpPort: vars.RABBITMQ_AMQP_PORT ?? "5672",
  user: vars.RABBITMQ_USER ?? "guest",
  password: vars.RABBITMQ_PASSWORD ?? "guest",
  vhost: vars.RABBITMQ_VHOST ?? "/",
  bgColor: vars.RASK_ENV_BG_COLOR || undefined,
  textColor: vars.RASK_ENV_TEXT_COLOR || undefined,
};
```

**Step 4: Verify build passes**

```bash
pnpm build
```
Expected: clean build, no TypeScript errors.

**Step 5: Commit**

```bash
git add lib/types.ts lib/env.ts
git commit -m "feat(envs): add bgColor and textColor fields to EnvEntry"
```

---

### Task 2: Update API routes to pass through color fields

**Files:**
- Modify: `app/api/envs/route.ts` (POST handler, line 27-35)
- Modify: `app/api/envs/[slug]/route.ts` (PUT handler, line 32-40)

**Step 1: Update POST route**

In `app/api/envs/route.ts`, the `entry` construction (line 27) needs to include color fields:

```ts
const entry: EnvEntry = {
  slug: body.slug,
  name: body.name ?? body.slug,
  managementUrl: body.managementUrl ?? "http://localhost:15672",
  amqpPort: body.amqpPort ?? "5672",
  user: body.user ?? "guest",
  password: body.password ?? "guest",
  vhost: body.vhost ?? "/",
  bgColor: body.bgColor || undefined,
  textColor: body.textColor || undefined,
};
```

**Step 2: Update PUT route**

In `app/api/envs/[slug]/route.ts`, the `entry` construction (line 32) needs color fields:

```ts
const entry: EnvEntry = {
  slug,
  name: body.name ?? slug,
  managementUrl: body.managementUrl ?? "http://localhost:15672",
  amqpPort: body.amqpPort ?? "5672",
  user: body.user ?? "guest",
  password: body.password ?? "guest",
  vhost: body.vhost ?? "/",
  bgColor: body.bgColor || undefined,
  textColor: body.textColor || undefined,
};
```

**Step 3: Verify build**

```bash
pnpm build
```

**Step 4: Commit**

```bash
git add app/api/envs/route.ts app/api/envs/[slug]/route.ts
git commit -m "feat(envs): pass bgColor and textColor through API routes"
```

---

### Task 3: Add color pickers to `EnvGateway` forms

**Files:**
- Modify: `components/env-gateway.tsx`

There are two forms: the **edit form** (inside `row.expanded`) and the **new-env form** (`newRow`). Add a color picker row to each.

**Step 1: Add color pickers to the edit form**

In the expanded edit form section (around line 322, inside `{row.expanded && ...}`), add a color row after the VHost field (before the save error display):

```tsx
{/* Colors */}
<div className="grid grid-cols-2 gap-2">
  <div className="space-y-1">
    <Label className="text-xs">Background Color</Label>
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={row.draft.bgColor ?? "#000000"}
        onChange={(e) => setDraftField(i, "bgColor", e.target.value)}
        className="h-8 w-8 cursor-pointer rounded border p-0.5"
      />
      {row.draft.bgColor && (
        <button
          onClick={() => setDraftField(i, "bgColor", "")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          clear
        </button>
      )}
    </div>
  </div>
  <div className="space-y-1">
    <Label className="text-xs">Text Color</Label>
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={row.draft.textColor ?? "#ffffff"}
        onChange={(e) => setDraftField(i, "textColor", e.target.value)}
        className="h-8 w-8 cursor-pointer rounded border p-0.5"
      />
      {row.draft.textColor && (
        <button
          onClick={() => setDraftField(i, "textColor", "")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          clear
        </button>
      )}
    </div>
  </div>
</div>
```

Note: `setDraftField` uses `keyof EnvEntry` — since `bgColor` and `textColor` are now on the type, this works without changes.

**Step 2: Add color pickers to the new-env form**

The `newRow` state uses `EnvEntry & { slugError?: string; testState: TestState; testError: string }`. Add color fields after the VHost field in the new-env form (around line 455):

```tsx
{/* Colors */}
<div className="grid grid-cols-2 gap-2">
  <div className="space-y-1">
    <Label className="text-xs">Background Color</Label>
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={newRow.bgColor ?? "#000000"}
        onChange={(e) => setNewRow((r) => r ? { ...r, bgColor: e.target.value } : r)}
        className="h-8 w-8 cursor-pointer rounded border p-0.5"
      />
      {newRow.bgColor && (
        <button
          onClick={() => setNewRow((r) => r ? { ...r, bgColor: "" } : r)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          clear
        </button>
      )}
    </div>
  </div>
  <div className="space-y-1">
    <Label className="text-xs">Text Color</Label>
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={newRow.textColor ?? "#ffffff"}
        onChange={(e) => setNewRow((r) => r ? { ...r, textColor: e.target.value } : r)}
        className="h-8 w-8 cursor-pointer rounded border p-0.5"
      />
      {newRow.textColor && (
        <button
          onClick={() => setNewRow((r) => r ? { ...r, textColor: "" } : r)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          clear
        </button>
      )}
    </div>
  </div>
</div>
```

**Step 3: Verify build**

```bash
pnpm build
```

**Step 4: Commit**

```bash
git add components/env-gateway.tsx
git commit -m "feat(envs): add background and text color pickers to env forms"
```

---

### Task 4: Apply active env colors to `ServerPanel` in the sidebar

**Files:**
- Modify: `components/layout/sidebar.tsx`

The sidebar already has a `ServerPanel` component that shows the active server's cluster name and status. We need to:
1. Fetch the active env's colors from `/api/envs`
2. Apply them as inline styles on the `ServerPanel` wrapper div

**Step 1: Add a query for env colors inside `ServerPanel`**

`ServerPanel` is a client component (file starts with `"use client"`). Add a query alongside the existing `overview` query:

```tsx
function ServerPanel({ onSwitchEnv }: { onSwitchEnv: () => void }) {
  const { data: overview, isError } = useQuery<Overview>({ /* existing */ });

  const { data: envData } = useQuery<{ envs: EnvEntry[]; active: string | null }>({
    queryKey: ["envs"],
    queryFn: async () => {
      const res = await fetch("/api/envs");
      const json = (await res.json()) as { data?: { envs: EnvEntry[]; active: string | null } };
      return json.data ?? { envs: [], active: null };
    },
    staleTime: 30_000,
  });

  const activeEnv = envData?.envs.find((e) => e.slug === envData.active);
  const bgColor = activeEnv?.bgColor || undefined;
  const textColor = activeEnv?.textColor || undefined;

  // ... rest of component
```

You'll need to import `EnvEntry` at the top: `import type { Overview, EnvEntry } from "@/lib/types";`

**Step 2: Apply colors to the panel wrapper**

Update the `ServerPanel` return's outer `<div>` to carry the inline style:

```tsx
return (
  <div
    className="border-b px-3 py-2 space-y-1 transition-colors"
    style={bgColor ? { backgroundColor: bgColor, color: textColor } : undefined}
  >
```

The `transition-colors` class gives a smooth transition when switching envs. The conditional style only applies when `bgColor` is set — otherwise falls through to the default sidebar theme colors.

**Step 3: Verify build**

```bash
pnpm build
```

**Step 4: Manual test**

1. Run `pnpm dev`
2. Open http://localhost:35672
3. Open "Switch Environment", expand an env, pick an orange background and white text, save
4. Connect to that env — the `ServerPanel` top of sidebar should turn orange with white text
5. Switch to a different env without colors — panel reverts to default sidebar background

**Step 5: Commit**

```bash
git add components/layout/sidebar.tsx
git commit -m "feat(sidebar): apply active env background and text color to ServerPanel"
```

---

### Task 5: Final lint + build check

```bash
pnpm lint && pnpm build
```

Expected: zero errors, zero warnings. If any TypeScript errors appear they will be from the new fields — fix by ensuring `EnvEntry` import is present in all modified files.
