# Env Gateway Accordion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the existing flat `EnvGateway` + `ConnectionForm` + `ConnectionSettingsModal` trio with one unified accordion modal that knows why it's open (`first-run` | `no-connection` | `switch`) and supports full multi-env management.

**Architecture:** Four touch points — a new `PUT /api/envs/[slug]` route, a `ConnectionErrorContext` for page→layout signalling, a fully rewritten `EnvGateway`, and small cleanups to layout/header/page. The gateway is the single place for all connection management.

**Tech Stack:** Next.js App Router, React Context, TanStack Query invalidation, shadcn/ui (Input, Label, Button, Badge), Lucide icons (Server, ChevronDown, Plus, Loader2, X), `next/image` for optimized logo display.

---

### Task 1: Add `PUT /api/envs/[slug]` route and `updateEnv` helper

**Files:**
- Modify: `lib/env.ts`
- Modify: `app/api/envs/[slug]/route.ts`

**Step 1: Add `updateEnv` to `lib/env.ts`**

Add this function after `createEnv`:

```ts
export function updateEnv(slug: string, entry: EnvEntry): void {
  fs.writeFileSync(envFilePath(slug), serializeEnv(entry), "utf-8");
}
```

**Step 2: Add `PUT` handler to `app/api/envs/[slug]/route.ts`**

Add after the existing `DELETE` export:

```ts
import { deleteEnv, updateEnv, validateSlug } from "@/lib/env";
import type { EnvEntry } from "@/lib/types";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!validateSlug(slug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }
    const body = (await request.json()) as Partial<EnvEntry>;
    const entry: EnvEntry = {
      slug,
      name: body.name ?? slug,
      host: body.host ?? "localhost",
      managementPort: body.managementPort ?? "15672",
      amqpPort: body.amqpPort ?? "5672",
      user: body.user ?? "guest",
      password: body.password ?? "guest",
      vhost: body.vhost ?? "/",
    };
    updateEnv(slug, entry);
    return NextResponse.json({ data: entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update env";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 3: Build check**

```bash
cd /Users/e/dev/agdir/rask && pnpm build 2>&1 | tail -15
```
Expected: no errors.

**Step 4: Commit**

```bash
git add lib/env.ts "app/api/envs/[slug]/route.ts"
git commit -m "feat(envs): add PUT /api/envs/[slug] for updating env entries"
```

---

### Task 2: Add `ConnectionErrorContext`

**Files:**
- Create: `components/layout/connection-error-context.tsx`

This follows the exact same pattern as `components/layout/header-actions-context.tsx`. Read that file first to match the style.

**Step 1: Create the file**

```tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface ConnectionErrorContextValue {
  reportError: () => void;
}

const ConnectionErrorContext = createContext<ConnectionErrorContextValue>({
  reportError: () => {},
});

export function ConnectionErrorProvider({
  children,
  onError,
}: {
  children: ReactNode;
  onError: () => void;
}) {
  return (
    <ConnectionErrorContext.Provider value={{ reportError: onError }}>
      {children}
    </ConnectionErrorContext.Provider>
  );
}

