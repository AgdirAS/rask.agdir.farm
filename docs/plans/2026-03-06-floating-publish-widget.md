# Floating Publish Widget Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the `/publish` route with a persistent floating widget that stays mounted across all routes, so users can compose a message and navigate the app (topology, queues, etc.) to observe the impact.

**Architecture:** A `PublishWidgetContext` exposes a single `open()` function so any component (sidebar nav button, dashboard quick-action card) can open the widget without prop-drilling. Widget open/minimized state lives in `AppLayout`, which is already `"use client"`. The widget component itself holds all form state (exchange, routing key, body, headers, etc.) — it stays mounted when open or minimized, so state survives navigation. The `/publish` page is deleted.

**Tech Stack:** Next.js App Router, React `useState`/`useContext`, TanStack Query, shadcn/ui, TailwindCSS v4, Lucide icons.

---

### Task 1: Create the PublishWidgetContext

**Files:**
- Create: `components/publish-widget-context.tsx`

**Step 1: Create the context file**

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";

type PublishWidgetCtx = { open: () => void };

const Ctx = createContext<PublishWidgetCtx>({ open: () => {} });

export function PublishWidgetProvider({
  children,
  onOpen,
}: {
  children: ReactNode;
  onOpen: () => void;
}) {
  return <Ctx.Provider value={{ open: onOpen }}>{children}</Ctx.Provider>;
}

export function usePublishWidget() {
  return useContext(Ctx);
}
```

**Step 2: Commit**

```bash
git add components/publish-widget-context.tsx
git commit -m "feat(publish): add PublishWidgetContext"
```

---

### Task 2: Create the FloatingPublishWidget component

**Files:**
- Create: `components/floating-publish-widget.tsx`
- Reference: `app/(app)/publish/page.tsx` (copy form logic from here)

This component contains all publish form state. It renders as a fixed-position panel at bottom-right. When `minimized`, it shows a compact pill. When expanded, it shows the full form.

**Step 1: Create the component**

```tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exchange } from "@/lib/types";

type HeaderPair = { key: string; value: string };

