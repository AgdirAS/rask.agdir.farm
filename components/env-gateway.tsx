"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Server, ChevronDown, Plus, Loader2, X, CheckCircle, AlertCircle,
} from "lucide-react";
import type { EnvEntry, EnvListResponse } from "@/lib/types";
import { SESSION_ENV_KEY } from "@/lib/constants";

export type GatewayReason = "first-run" | "no-connection" | "switch";

interface EnvGatewayProps {
  reason: GatewayReason;
  activeSlug: string | null;
  onReady: (slug: string) => void;
  onDismiss?: () => void;
}

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
  managementUrl: "http://localhost:15672",
  amqpPort: "5672",
  user: "guest",
  password: "guest",
  vhost: "/",
};

function randomSlug(): string {
  return "env-" + Math.random().toString(36).slice(2, 10);
}

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
  const [newRow, setNewRow] = useState<(EnvEntry & { slugError?: string; testState: TestState; testError: string }) | null>(null);
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

  async function handleConnect(i: number) {
    const slug = rows[i].draft.slug;
    updateRow(i, { connecting: true, testError: "", testState: "idle" });
    try {
      const res = await fetch(`/api/envs/${slug}/activate`, { method: "POST" });
      const json = (await res.json()) as { data?: { active: string }; error?: string };
      if (json.error) throw new Error(json.error);
      if (json.data) {
        sessionStorage.setItem(SESSION_ENV_KEY, slug);
        onReady(slug);
      }
    } catch (err) {
      updateRow(i, {
        testState: "error",
        testError: err instanceof Error ? err.message : "Activation failed",
      });
    } finally {
      updateRow(i, { connecting: false });
    }
  }

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

  function openNewRow() {
    setRows((rs) => rs.map((r) => ({ ...r, expanded: false })));
    setNewRow({ slug: randomSlug(), ...BLANK_NEW, testState: "idle", testError: "" });
  }

  async function handleTestNew() {
    if (!newRow) return;
    setNewRow((r) => r ? { ...r, testState: "testing", testError: "" } : r);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRow),
      });
      const json = (await res.json()) as { error?: string };
      if (json.error) throw new Error(json.error);
      setNewRow((r) => r ? { ...r, testState: "ok" } : r);
    } catch (err) {
      setNewRow((r) => r ? { ...r, testState: "error", testError: err instanceof Error ? err.message : "Connection failed" } : r);
    }
  }

  async function handleCreateNew() {
    if (!newRow) return;
    if (!newRow.name.trim()) {
      setNewRow((r) => r ? { ...r, slugError: "Display name is required." } : r);
      return;
    }
    const payload = { ...newRow };
    try {
      const res = await fetch("/api/envs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { data?: EnvEntry; error?: string };
      if (json.error) {
        setNewRow((r) => r ? { ...r, slugError: json.error } : r);
        return;
      }
      if (json.data) {
        setRows((rs) => [...rs, makeRow(json.data!, false)]);
        setNewRow(null);
      }
    } catch {
      setNewRow((r) => r ? { ...r, slugError: "Network error. Please try again." } : r);
    }
  }

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
            <div key={row.draft.slug} className={`rounded-lg border overflow-hidden ${activeSlug === row.draft.slug ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-900/10" : "bg-background"}`}>
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
                    {row.draft.managementUrl}
                  </div>
                </div>

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

              {/* inline test error */}
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
                      <Label className="text-xs">Management URL</Label>
                      <Input
                        placeholder="http://localhost:15672"
                        value={row.draft.managementUrl}
                        onChange={(e) => setDraftField(i, "managementUrl", e.target.value)}
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
                  {row.testState === "error" && row.testError && (
                    <p className="text-xs text-destructive">{row.testError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => handleTest(i)}
                      disabled={row.testState === "testing"}
                    >
                      {row.testState === "testing"
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : row.testState === "ok"
                          ? <><CheckCircle className="h-3 w-3 mr-1 text-emerald-500" />Tested</>
                          : "Test"}
                    </Button>
                    <Button
                      size="sm" variant="outline" className="flex-1"
                      onClick={() => handleSave(i)}
                      disabled={row.saving}
                    >
                      {row.saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                      {row.saving ? "Saving…" : "Save"}
                    </Button>
                  </div>
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
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Display Name</Label>
                    <Input
                      placeholder="Production"
                      value={newRow.name}
                      autoFocus
                      onChange={(e) => setNewRow((r) => r ? { ...r, name: e.target.value, slugError: undefined } : r)}
                    />
                    {newRow.slugError && <p className="text-xs text-destructive">{newRow.slugError}</p>}
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Management URL</Label>
                    <Input
                      placeholder="http://localhost:15672"
                      value={newRow.managementUrl}
                      onChange={(e) => setNewRow((r) => r ? { ...r, managementUrl: e.target.value } : r)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">AMQP Port</Label>
                    <Input
                      placeholder="5672"
                      value={newRow.amqpPort}
                      onChange={(e) => setNewRow((r) => r ? { ...r, amqpPort: e.target.value } : r)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">User</Label>
                    <Input
                      placeholder="guest"
                      value={newRow.user}
                      onChange={(e) => setNewRow((r) => r ? { ...r, user: e.target.value } : r)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Password</Label>
                    <Input
                      type="password"
                      placeholder="guest"
                      value={newRow.password}
                      onChange={(e) => setNewRow((r) => r ? { ...r, password: e.target.value } : r)}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">VHost</Label>
                    <Input
                      placeholder="/"
                      value={newRow.vhost}
                      onChange={(e) => setNewRow((r) => r ? { ...r, vhost: e.target.value } : r)}
                    />
                  </div>
                </div>
                {newRow.testState === "error" && newRow.testError && (
                  <p className="text-xs text-destructive">{newRow.testError}</p>
                )}
                {newRow.testState === "ok" && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Connection successful
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="outline"
                    onClick={handleTestNew}
                    disabled={newRow.testState === "testing" || !newRow.vhost}
                  >
                    {newRow.testState === "testing"
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : newRow.testState === "ok"
                        ? <><CheckCircle className="h-3 w-3 mr-1 text-emerald-500" />Tested</>
                        : "Test"}
                  </Button>
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