export function useConnectionError() {
  return useContext(ConnectionErrorContext);
}
```

**Step 2: Build check**

```bash
cd /Users/e/dev/agdir/rask && pnpm build 2>&1 | tail -10
```

**Step 3: Commit**

```bash
git add components/layout/connection-error-context.tsx
git commit -m "feat(layout): add ConnectionErrorContext for page→layout error signalling"
```

---

### Task 3: Rewrite `components/env-gateway.tsx`

**Files:**
- Modify: `components/env-gateway.tsx` (full rewrite)

Read the current file first, then replace entirely.

**Step 1: Write the new component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import {
  Server, ChevronDown, Plus, Loader2, X, CheckCircle, AlertCircle,
} from "lucide-react";
import type { EnvEntry, EnvListResponse } from "@/lib/types";

export type GatewayReason = "first-run" | "no-connection" | "switch";

interface EnvGatewayProps {
  reason: GatewayReason;
  activeSlug: string | null;
  onReady: (slug: string) => void;
  onDismiss?: () => void;
}

const SESSION_KEY = "rask-env";

// Logo images live in public/logo/ — next/image handles resizing + WebP conversion automatically.
// We display them at 64×64 on screen; the browser receives an optimised ~10 KB file.
const HEADER: Record<GatewayReason, { logo: string; title: string; subtitle?: string }> = {
  "first-run": {
    logo: "/logo/rask-hi.png",
    title: "Welcome to Rask",
    subtitle: "Add your first RabbitMQ environment to get started.",
  },
  "no-connection": {
    logo: "/logo/rask-shrug.png",
    title: "Connection Lost",
    subtitle: "Could not reach RabbitMQ. Select or fix an environment.",
  },
  "switch": {
    logo: "/logo/rask-choice.png",
    title: "Switch Environment",
  },
};

const BLANK_NEW: Omit<EnvEntry, "slug"> = {
  name: "",
  host: "localhost",
  managementPort: "15672",
  amqpPort: "5672",
  user: "guest",
  password: "guest",
  vhost: "/",
};

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

type TestState = "idle" | "testing" | "ok" | "error";

interface RowState {
  draft: EnvEntry;
  expanded: boolean;
  saving: boolean;
  testState: TestState;
  testError: string;
  connecting: boolean;
  saveError: string;
}

function makeRow(entry: EnvEntry, expanded = false): RowState {
  return {
    draft: { ...entry },
    expanded,
    saving: false,
    testState: "idle",
    testError: "",
    connecting: false,
    saveError: "",
  };
}

export function EnvGateway({ reason, activeSlug, onReady, onDismiss }: EnvGatewayProps) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [newRow, setNewRow] = useState<(EnvEntry & { slugError?: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/envs")
      .then((r) => r.json())
      .then((json: { data?: EnvListResponse }) => {
        const list = json.data?.envs ?? [];
        setRows(list.map((e) => makeRow(e)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── row helpers ──────────────────────────────────────────────────────────

  function updateRow(i: number, patch: Partial<RowState>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function setDraftField(i: number, field: keyof EnvEntry, value: string) {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i ? { ...r, draft: { ...r.draft, [field]: value } } : r
      )
    );
  }

  function toggleExpand(i: number) {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i
          ? { ...r, expanded: !r.expanded }
          : { ...r, expanded: false }
      )
    );
    setNewRow(null);
  }

  // ── test ────────────────────────────────────────────────────────────────

  async function handleTest(i: number) {
    const { draft } = rows[i];
    updateRow(i, { testState: "testing", testError: "" });
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = (await res.json()) as { error?: string };
      if (json.error) throw new Error(json.error);
      updateRow(i, { testState: "ok" });
    } catch (err) {
      updateRow(i, {
        testState: "error",
        testError: err instanceof Error ? err.message : "Connection failed",
      });
    }
  }

  // ── connect ─────────────────────────────────────────────────────────────

  async function handleConnect(i: number) {
    const slug = rows[i].draft.slug;
    updateRow(i, { connecting: true });
    try {
      const res = await fetch(`/api/envs/${slug}/activate`, { method: "POST" });
      const json = (await res.json()) as { data?: { active: string }; error?: string };
      if (json.data) {
        sessionStorage.setItem(SESSION_KEY, slug);
        onReady(slug);
      }
    } finally {
      updateRow(i, { connecting: false });
    }
  }

  // ── save existing ────────────────────────────────────────────────────────

  async function handleSave(i: number) {
    const { draft } = rows[i];
    updateRow(i, { saving: true, saveError: "" });
    try {
      const res = await fetch(`/api/envs/${draft.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = (await res.json()) as { error?: string };
      if (json.error) throw new Error(json.error);
      updateRow(i, { saving: false });
    } catch (err) {
      updateRow(i, {
        saving: false,
        saveError: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  // ── new env ──────────────────────────────────────────────────────────────

  function openNewRow() {
    setRows((rs) => rs.map((r) => ({ ...r, expanded: false })));
    setNewRow({ slug: "", ...BLANK_NEW });
  }

  async function handleCreateNew() {
    if (!newRow) return;
    if (!newRow.slug || !SLUG_RE.test(newRow.slug)) {
      setNewRow((r) => r ? ({ ...r, slugError: "Lowercase letters, digits, hyphens only." }) : r);
      return;
    }
    const res = await fetch("/api/envs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRow),
    });
    const json = (await res.json()) as { data?: EnvEntry; error?: string };
    if (json.error) {
      setNewRow((r) => r ? ({ ...r, slugError: json.error }) : r);
      return;
    }
    if (json.data) {
      setRows((rs) => [...rs, makeRow(json.data!, false)]);
      setNewRow(null);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────

  const header = HEADER[reason];

  if (loading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <Image src={header.logo} alt="" width={64} height={64} className="shrink-0" />
            <div>
              <h1 className="text-lg font-semibold">{header.title}</h1>
              {header.subtitle && (
                <p className="text-sm text-muted-foreground">{header.subtitle}</p>
              )}
            </div>
          </div>
          {reason === "switch" && onDismiss && (
            <button
              onClick={onDismiss}
              className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* env list */}
        <div className="px-4 pb-2 space-y-1 max-h-[60vh] overflow-y-auto">
          {rows.length === 0 && !newRow && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No environments yet. Add one below.
            </p>
          )}

          {rows.map((row, i) => (
            <div key={row.draft.slug} className="rounded-lg border bg-background overflow-hidden">
              {/* row header */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm truncate">
                      {row.draft.name || row.draft.slug}
                    </span>
                    {activeSlug === row.draft.slug && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">active</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {row.draft.host}:{row.draft.managementPort}
                  </div>
                </div>

                {/* test result badge */}
                {row.testState === "ok" && <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />}
                {row.testState === "error" && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}

                <Button
                  size="sm" variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleTest(i)}
                  disabled={row.testState === "testing"}
                >
                  {row.testState === "testing"
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : "Test"}
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleConnect(i)}
                  disabled={row.connecting}
                >
                  {row.connecting
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : "Connect"}
                </Button>
                <button
                  onClick={() => toggleExpand(i)}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${row.expanded ? "rotate-180" : ""}`}
                  />
                </button>
              </div>

              {/* test error */}
              {row.testState === "error" && row.testError && (
                <div className="px-3 pb-2 text-xs text-destructive">{row.testError}</div>
              )}

              {/* expanded form */}
              {row.expanded && (
                <div className="border-t px-3 py-3 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Display Name</Label>
                      <Input
                        placeholder={row.draft.slug}
                        value={row.draft.name}
                        onChange={(e) => setDraftField(i, "name", e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Host</Label>
                      <Input
                        placeholder="localhost"
                        value={row.draft.host}
                        onChange={(e) => setDraftField(i, "host", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Mgmt Port</Label>
                      <Input
                        placeholder="15672"
                        value={row.draft.managementPort}
                        onChange={(e) => setDraftField(i, "managementPort", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">AMQP Port</Label>
                      <Input
                        placeholder="5672"
                        value={row.draft.amqpPort}
                        onChange={(e) => setDraftField(i, "amqpPort", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">User</Label>
                      <Input
                        placeholder="guest"
                        value={row.draft.user}
                        onChange={(e) => setDraftField(i, "user", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Password</Label>
                      <Input
                        type="password"
                        placeholder="guest"
                        value={row.draft.password}
                        onChange={(e) => setDraftField(i, "password", e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">VHost</Label>
                      <Input
                        placeholder="/"
                        value={row.draft.vhost}
                        onChange={(e) => setDraftField(i, "vhost", e.target.value)}
                      />
                    </div>
                  </div>
                  {row.saveError && <p className="text-xs text-destructive">{row.saveError}</p>}
                  <Button
                    size="sm" variant="outline" className="w-full"
                    onClick={() => handleSave(i)}
                    disabled={row.saving}
                  >
                    {row.saving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                    {row.saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              )}
            </div>
          ))}

          {/* new env form */}
          {newRow && (
            <div className="rounded-lg border bg-background overflow-hidden">
              <div className="px-3 py-3 space-y-2.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  New Environment
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Slug <span className="text-muted-foreground">(id)</span></Label>
                    <Input
                      placeholder="localhost"
                      value={newRow.slug}
                      onChange={(e) => setNewRow((r) => r ? ({ ...r, slug: e.target.value, slugError: undefined }) : r)}
                    />
                    {newRow.slugError && <p className="text-xs text-destructive">{newRow.slugError}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Display Name</Label>
                    <Input
                      placeholder="Local Dev"
                      value={newRow.name}
                      onChange={(e) => setNewRow((r) => r ? ({ ...r, name: e.target.value }) : r)}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Host</Label>
                    <Input
                      placeholder="localhost"
                      value={newRow.host}
                      onChange={(e) => setNewRow((r) => r ? ({ ...r, host: e.target.value }) : r)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mgmt Port</Label>
                    <Input
                      placeholder="15672"
                      value={newRow.managementPort}
                      onChange={(e) => setNewRow((r) => r ? ({ ...r, managementPort: e.target.value }) : r)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">AMQP Port</Label>
                    <Input
                      placeholder="5672"
                      value={newRow.amqpPort}
                      onChange={(e) => setNewRow((r) => r ? ({ ...r, amqpPort: e.target.value }) : r)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">User</Label>
                    <Input
                      placeholder="guest"
                      value={newRow.user}
                      onChange={(e) => setNewRow((r) => r ? ({ ...r, user: e.target.value }) : r)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Password</Label>
                    <Input
                      type="password"
                      placeholder="guest"
                      value={newRow.password}
                      onChange={(e) => setNewRow((r) => r ? ({ ...r, password: e.target.value }) : r)}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">VHost</Label>
                    <Input
                      placeholder="/"
                      value={newRow.vhost}
                      onChange={(e) => setNewRow((r) => r ? ({ ...r, vhost: e.target.value }) : r)}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={handleCreateNew}>
                    Create
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNewRow(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-4 pb-4 pt-2 border-t mt-2">
          <Button
            variant="outline" size="sm" className="w-full"
            onClick={openNewRow}
            disabled={!!newRow}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Environment
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Build check**

```bash
cd /Users/e/dev/agdir/rask && pnpm build 2>&1 | tail -20
```

Fix any TypeScript errors before committing.

**Step 3: Commit**

```bash
git add components/env-gateway.tsx
git commit -m "feat(gateway): rewrite EnvGateway as accordion modal with reason-aware header"
```

---

### Task 4: Update `app/(app)/layout.tsx`

**Files:**
- Modify: `app/(app)/layout.tsx`

Read the file first. Then replace.

**Goal:** Track `reason: GatewayReason | null` instead of `gatewayKey`. Wrap children in `ConnectionErrorProvider`. Wire the header's switch button.

```tsx
"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { EnvGateway, type GatewayReason } from "@/components/env-gateway";
import { HeaderActionsProvider } from "@/components/layout/header-actions-context";
import { ConnectionErrorProvider } from "@/components/layout/connection-error-context";

const SESSION_KEY = "rask-env";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [activeEnv, setActiveEnv] = useState<string | null>(null);
  const [reason, setReason] = useState<GatewayReason | null>(null);

  // Called when EnvGateway successfully activates an env
  function handleReady(slug: string) {
    setActiveEnv(slug);
    setReason(null);
    sessionStorage.setItem(SESSION_KEY, slug);
  }

  // Called by page when RabbitMQ fetch fails
  function handleConnectionError() {
    setReason("no-connection");
  }

  // Called by Header's switch button
  function handleSwitchEnv() {
    setReason("switch");
  }

  // On first render, check session/envs and set initial reason
  // This replaces the old useEffect in EnvGateway that called onReady directly.
  // EnvGateway now handles its own loading state; we just need to tell layout
  // whether to show it. We show it if activeEnv is null (not yet set).
  // The gateway sets activeEnv via onReady.
  //
  // But we need to check sessionStorage on mount to restore existing session.
  // Do this once on mount with useEffect:
  const [checked, setChecked] = useState(false);

  if (!checked) {
    // Run synchronously on first render to avoid flash
    if (typeof window !== "undefined") {
      const session = sessionStorage.getItem(SESSION_KEY);
      if (session) {
        // Session exists — treat as active, no gateway needed initially.
        // Connection errors will trigger gateway if needed.
        setActiveEnv(session);
      } else {
        setReason("first-run");
      }
    }
    setChecked(true);
  }

  return (
    <HeaderActionsProvider>
      <ConnectionErrorProvider onError={handleConnectionError}>
        {reason !== null && (
          <EnvGateway
            reason={reason}
            activeSlug={activeEnv}
            onReady={handleReady}
            onDismiss={reason === "switch" ? () => setReason(null) : undefined}
          />
        )}
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header onSwitchEnv={handleSwitchEnv} />
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
            <footer className="shrink-0 border-t px-6 py-3 text-xs text-muted-foreground bg-background">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium text-foreground/70">© Agdir Drift AS</span>
                <span className="text-border">|</span>
                {[
                  { href: "api/",                                                    label: "HTTP API" },
                  { href: "https://www.rabbitmq.com/docs",                           label: "Documentation" },
                  { href: "https://www.rabbitmq.com/tutorials",                      label: "Tutorials" },
                  { href: "https://www.rabbitmq.com/release-information",            label: "New releases" },
                  { href: "https://www.vmware.com/products/rabbitmq.html",           label: "Commercial edition" },
                  { href: "https://www.rabbitmq.com/commercial-offerings",           label: "Commercial support" },
                  { href: "https://github.com/rabbitmq/rabbitmq-server/discussions", label: "Discussions" },
                  { href: "https://rabbitmq.com/discord/",                           label: "Discord" },
                  { href: "https://www.rabbitmq.com/docs/plugins",                   label: "Plugins" },
                  { href: "https://www.rabbitmq.com/github",                         label: "GitHub" },
                ].map(({ href, label }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                    className="hover:text-foreground transition-colors">{label}</a>
                ))}
              </div>
            </footer>
          </div>
        </div>
      </ConnectionErrorProvider>
    </HeaderActionsProvider>
  );
}
```

**Important:** The `if (!checked)` synchronous state-setting pattern avoids a flash of the gateway when a valid session exists. On first render (server-side `checked=false`), it reads sessionStorage and sets state before the first paint on the client. This is a safe pattern for SSR because sessionStorage access is gated behind `typeof window !== "undefined"`.

**Step 2: Build check**

```bash
cd /Users/e/dev/agdir/rask && pnpm build 2>&1 | tail -15
```

**Step 3: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "feat(layout): wire ConnectionErrorContext and reason-based gateway"
```

---

### Task 5: Update `app/(app)/page.tsx`

**Files:**
- Modify: `app/(app)/page.tsx`

Read the file first. Make these changes:

1. Remove the `ConnectionForm` function entirely (everything from `function ConnectionForm` to its closing `}`)
2. Remove the `isError` early return block that renders `<ConnectionForm ... />`
3. Remove imports no longer needed: `ConnectionConfig`, `Label`, `Button`, `Input`, `Loader2`, `ServerCrash`, `useState`, `useEffect`, `useQueryClient` — but only if each is truly unused after removing ConnectionForm. Check carefully.
4. Import `useConnectionError` and call `reportError` when `ovErr` is true:

```tsx
import { useConnectionError } from "@/components/layout/connection-error-context";

// inside OverviewPage:
const { reportError } = useConnectionError();

// add useEffect to report error when ovErr changes:
useEffect(() => {
  if (ovErr) reportError();
}, [ovErr, reportError]);
```

Remove `useQueryClient` since it was only used in ConnectionForm's `onConnected`.

**Step 2: Build check**

```bash
cd /Users/e/dev/agdir/rask && pnpm build 2>&1 | tail -15
```

**Step 3: Commit**

```bash
git add "app/(app)/page.tsx"
git commit -m "feat(overview): remove ConnectionForm, use ConnectionErrorContext to signal errors"
```

---

### Task 6: Update `components/layout/header.tsx`

**Files:**
- Modify: `components/layout/header.tsx`

Read the file first. Make these changes:

1. Remove the entire `ConnectionSettingsModal` function (lines 65–212).
2. Remove imports only used by it: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `Alert`, `AlertDescription`, `Badge`, `ConnectionConfig`.
3. Update `Header` to accept and use `onSwitchEnv`:

```tsx
interface HeaderProps {
  onSwitchEnv: () => void;
}

export function Header({ onSwitchEnv }: HeaderProps) {
  // ... existing body, remove: const [settingsOpen, setSettingsOpen] = useState(false);
  // Change the pencil button onClick from () => setSettingsOpen(true) to onSwitchEnv
  // Remove: <ConnectionSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
}
```

The pencil button near the end of the header JSX becomes:
```tsx
<button
  onClick={onSwitchEnv}
  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
  title="Switch environment"
>
  <Pencil className="h-3.5 w-3.5" />
</button>
```

**Step 2: Build check**

```bash
cd /Users/e/dev/agdir/rask && pnpm build 2>&1 | tail -15
```

**Step 3: Commit**

```bash
git add components/layout/header.tsx
git commit -m "feat(header): replace ConnectionSettingsModal with env gateway trigger"
```

---

### Final verification

1. With no `.envs/` directory or empty one: gateway appears with `first-run` header
2. With envs present: accordion shows them; ▼ expands form; editing name updates header live; Test shows ✓/error inline; Connect activates and closes modal
3. With running RabbitMQ: dashboard loads normally
4. With stopped RabbitMQ: after ~10s (retry), gateway reappears with `no-connection` header
5. Header pencil icon opens gateway with `switch` header and ✕ dismiss button
6. `+ Add Environment` shows blank new-env form at bottom