function isValidJson(str: string): boolean {
  if (!str.trim()) return true;
  try { JSON.parse(str); return true; } catch { return false; }
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FloatingPublishWidget({ open, onClose }: Props) {
  const [minimized, setMinimized] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState("");
  const [routingKey, setRoutingKey] = useState("");
  const [body, setBody] = useState("");
  const [isJson, setIsJson] = useState(true);
  const [contentType, setContentType] = useState("application/json");
  const [persistent, setPersistent] = useState(true);
  const [priority, setPriority] = useState("");
  const [headers, setHeaders] = useState<HeaderPair[]>([{ key: "", value: "" }]);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ routed: boolean } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const jsonInvalid = isJson && body.trim() !== "" && !isValidJson(body);

  const { data: exchanges } = useQuery<Exchange[]>({
    queryKey: ["exchanges"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/exchanges");
      const json = (await res.json()) as { data?: Exchange[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    staleTime: 10_000,
    enabled: open,
  });

  useEffect(() => {
    if (exchanges && !selectedExchange) {
      const first = exchanges.find((e) => e.name !== "");
      if (first) setSelectedExchange(`${first.vhost}||${first.name}`);
    }
  }, [exchanges, selectedExchange]);

  const selectedExchangeObj = useMemo(() => {
    if (!exchanges || !selectedExchange) return null;
    const [vhost, name] = selectedExchange.split("||");
    return exchanges.find((e) => e.vhost === vhost && e.name === name) ?? null;
  }, [exchanges, selectedExchange]);

  const byVhost = useMemo(() => {
    if (!exchanges) return {};
    const map: Record<string, Exchange[]> = {};
    for (const ex of exchanges) {
      (map[ex.vhost] ??= []).push(ex);
    }
    return map;
  }, [exchanges]);

  function addHeader() {
    setHeaders((h) => [...h, { key: "", value: "" }]);
  }

  function updateHeader(i: number, field: "key" | "value", val: string) {
    setHeaders((h) => h.map((pair, idx) => idx === i ? { ...pair, [field]: val } : pair));
  }

  function removeHeader(i: number) {
    setHeaders((h) => h.filter((_, idx) => idx !== i));
  }

  async function handlePublish() {
    if (!selectedExchangeObj || jsonInvalid) return;
    setPublishing(true);
    setResult(null);
    setPublishError(null);
    try {
      const headerObj: Record<string, string> = {};
      for (const { key, value } of headers) {
        if (key.trim()) headerObj[key.trim()] = value;
      }
      const res = await fetch(
        `/api/rabbitmq/exchanges/${encodeURIComponent(selectedExchangeObj.vhost)}/${encodeURIComponent(selectedExchangeObj.name)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routing_key: routingKey,
            payload: body,
            payload_encoding: "string",
            properties: {
              content_type: contentType || undefined,
              delivery_mode: persistent ? 2 : 1,
              headers: Object.keys(headerObj).length > 0 ? headerObj : undefined,
              priority: priority ? Number(priority) : undefined,
            },
          }),
        },
      );
      const json = (await res.json()) as { routed?: boolean; error?: string };
      if (json.error) throw new Error(json.error);
      setResult({ routed: json.routed ?? false });
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  if (!open) return null;

  const exchangeLabel = selectedExchangeObj?.name
    ? `${selectedExchangeObj.name} [${selectedExchangeObj.type}]`
    : "No exchange selected";

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[420px] shadow-2xl rounded-xl border bg-background flex flex-col overflow-hidden">
      {/* Header / minimize bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-card border-b cursor-pointer select-none"
        onClick={() => setMinimized((m) => !m)}
      >
        <Send className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold flex-1">Publish Message</span>
        {minimized && (
          <span className="text-xs text-muted-foreground truncate max-w-[160px]">{exchangeLabel}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setMinimized((m) => !m); }}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={minimized ? "Expand" : "Minimize"}
        >
          {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Form — hidden when minimized */}
      {!minimized && (
        <div className="overflow-y-auto max-h-[80vh] p-4 space-y-4">
          {/* Exchange + routing key */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Exchange *</label>
              <select
                value={selectedExchange}
                onChange={(e) => setSelectedExchange(e.target.value)}
                className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">— select an exchange —</option>
                {Object.entries(byVhost).map(([vhost, exList]) => (
                  <optgroup key={vhost} label={`vhost: ${vhost}`}>
                    {exList.map((ex) => (
                      <option key={`${ex.vhost}||${ex.name}`} value={`${ex.vhost}||${ex.name}`}>
                        {ex.name || "(default)"} [{ex.type}]
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedExchangeObj && (
                <p className="text-xs text-muted-foreground mt-1">
                  Type: <span className="font-medium">{selectedExchangeObj.type}</span> · Vhost: <span className="font-mono">{selectedExchangeObj.vhost}</span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Routing Key</label>
              <input
                value={routingKey}
                onChange={(e) => setRoutingKey(e.target.value)}
                placeholder="my.routing.key"
                className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>
          </div>

          {/* Properties */}
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">Properties</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Content-Type</label>
                <input
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                  className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Priority (0–255)</label>
                <input
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  type="number"
                  min={0}
                  max={255}
                  placeholder="0"
                  className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={persistent} onChange={(e) => setPersistent(e.target.checked)} className="rounded" />
                  <span className="text-sm">Persistent (delivery-mode: 2)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Headers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Headers</p>
              <button onClick={addHeader} className="text-xs text-primary hover:underline">+ Add header</button>
            </div>
            <div className="space-y-1.5">
              {headers.map((pair, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={pair.key}
                    onChange={(e) => updateHeader(i, "key", e.target.value)}
                    placeholder="x-header-name"
                    className="flex-1 px-2.5 py-1.5 bg-background border rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    value={pair.value}
                    onChange={(e) => updateHeader(i, "value", e.target.value)}
                    placeholder="value"
                    className="flex-1 px-2.5 py-1.5 bg-background border rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {headers.length > 1 && (
                    <button onClick={() => removeHeader(i)} className="text-muted-foreground hover:text-destructive text-xs px-1">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Body</label>
              <div className="flex gap-1 bg-muted rounded-md p-0.5">
                {(["JSON", "Plain text"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setIsJson(fmt === "JSON")}
                    className={cn(
                      "px-2.5 py-0.5 rounded text-xs font-medium transition-colors",
                      (fmt === "JSON") === isJson
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              aria-label="Body"
              placeholder={isJson ? '{\n  "key": "value"\n}' : "Message body…"}
              className={cn(
                "w-full px-3 py-2.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 font-mono resize-y transition-colors",
                jsonInvalid ? "border-destructive focus:ring-destructive" : "focus:ring-primary",
              )}
            />
            {jsonInvalid && (
              <p className="text-xs text-destructive mt-1">Invalid JSON — fix before publishing</p>
            )}
          </div>

          {/* Result / Error */}
          {result && (
            <div className={cn(
              "rounded-md border px-4 py-3 text-sm font-medium",
              result.routed
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                : "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
            )}>
              {result.routed
                ? "✓ Message published and routed successfully"
                : "⚠ Message published but not routed — no binding matched"}
            </div>
          )}
          {publishError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {publishError}
            </div>
          )}

          <button
            onClick={handlePublish}
            disabled={!selectedExchange || jsonInvalid || publishing}
            className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {publishing ? "Publishing…" : "Publish Message"}
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/floating-publish-widget.tsx
git commit -m "feat(publish): add FloatingPublishWidget component"
```

---

### Task 3: Wire up AppLayout — add state and providers

**Files:**
- Modify: `app/(app)/layout.tsx`

Add `publishOpen` state, wrap with `PublishWidgetProvider`, render `FloatingPublishWidget` in the layout.

**Step 1: Update AppLayout**

Replace the imports block and function body:

```tsx
"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { EnvGateway, type GatewayReason } from "@/components/env-gateway";
import { HeaderActionsProvider } from "@/components/layout/header-actions-context";
import { ConnectionErrorProvider } from "@/components/layout/connection-error-context";
import { PublishWidgetProvider } from "@/components/publish-widget-context";
import { FloatingPublishWidget } from "@/components/floating-publish-widget";
import { SESSION_ENV_KEY } from "@/lib/constants";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [activeEnv, setActiveEnv] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(SESSION_ENV_KEY);
    }
    return null;
  });

  const [reason, setReason] = useState<GatewayReason | null>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(SESSION_ENV_KEY) ? null : "first-run";
    }
    return null;
  });

  const [publishOpen, setPublishOpen] = useState(false);

  function handleReady(slug: string) {
    setActiveEnv(slug);
    setReason(null);
    sessionStorage.setItem(SESSION_ENV_KEY, slug);
  }

  const handleConnectionError = useCallback(() => {
    setReason("no-connection");
  }, []);

  function handleSwitchEnv() {
    setReason("switch");
  }

  return (
    <HeaderActionsProvider>
      <ConnectionErrorProvider onError={handleConnectionError}>
        <PublishWidgetProvider onOpen={() => setPublishOpen(true)}>
          {reason !== null && (
            <EnvGateway
              reason={reason}
              activeSlug={activeEnv}
              onReady={handleReady}
              onDismiss={reason === "switch" ? () => setReason(null) : undefined}
            />
          )}
          <div className="flex h-screen overflow-hidden">
            <Sidebar onSwitchEnv={handleSwitchEnv} onOpenPublish={() => setPublishOpen(true)} />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Header />
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
          <FloatingPublishWidget open={publishOpen} onClose={() => setPublishOpen(false)} />
        </PublishWidgetProvider>
      </ConnectionErrorProvider>
    </HeaderActionsProvider>
  );
}
```

**Step 2: Commit**

```bash
git add app/(app)/layout.tsx
git commit -m "feat(publish): wire FloatingPublishWidget into AppLayout"
```

---

### Task 4: Update Sidebar — replace Publish link with button

**Files:**
- Modify: `components/layout/nav-config.ts`
- Modify: `components/layout/sidebar.tsx`

**Step 1: Remove Publish from NAV_ITEMS in `nav-config.ts`**

Remove the line:
```ts
{ href: "/publish", label: "Publish", icon: Send },
```

Also remove the `Send` import if it's no longer used elsewhere in that file.

**Step 2: Add `onOpenPublish` prop to Sidebar and render Publish button**

In `components/layout/sidebar.tsx`, update the `Sidebar` component signature:

```tsx
export function Sidebar({
  onSwitchEnv,
  onOpenPublish,
}: {
  onSwitchEnv: () => void;
  onOpenPublish: () => void;
}) {
```

In the nav section, after the `{NAV_ITEMS.map(...)}` block and before the Admin dropdown, add:

```tsx
{/* Publish — opens floating widget */}
<button
  onClick={onOpenPublish}
  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
>
  <Send className="h-4 w-4 shrink-0" />
  Publish
</button>
```

Make sure `Send` is imported from `lucide-react` (add to existing import if needed).

**Step 3: Commit**

```bash
git add components/layout/nav-config.ts components/layout/sidebar.tsx
git commit -m "feat(publish): replace /publish nav link with widget toggle button"
```

---

### Task 5: Delete the /publish page

**Files:**
- Delete: `app/(app)/publish/page.tsx`

**Step 1: Delete the file**

```bash
git rm app/\(app\)/publish/page.tsx
```

**Step 2: Commit**

```bash
git commit -m "feat(publish): remove /publish route, widget replaces it"
```

---

### Task 6: Add Publish quick-action card to Dashboard

**Files:**
- Modify: `app/(app)/page.tsx`

**Step 1: Import `usePublishWidget` and `Send` icon**

At the top of `app/(app)/page.tsx`, add:
```tsx
import { usePublishWidget } from "@/components/publish-widget-context";
import { Send } from "lucide-react";
```

**Step 2: Call the hook inside `OverviewPage`**

At the top of the `OverviewPage` component body, add:
```tsx
const { open: openPublish } = usePublishWidget();
```

**Step 3: Add a quick-action card after the stat cards grid**

After the closing `</div>` of the stat cards grid (`grid-cols-2 md:grid-cols-3 lg:grid-cols-5`), add:

```tsx
{/* ── quick actions ── */}
<div className="flex gap-3">
  <button
    onClick={openPublish}
    className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
  >
    <Send className="h-4 w-4" />
    Publish Message
  </button>
</div>
```

**Step 4: Commit**

```bash
git add app/\(app\)/page.tsx
git commit -m "feat(publish): add Publish quick-action to dashboard"
```

---

### Task 7: Manual verification checklist

No automated tests exist in this project. Verify manually:

1. `pnpm dev` — dev server starts at http://localhost:35672
2. Open the app — confirm no TypeScript/build errors in terminal
3. Click **Publish** in the sidebar — widget opens bottom-right
4. Fill in exchange, routing key, body — navigate to `/topology` — widget stays open with form intact
5. Navigate to `/queues` — widget still present
6. Minimize the widget — confirm pill shows exchange name
7. Click pill to expand — confirm form state is preserved
8. Click **Publish Message** button on dashboard — confirm widget opens
9. Close the widget (✕) — confirm it disappears
10. Navigate to `/publish` — confirm 404 (route deleted)
11. Run `pnpm lint` — no lint errors

**Commit if any lint fixes were needed:**
```bash
git add -A
git commit -m "fix(publish): lint fixes"
```
