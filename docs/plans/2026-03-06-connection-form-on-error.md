# Connection Form On Error Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When the RabbitMQ overview fetch fails, replace the dashboard content with a pre-filled connection form that lets the user fix credentials and reconnect without leaving the page.

**Architecture:** All changes live in `app/(app)/page.tsx`. When `isError` is true, the component renders a `ConnectionForm` instead of the dashboard. The form pre-fetches current settings via `GET /api/settings`, saves via `POST /api/settings`, tests via `POST /api/settings/test`, then calls `queryClient.invalidateQueries` to trigger a re-fetch of the overview. On success the form disappears and the dashboard renders normally.

**Tech Stack:** Next.js App Router, TanStack Query (`useQuery`, `useQueryClient`, `useMutation`), shadcn/ui (`Input`, `Label`, `Button`), Lucide icons.

---

### Task 1: Add `ConnectionForm` component inside `page.tsx`

No test suite exists — verify manually via browser.

**Files:**
- Modify: `app/(app)/page.tsx`

**Step 1: Read the current file**

Read `app/(app)/page.tsx` in full. Understand the existing imports and the `ovErr` boolean that drives the error banner.

**Step 2: Add imports needed for the form**

Add these imports at the top of the file alongside existing ones:

```tsx
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ServerCrash } from "lucide-react";
import type { ConnectionConfig } from "@/lib/types";
```

**Step 3: Add the `ConnectionForm` component above `OverviewPage`**

Insert this component between the `Bar` component and `OverviewPage`:

```tsx
function ConnectionForm({ onConnected }: { onConnected: () => void }) {
  const [form, setForm] = useState<Partial<ConnectionConfig>>({});
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill with current saved settings
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((json: { data?: ConnectionConfig }) => {
        if (json.data) setForm(json.data);
      })
      .finally(() => setLoaded(true));
  }, []);

  function field(key: keyof ConnectionConfig) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSave() {
    setError("");
    setTesting(true);
    try {
      // 1. Test the connection first
      const testRes = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const testJson = (await testRes.json()) as { error?: string };
      if (testJson.error) {
        setError(testJson.error);
        return;
      }
      // 2. Save on success
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      onConnected();
    } catch {
      setError("Could not reach server.");
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-md">
        <div className="mb-6 text-center">
          <ServerCrash className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <h2 className="text-lg font-semibold">Connection Required</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Could not reach RabbitMQ. Update your settings and try again.
          </p>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Host</Label>
              <Input placeholder="localhost" value={form.host ?? ""} onChange={field("host")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mgmt Port</Label>
              <Input placeholder="15672" value={form.managementPort ?? ""} onChange={field("managementPort")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">AMQP Port</Label>
              <Input placeholder="5672" value={form.amqpPort ?? ""} onChange={field("amqpPort")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">User</Label>
              <Input placeholder="guest" value={form.user ?? ""} onChange={field("user")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Password</Label>
              <Input type="password" placeholder="guest" value={form.password ?? ""} onChange={field("password")} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">VHost</Label>
              <Input placeholder="/" value={form.vhost ?? ""} onChange={field("vhost")} />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button className="w-full" onClick={handleSave} disabled={testing}>
            {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {testing ? "Testing…" : "Save & Connect"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Wire `ConnectionForm` into `OverviewPage`**

Inside `OverviewPage`, add `useQueryClient` and replace the error banner conditional with a full-page return:

```tsx
export default function OverviewPage() {
  const queryClient = useQueryClient();

  const { data: overview, isError: ovErr } = useQuery<Overview>({ ... });
  const { data: nodes } = useQuery<NodeStats[]>({ ... });

  // ← ADD THIS BLOCK immediately after the two useQuery calls:
  if (ovErr) {
    return (
      <ConnectionForm
        onConnected={() => {
          queryClient.invalidateQueries({ queryKey: ["overview"] });
          queryClient.invalidateQueries({ queryKey: ["nodes"] });
        }}
      />
    );
  }

  // rest of the existing return (remove the old error banner div)
  ...
}
```

Also remove the old error banner JSX:
```tsx
// DELETE THIS:
{ovErr && (
  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
    Could not reach RabbitMQ — check your connection settings.
  </div>
)}
```

**Step 5: Add missing `useEffect` import**

Ensure `useEffect` is in the React import. The file already uses `useQuery` from TanStack, but `useEffect` comes from React:

```tsx
import { useEffect, useState } from "react";
```

**Step 6: Verify in browser**

1. Stop RabbitMQ (`docker stop <container>` or equivalent)
2. Load `http://localhost:35672/`
3. Confirm the connection form renders instead of the broken dashboard
4. Start RabbitMQ again
5. Fill in correct credentials → click "Save & Connect"
6. Confirm the form disappears and the dashboard loads with live data

**Step 7: Commit**

```bash
git add app/\(app\)/page.tsx
git commit -m "feat(overview): show connection form when RabbitMQ is unreachable"
```
