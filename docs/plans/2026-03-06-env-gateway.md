# Environment Gateway Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Multi-environment switcher — named RabbitMQ configs stored as `.envs/{slug}.env` files, `.env.local` symlinked to the active one, full-screen gateway on app load when no session selection exists.

**Architecture:** Server stores env files in `.envs/`. Active env is a symlink at `.env.local` pointing to the chosen file. `lib/env.ts` already reads `.env.local` with `fs.readFileSync` on every request, so symlink updates take effect immediately. The gateway is a client-side overlay triggered by `sessionStorage` — each browser tab independently prompts until an env is chosen.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, TailwindCSS v4, shadcn/ui, Node.js `fs` + `path`

---

## Key Constraints

- No inline `any` in TypeScript
- All API routes return `{ data, error }` shape
- `.envs/` must be gitignored and never served as a static file
- Symlink operations are Unix-only (`fs.symlinkSync`) — acceptable for this tool
- Slug validation regex: `/^[a-z0-9][a-z0-9_-]*$/`

---

## Task 1: Update .gitignore + types

**Files:**
- Modify: `.gitignore`
- Modify: `lib/types.ts`

**Step 1: Add `.envs/` to .gitignore**

Open `.gitignore` and add after the `.env*` block:
```
.envs/
```

**Step 2: Add `EnvEntry` type to `lib/types.ts`**

Append to `lib/types.ts`:
```typescript
export interface EnvEntry {
  slug: string;
  name: string;
  host: string;
  managementPort: string;
  amqpPort: string;
  user: string;
  password: string;
  vhost: string;
}

export interface EnvListResponse {
  envs: EnvEntry[];
  active: string | null; // slug of active env, or null
}
```

**Step 3: Verify TypeScript still compiles**

```bash
pnpm build 2>&1 | tail -5
```
Expected: build succeeds.

**Step 4: Commit**

```bash
git add .gitignore lib/types.ts
git commit -m "feat(env): add EnvEntry types and gitignore .envs/"
```

---

## Task 2: Extend `lib/env.ts` with multi-env helpers

**Files:**
- Modify: `lib/env.ts`

The existing `readEnvFile()` / `writeEnvFile()` / `getConnectionConfig()` stay unchanged. Add these new exports below them:

**Step 1: Add multi-env helpers**

Append to the bottom of `lib/env.ts`:

```typescript
const ENVS_DIR = path.join(process.cwd(), ".envs");
const SYMLINK_PATH = path.join(process.cwd(), ".env.local");
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function validateSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

function envFilePath(slug: string): string {
  return path.join(ENVS_DIR, `${slug}.env`);
}

function parseEnvFileContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    result[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
  }
  return result;
}

function serializeEnv(entry: import("./types").EnvEntry): string {
  return [
    `RABBITMQ_HOST=${entry.host}`,
    `RABBITMQ_MANAGEMENT_PORT=${entry.managementPort}`,
    `RABBITMQ_AMQP_PORT=${entry.amqpPort}`,
    `RABBITMQ_USER=${entry.user}`,
    `RABBITMQ_PASSWORD=${entry.password}`,
    `RABBITMQ_VHOST=${entry.vhost}`,
    `RASK_ENV_NAME=${entry.name}`,
  ].join("\n");
}

export function getActiveSlug(): string | null {
  try {
    const target = fs.readlinkSync(SYMLINK_PATH);
    const basename = path.basename(target, ".env");
    return basename || null;
  } catch {
    return null;
  }
}

export function listEnvs(): import("./types").EnvEntry[] {
  try {
    fs.mkdirSync(ENVS_DIR, { recursive: true });
    const files = fs.readdirSync(ENVS_DIR).filter((f) => f.endsWith(".env"));
    return files.map((file) => {
      const slug = path.basename(file, ".env");
      const content = fs.readFileSync(path.join(ENVS_DIR, file), "utf-8");
      const vars = parseEnvFileContent(content);
      return {
        slug,
        name: vars.RASK_ENV_NAME ?? slug,
        host: vars.RABBITMQ_HOST ?? "localhost",
        managementPort: vars.RABBITMQ_MANAGEMENT_PORT ?? "15672",
        amqpPort: vars.RABBITMQ_AMQP_PORT ?? "5672",
        user: vars.RABBITMQ_USER ?? "guest",
        password: vars.RABBITMQ_PASSWORD ?? "guest",
        vhost: vars.RABBITMQ_VHOST ?? "/",
      };
    });
  } catch {
    return [];
  }
}

export function createEnv(entry: import("./types").EnvEntry): void {
  fs.mkdirSync(ENVS_DIR, { recursive: true });
  fs.writeFileSync(envFilePath(entry.slug), serializeEnv(entry), "utf-8");
}

export function deleteEnv(slug: string): void {
  const filePath = envFilePath(slug);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  // Clear symlink if it was pointing to this slug
  if (getActiveSlug() === slug) {
    try { fs.unlinkSync(SYMLINK_PATH); } catch { /* already gone */ }
  }
}

export function activateEnv(slug: string): void {
  const target = envFilePath(slug);
  if (!fs.existsSync(target)) throw new Error(`Env not found: ${slug}`);
  // Remove existing symlink/file at .env.local
  try { fs.unlinkSync(SYMLINK_PATH); } catch { /* doesn't exist */ }
  fs.symlinkSync(target, SYMLINK_PATH);
}
```

**Step 2: Verify build**

```bash
pnpm build 2>&1 | tail -5
```
Expected: success.

**Step 3: Commit**

```bash
git add lib/env.ts
git commit -m "feat(env): multi-env file helpers — list, create, delete, activate"
```

---

## Task 3: API routes for env management

**Files:**
- Create: `app/api/envs/route.ts`
- Create: `app/api/envs/[slug]/route.ts`
- Create: `app/api/envs/[slug]/activate/route.ts`

**Step 1: Create `app/api/envs/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { listEnvs, createEnv, validateSlug, getActiveSlug } from "@/lib/env";
import type { EnvEntry } from "@/lib/types";

export async function GET() {
  try {
    const envs = listEnvs();
    const active = getActiveSlug();
    return NextResponse.json({ data: { envs, active } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list envs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<EnvEntry>;
    if (!body.slug || !validateSlug(body.slug)) {
      return NextResponse.json({ error: "Invalid slug. Use lowercase letters, digits, hyphens, underscores." }, { status: 400 });
    }
    const entry: EnvEntry = {
      slug: body.slug,
      name: body.name ?? body.slug,
      host: body.host ?? "localhost",
      managementPort: body.managementPort ?? "15672",
      amqpPort: body.amqpPort ?? "5672",
      user: body.user ?? "guest",
      password: body.password ?? "guest",
      vhost: body.vhost ?? "/",
    };
    createEnv(entry);
    return NextResponse.json({ data: entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create env";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Create `app/api/envs/[slug]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { deleteEnv } from "@/lib/env";

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    deleteEnv(slug);
    return NextResponse.json({ data: { deleted: slug } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete env";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 3: Create `app/api/envs/[slug]/activate/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { activateEnv } from "@/lib/env";

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    activateEnv(slug);
    return NextResponse.json({ data: { active: slug } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to activate env";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 4: Verify build**

```bash
pnpm build 2>&1 | tail -5
```
Expected: success. Routes appear in build output.

**Step 5: Commit**

```bash
git add app/api/envs/
git commit -m "feat(env): API routes — list, create, delete, activate envs"
```

---

## Task 4: `EnvGateway` component

**Files:**
- Create: `components/env-gateway.tsx`

This is a `"use client"` full-screen overlay. It:
1. On mount: checks `sessionStorage`, fetches `/api/envs`
2. If session set OR active symlink exists: calls `onReady(activeSlug)` immediately
3. Otherwise: shows the gateway UI
4. On env select: calls `POST /api/envs/[slug]/activate`, sets sessionStorage, calls `onReady`

**Step 1: Create `components/env-gateway.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus, Server, ChevronRight, Loader2 } from "lucide-react";
import type { EnvEntry, EnvListResponse } from "@/lib/types";

const SESSION_KEY = "rask-env";
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

interface EnvGatewayProps {
  onReady: (slug: string) => void;
}

const DEFAULT_FORM: Omit<EnvEntry, "slug"> = {
  name: "",
  host: "localhost",
  managementPort: "15672",
  amqpPort: "5672",
  user: "guest",
  password: "guest",
  vhost: "/",
};

export function EnvGateway({ onReady }: EnvGatewayProps) {
  const [status, setStatus] = useState<"checking" | "show" | "hidden">("checking");
  const [envs, setEnvs] = useState<EnvEntry[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EnvEntry>({ slug: "", ...DEFAULT_FORM });
  const [slugError, setSlugError] = useState("");
  const [activating, setActivating] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  async function loadEnvs() {
    const res = await fetch("/api/envs");
    const json = (await res.json()) as { data?: EnvListResponse; error?: string };
    return json.data ?? { envs: [], active: null };
  }

  useEffect(() => {
    const session = sessionStorage.getItem(SESSION_KEY);
    loadEnvs().then(({ envs: list, active: activeSlug }) => {
      setEnvs(list);
      setActive(activeSlug);
      if (session) {
        onReady(session);
        setStatus("hidden");
      } else if (activeSlug) {
        sessionStorage.setItem(SESSION_KEY, activeSlug);
        onReady(activeSlug);
        setStatus("hidden");
      } else {
        setStatus("show");
        if (list.length === 0) setShowForm(true);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleActivate(slug: string) {
    setActivating(slug);
    const res = await fetch(`/api/envs/${slug}/activate`, { method: "POST" });
    const json = (await res.json()) as { data?: { active: string }; error?: string };
    if (json.data) {
      sessionStorage.setItem(SESSION_KEY, slug);
      onReady(slug);
      setStatus("hidden");
    }
    setActivating(null);
  }

  async function handleCreate() {
    setFormError("");
    if (!form.slug || !SLUG_RE.test(form.slug)) {
      setSlugError("Slug must be lowercase letters, digits, hyphens, or underscores.");
      return;
    }
    setSlugError("");
    const res = await fetch("/api/envs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = (await res.json()) as { data?: EnvEntry; error?: string };
    if (json.error) { setFormError(json.error); return; }
    // Auto-activate the newly created env
    await handleActivate(form.slug);
  }

  async function handleDelete(slug: string) {
    await fetch(`/api/envs/${slug}`, { method: "DELETE" });
    const { envs: list, active: activeSlug } = await loadEnvs();
    setEnvs(list);
    setActive(activeSlug);
    setDeleteConfirm(null);
    if (list.length === 0) setShowForm(true);
  }

  if (status === "checking" || status === "hidden") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mb-1 text-3xl">🐿</div>
          <h1 className="text-xl font-semibold">Rask</h1>
          <p className="mt-1 text-sm text-muted-foreground">Select an environment to continue</p>
        </div>

        {envs.length > 0 && (
          <>
            <div className="space-y-2">
              {envs.map((env) => (
                <div key={env.slug} className="group relative">
                  {deleteConfirm === env.slug ? (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
                      <span className="flex-1 text-sm">Delete <strong>{env.name}</strong>?</span>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(env.slug)}>Delete</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleActivate(env.slug)}
                      disabled={activating === env.slug}
                      className="flex w-full items-center gap-3 rounded-lg border bg-background px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
                    >
                      <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{env.name}</span>
                          {active === env.slug && <Badge variant="secondary" className="text-xs">active</Badge>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{env.host}:{env.managementPort}</div>
                      </div>
                      {activating === env.slug
                        ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      }
                    </button>
                  )}
                  {deleteConfirm !== env.slug && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(env.slug); }}
                      className="absolute right-10 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!showForm && (
              <>
                <Separator className="my-4" />
                <Button variant="outline" className="w-full" onClick={() => setShowForm(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add New Environment
                </Button>
              </>
            )}
          </>
        )}

        {showForm && (
          <>
            {envs.length > 0 && <Separator className="my-4" />}
            <div className="space-y-3">
              <p className="text-sm font-medium">{envs.length === 0 ? "Create your first environment" : "New environment"}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="slug" className="text-xs">Slug <span className="text-muted-foreground">(id)</span></Label>
                  <Input id="slug" placeholder="localhost" value={form.slug}
                    onChange={(e) => { setForm(f => ({ ...f, slug: e.target.value })); setSlugError(""); }} />
                  {slugError && <p className="text-xs text-destructive">{slugError}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs">Display Name</Label>
                  <Input id="name" placeholder="Local Dev" value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="host" className="text-xs">Host</Label>
                  <Input id="host" placeholder="localhost" value={form.host}
                    onChange={(e) => setForm(f => ({ ...f, host: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mgmtPort" className="text-xs">Mgmt Port</Label>
                  <Input id="mgmtPort" placeholder="15672" value={form.managementPort}
                    onChange={(e) => setForm(f => ({ ...f, managementPort: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="user" className="text-xs">User</Label>
                  <Input id="user" placeholder="guest" value={form.user}
                    onChange={(e) => setForm(f => ({ ...f, user: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password" className="text-xs">Password</Label>
                  <Input id="password" type="password" placeholder="guest" value={form.password}
                    onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="vhost" className="text-xs">VHost</Label>
                  <Input id="vhost" placeholder="/" value={form.vhost}
                    onChange={(e) => setForm(f => ({ ...f, vhost: e.target.value }))} />
                </div>
              </div>
              {formError && <p className="text-xs text-destructive">{formError}</p>}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleCreate}>Create &amp; Connect</Button>
                {envs.length > 0 && (
                  <Button variant="ghost" onClick={() => { setShowForm(false); setFormError(""); }}>Cancel</Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

```bash
pnpm build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add components/env-gateway.tsx
git commit -m "feat(env): EnvGateway full-screen overlay component"
```

---

## Task 5: Wire gateway into app layout + header Switch Env chip

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `components/layout/header.tsx`

**Step 1: Update `app/(app)/layout.tsx`**

Replace the file contents with:

```typescript
"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { EnvGateway } from "@/components/env-gateway";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [activeEnv, setActiveEnv] = useState<string | null>(null);
  const [showGateway, setShowGateway] = useState(false);

  return (
    <>
      <EnvGateway onReady={(slug) => { setActiveEnv(slug); setShowGateway(false); }} />
      {showGateway && (
        <EnvGateway onReady={(slug) => { setActiveEnv(slug); setShowGateway(false); }} />
      )}
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header activeEnv={activeEnv} onSwitchEnv={() => setShowGateway(true)} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </>
  );
}
```

Note the `EnvGateway` renders `null` when status is `hidden` — the gateway takes care of its own visibility so the double-render is harmless for the initial load. The `showGateway` flag forces a fresh mount (re-runs the effect) when "Switch Env" is clicked.

Actually, a cleaner approach — use a single gateway with an `open` prop:

```typescript
"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { EnvGateway } from "@/components/env-gateway";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [activeEnv, setActiveEnv] = useState<string | null>(null);
  const [gatewayKey, setGatewayKey] = useState(0);

  return (
    <>
      <EnvGateway
        key={gatewayKey}
        onReady={(slug) => setActiveEnv(slug)}
      />
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header
            activeEnv={activeEnv}
            onSwitchEnv={() => {
              sessionStorage.removeItem("rask-env");
              setGatewayKey((k) => k + 1);
            }}
          />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </>
  );
}
```

Incrementing `gatewayKey` force-remounts `EnvGateway`, which re-runs the `useEffect`, which re-checks `sessionStorage` (now cleared) and shows the gateway again. Clean, no extra prop needed.

**Step 2: Update `components/layout/header.tsx`**

Add `activeEnv` and `onSwitchEnv` props to `Header`. Add a chip between `ConnectionStatus` and `ThemeToggle`:

Change the `Header` function signature and add the chip:

```typescript
interface HeaderProps {
  activeEnv: string | null;
  onSwitchEnv: () => void;
}

export function Header({ activeEnv, onSwitchEnv }: HeaderProps) {
  const pathname = usePathname();
  const title = PATH_TITLES[pathname] ?? pathname.split("/").filter(Boolean).join(" / ");

  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="flex items-center gap-4">
        <ConnectionStatus />
        {activeEnv && (
          <button
            onClick={onSwitchEnv}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            {activeEnv}
          </button>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
```

**Step 3: Verify build**

```bash
pnpm build 2>&1 | tail -5
```
Expected: success.

**Step 4: Smoke test**

```bash
# Start dev server
pnpm dev &
sleep 3

# No envs yet — gateway should be required
curl -s http://localhost:35672/api/envs

# Create an env
curl -s -X POST http://localhost:35672/api/envs \
  -H "Content-Type: application/json" \
  -d '{"slug":"local","name":"Local Dev","host":"localhost","managementPort":"15672","amqpPort":"5672","user":"guest","password":"guest","vhost":"/"}'

# Activate it
curl -s -X POST http://localhost:35672/api/envs/local/activate

# Check symlink
ls -la .env.local
```

Expected: `.env.local -> .envs/local.env`

**Step 5: Commit**

```bash
git add app/\(app\)/layout.tsx components/layout/header.tsx
git commit -m "feat(env): wire gateway into app shell — Switch Env chip in header"
```

---

## Task 6: Update .gitignore for .envs + verify end-to-end

**Files:**
- Verify: `.gitignore` has `.envs/` (added in Task 1)
- Verify: `git status` doesn't track any `.env*` or `.envs/` files

**Step 1: Confirm gitignore is correct**

```bash
echo '# test' > .envs/test.env
git status
```
Expected: `.envs/test.env` does NOT appear in `git status` output.

```bash
rm .envs/test.env
```

**Step 2: Final build**

```bash
pnpm build 2>&1 | tail -10
```
Expected: all 9+ routes compile, no TypeScript errors.

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(env): environment gateway complete — multi-env switcher with symlink"
```

---

## Verification Checklist

1. `pnpm build` passes with no errors
2. `GET /api/envs` returns `{ data: { envs: [], active: null } }` on fresh install
3. `POST /api/envs` creates `.envs/{slug}.env` file
4. `POST /api/envs/{slug}/activate` creates `.env.local` symlink
5. `DELETE /api/envs/{slug}` removes the file and clears symlink if active
6. Opening `http://localhost:35672` with no `sessionStorage` and no active symlink shows the gateway
7. Creating an env auto-activates and dismisses the gateway
8. Opening a new tab shows the gateway again (sessionStorage is per-tab)
9. Header shows the active env chip; clicking it re-opens the gateway
10. `.envs/` directory is gitignored
