"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Policy, Queue, Exchange, Vhost } from "@/lib/types";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useHeaderActions } from "@/components/layout/header-actions-context";

// ── helpers ───────────────────────────────────────────────────────────────────

const KNOWN_KEYS: Record<string, { label: string; description: string; type: "ms" | "number" | "string" | "boolean" }> = {
  "message-ttl":             { label: "Message TTL",          description: "Message expiry (ms)",             type: "ms" },
  "expires":                 { label: "Queue Expires",         description: "Queue expiry when unused (ms)",   type: "ms" },
  "max-length":              { label: "Max Length",            description: "Max message count",              type: "number" },
  "max-length-bytes":        { label: "Max Length Bytes",      description: "Max queue size in bytes",        type: "number" },
  "dead-letter-exchange":    { label: "Dead Letter Exchange",  description: "DLX name",                       type: "string" },
  "dead-letter-routing-key": { label: "DL Routing Key",        description: "Routing key for DLX",           type: "string" },
  "queue-mode":              { label: "Queue Mode",            description: "lazy or default",                type: "string" },
  "queue-type":              { label: "Queue Type",            description: "classic / quorum / stream",      type: "string" },
  "ha-mode":                 { label: "HA Mode",               description: "Mirroring (deprecated)",         type: "string" },
  "ha-params":               { label: "HA Params",             description: "HA mode parameters",            type: "string" },
  "overflow":                { label: "Overflow",              description: "drop-head or reject-publish",    type: "string" },
  "delivery-limit":          { label: "Delivery Limit",        description: "Max delivery attempts (quorum)", type: "number" },
  "max-age":                 { label: "Max Age",               description: "Stream retention (e.g. 7D)",    type: "string" },
  "stream-max-segment-size-bytes": { label: "Stream Segment", description: "Max segment size in bytes",      type: "number" },
};

function defSummary(def: Record<string, unknown>): string {
  return Object.keys(def)
    .map((k) => KNOWN_KEYS[k]?.label ?? k)
    .join(", ");
}

function hasHaMode(def: Record<string, unknown>): boolean {
  return "ha-mode" in def;
}

function tryParseJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

function safeRegex(pattern: string): RegExp | null {
  try { return new RegExp(pattern); } catch { return null; }
}

// ── apply-to badge ────────────────────────────────────────────────────────────

const APPLY_STYLES: Record<string, string> = {
  queues:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  exchanges: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  all:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

function ApplyBadge({ applyTo }: { applyTo: string }) {
  const simplified = applyTo === "classic_queues" || applyTo === "quorum_queues" || applyTo === "streams"
    ? "queues" : applyTo;
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${APPLY_STYLES[simplified] ?? "bg-muted text-muted-foreground"}`}>
      {applyTo}
    </span>
  );
}

// ── priority / conflict badge ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: "winning" | "overridden" | "active" }) {
  const styles = {
    winning:    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
    overridden: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
    active:     "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
}

// compute policy conflict status across all policies
function computeStatuses(policies: Policy[]): Map<string, "winning" | "overridden" | "active"> {
  const map = new Map<string, "winning" | "overridden" | "active">();
  // Group by vhost
  const byVhost = new Map<string, Policy[]>();
  for (const p of policies) {
    const list = byVhost.get(p.vhost) ?? [];
    list.push(p);
    byVhost.set(p.vhost, list);
  }
  for (const [, vhostPolicies] of byVhost) {
    const sorted = [...vhostPolicies].sort((a, b) => b.priority - a.priority);
    for (let i = 0; i < sorted.length; i++) {
      const key = `${sorted[i].vhost}/${sorted[i].name}`;
      if (sorted.length === 1) {
        map.set(key, "active");
      } else if (i === 0) {
        map.set(key, "winning");
      } else {
        map.set(key, "overridden");
      }
    }
  }
  return map;
}

// ── definition form builder ───────────────────────────────────────────────────

const COMMON_KEYS = [
  "message-ttl", "expires", "max-length", "max-length-bytes",
  "dead-letter-exchange", "dead-letter-routing-key", "queue-mode", "overflow", "delivery-limit",
];

function DefinitionBuilder({
  definition,
  onChange,
}: {
  definition: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState(JSON.stringify(definition, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const prevDef = useRef(definition);
  useEffect(() => {
    if (prevDef.current !== definition && !jsonMode) {
      setJsonText(JSON.stringify(definition, null, 2));
      prevDef.current = definition;
    }
  }, [definition, jsonMode]);

  function handleJsonChange(text: string) {
    setJsonText(text);
    const parsed = tryParseJson(text);
    if (parsed) {
      setJsonError(null);
      onChange(parsed);
    } else {
      setJsonError("Invalid JSON");
    }
  }

  function formatJson() {
    const parsed = tryParseJson(jsonText);
    if (parsed) setJsonText(JSON.stringify(parsed, null, 2));
  }

  function setKey(key: string, value: unknown) {
    if (value === "" || value === undefined) {
      const next = { ...definition };
      delete next[key];
      onChange(next);
    } else {
      onChange({ ...definition, [key]: value });
    }
    setJsonText(JSON.stringify({ ...definition, [key]: value }, null, 2));
  }

  const extraKeys = Object.keys(definition).filter((k) => !COMMON_KEYS.includes(k));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Definition</p>
        <div className="flex rounded-md border overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => { setJsonMode(false); setJsonText(JSON.stringify(definition, null, 2)); }}
            className={`px-3 py-1.5 font-medium transition-colors ${!jsonMode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            Builder
          </button>
          <button
            type="button"
            onClick={() => setJsonMode(true)}
            className={`px-3 py-1.5 font-medium transition-colors ${jsonMode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            JSON Value
          </button>
        </div>
      </div>

      {jsonMode ? (
        <div>
          <div className="relative">
            <textarea
              value={jsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full px-3 py-2 bg-zinc-950 text-emerald-400 border rounded-md text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            {jsonError ? <p className="text-xs text-destructive">{jsonError}</p> : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={() => navigator.clipboard.writeText(jsonText)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Copy
              </button>
              <button type="button" onClick={formatJson}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Format
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {COMMON_KEYS.map((key) => {
            const meta = KNOWN_KEYS[key]!;
            const val = definition[key];
            const isHa = key === "ha-mode";
            return (
              <div key={key} className={`flex items-start gap-3 ${isHa && val !== undefined ? "border border-amber-300 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-900/10" : ""}`}>
                <div className="flex-1">
                  <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    {meta.label}
                    {isHa && val !== undefined && (
                      <span className="text-amber-600 text-[10px]">deprecated</span>
                    )}
                  </label>
                  <p className="text-[10px] text-muted-foreground mb-1">{meta.description}</p>
                  <input
                    type={meta.type === "ms" || meta.type === "number" ? "number" : "text"}
                    value={val !== undefined ? String(val) : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) { setKey(key, ""); return; }
                      setKey(key, meta.type === "ms" || meta.type === "number" ? Number(v) : v);
                    }}
                    placeholder={val !== undefined ? undefined : "Not set"}
                    className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                </div>
                {val !== undefined && (
                  <button type="button" onClick={() => setKey(key, "")}
                    className="mt-6 p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                      <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
          {extraKeys.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground mb-2">Custom keys:</p>
              {extraKeys.map((key) => (
                <div key={key} className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-muted-foreground min-w-[120px]">{key}</span>
                  <input
                    value={String(definition[key])}
                    onChange={(e) => setKey(key, e.target.value)}
                    className="flex-1 px-2 py-1 bg-background border rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button type="button" onClick={() => setKey(key, "")}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors">
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
                      <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button"
            onClick={() => {
              if (typeof window === "undefined") return;
              const key = window.prompt("Key name:");
              if (key && !(key in definition)) onChange({ ...definition, [key]: "" });
            }}
            className="text-xs text-primary hover:underline">
            + Custom Key
          </button>
        </div>
      )}
    </div>
  );
}

// ── live pattern preview ──────────────────────────────────────────────────────

function PatternPreview({
  pattern,
  applyTo,
  queues,
  exchanges,
}: {
  pattern: string;
  applyTo: string;
  queues: Queue[];
  exchanges: Exchange[];
}) {
  const regex = safeRegex(pattern);
  if (!regex || !pattern) return null;

  const matchedQueues = applyTo !== "exchanges"
    ? queues.filter((q) => regex.test(q.name)).slice(0, 8)
    : [];
  const matchedExchanges = applyTo !== "queues"
    ? exchanges.filter((e) => regex.test(e.name)).slice(0, 8)
    : [];
  const total = matchedQueues.length + matchedExchanges.length;

  return (
    <div className="mt-2 border rounded-md overflow-hidden text-xs">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
        <span className="text-muted-foreground font-medium">Live Preview Matching</span>
        <span className={`font-semibold ${total > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
          {total} match{total !== 1 ? "es" : ""}
        </span>
      </div>
      {total === 0 ? (
        <p className="px-3 py-2 text-muted-foreground italic">No matches</p>
      ) : (
        <div className="divide-y divide-border max-h-40 overflow-y-auto">
          {matchedQueues.map((q) => (
            <div key={`q:${q.name}`} className="flex items-center justify-between px-3 py-1.5">
              <span className="font-mono">{q.name}</span>
              <span className="text-muted-foreground text-[10px] uppercase">queue</span>
            </div>
          ))}
          {matchedExchanges.map((e) => (
            <div key={`e:${e.name}`} className="flex items-center justify-between px-3 py-1.5">
              <span className="font-mono">{e.name || "(default)"}</span>
              <span className="text-muted-foreground text-[10px] uppercase">exchange</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── policy drawer (add / edit) ────────────────────────────────────────────────

function PolicyDrawer({
  policy,
  vhosts,
  queues,
  exchanges,
  onClose,
  onSaved,
}: {
  policy: Partial<Policy> | null;
  vhosts: string[];
  queues: Queue[];
  exchanges: Exchange[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!(policy?.name && policy?.vhost);
  const [name, setName]       = useState(policy?.name ?? "");
  const [vhost, setVhost]     = useState(policy?.vhost ?? (vhosts[0] ?? "/"));
  const [pattern, setPattern] = useState(policy?.pattern ?? "");
  const [applyTo, setApplyTo] = useState<string>(policy?.["apply-to"] ?? "queues");
  const [priority, setPriority] = useState(policy?.priority ?? 0);
  const [definition, setDefinition] = useState<Record<string, unknown>>(policy?.definition ?? {});
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const patternRegexValid = pattern === "" || safeRegex(pattern) !== null;

  async function handleSave() {
    if (!name.trim()) { setError("Policy name is required"); return; }
    if (!pattern.trim()) { setError("Pattern is required"); return; }
    if (!patternRegexValid) { setError("Pattern is not a valid regular expression"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/rabbitmq/policies/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern, "apply-to": applyTo, priority, definition }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed to save");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const hasHa = "ha-mode" in definition;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-[520px] max-w-full bg-background border-l shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <p className="font-semibold text-base">{isEdit ? "Edit Policy" : "Add Policy"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEdit ? "Update runtime parameter" : "Create runtime parameter"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {hasHa && (
            <div className="flex gap-3 p-3 border border-amber-300 rounded-lg bg-amber-50/50 dark:bg-amber-900/10">
              <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
              </svg>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <strong>Deprecation warning:</strong> The <code>ha-mode</code> mirroring policy is deprecated in favour of Quorum Queues.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Policy Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isEdit}
                placeholder="e.g. ttl-for-all-queues"
                className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Virtual Host</label>
              <Select value={vhost} onValueChange={setVhost} disabled={isEdit}>
                <SelectTrigger className="w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vhosts.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
              <input
                type="number"
                min={0}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Higher number overrides lower ones</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Pattern (Regex)</label>
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder=".*"
              className={`w-full px-3 py-1.5 bg-background border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary ${!patternRegexValid ? "border-destructive" : ""}`}
            />
            {!patternRegexValid && <p className="text-xs text-destructive mt-1">Invalid regular expression</p>}
            {patternRegexValid && pattern && (
              <PatternPreview pattern={pattern} applyTo={applyTo} queues={queues} exchanges={exchanges} />
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Apply To</label>
            <div className="flex gap-2">
              {(["all", "queues", "exchanges"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setApplyTo(opt)}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md border transition-colors capitalize ${applyTo === opt ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
                >
                  {opt === "all" ? "All" : opt === "queues" ? "Queues" : "Exchanges"}
                </button>
              ))}
            </div>
          </div>

          <DefinitionBuilder definition={definition} onChange={setDefinition} />

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="border-t p-4 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : isEdit ? "Update Policy" : "Create Policy"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ── detail drawer (view) ──────────────────────────────────────────────────────

function DetailDrawer({
  policy,
  status,
  queues,
  exchanges,
  onClose,
  onEdit,
  onDelete,
}: {
  policy: Policy;
  status: "winning" | "overridden" | "active";
  queues: Queue[];
  exchanges: Exchange[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const regex = safeRegex(policy.pattern);
  const matchedQueues = policy["apply-to"] !== "exchanges" && regex
    ? queues.filter((q) => q.vhost === policy.vhost && regex.test(q.name))
    : [];
  const matchedExchanges = policy["apply-to"] !== "queues" && regex
    ? exchanges.filter((e) => e.vhost === policy.vhost && regex.test(e.name))
    : [];
  const matchCount = matchedQueues.length + matchedExchanges.length;

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/rabbitmq/policies/${encodeURIComponent(policy.vhost)}/${encodeURIComponent(policy.name)}`,
        { method: "DELETE" },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Delete failed");
      onDelete();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-[520px] max-w-full bg-background border-l shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-start justify-between p-5 border-b">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-mono font-semibold text-sm">{policy.name}</p>
              <StatusBadge status={status} />
            </div>
            <p className="text-xs text-muted-foreground font-mono">{policy.vhost}</p>
            <div className="flex items-center gap-2 mt-2">
              <ApplyBadge applyTo={policy["apply-to"]} />
              <span className="text-xs text-muted-foreground">priority {policy.priority}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs font-mono text-muted-foreground">{policy.pattern}</span>
            </div>
          </div>
          <button onClick={onClose} className="ml-4 p-1.5 rounded hover:bg-muted transition-colors shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {hasHaMode(policy.definition) && (
            <div className="flex gap-3 p-3 border border-amber-300 rounded-lg bg-amber-50/50 dark:bg-amber-900/10">
              <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
              </svg>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <strong>Deprecation warning:</strong> The <code>ha-mode</code> mirroring policy is deprecated in favour of Quorum Queues.
              </p>
            </div>
          )}

          {/* definition */}
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Definition</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.keys(policy.definition).map((k) => (
                <span key={k} className="px-2 py-0.5 bg-muted rounded text-xs font-mono">
                  {KNOWN_KEYS[k]?.label ?? k}: {String(policy.definition[k])}
                </span>
              ))}
            </div>
            <pre className="p-3 bg-zinc-950 text-emerald-400 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(policy.definition, null, 2)}
            </pre>
          </div>

          {/* matched resources */}
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">
              Matched Resources ({matchCount})
            </p>
            {matchCount === 0 ? (
              <p className="text-sm text-muted-foreground">No queues or exchanges currently match this pattern.</p>
            ) : (
              <div className="border rounded-md overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-muted/50 text-muted-foreground uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {matchedQueues.map((q) => (
                      <tr key={`q:${q.name}`} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono">{q.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">queue</td>
                      </tr>
                    ))}
                    {matchedExchanges.map((e) => (
                      <tr key={`e:${e.name}`} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono">{e.name || "(default)"}</td>
                        <td className="px-3 py-2 text-muted-foreground">exchange</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* delete danger zone */}
          <div className="border-t pt-4">
            {deleteError && <p className="text-sm text-destructive mb-3">{deleteError}</p>}
            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="w-full px-4 py-2 bg-destructive/10 text-destructive border border-destructive/30 rounded-md text-sm font-medium hover:bg-destructive/20 transition-colors"
              >
                Delete Policy{matchCount > 0 ? ` (affects ${matchCount} resource${matchCount !== 1 ? "s" : ""})` : ""}
              </button>
            ) : (
              <div className="space-y-3 border border-destructive/30 rounded-lg p-4 bg-destructive/5">
                <p className="text-sm font-medium">
                  Delete policy <span className="font-mono text-destructive">{policy.name}</span>?
                  {matchCount > 0 && (
                    <span className="text-destructive"> This will affect {matchCount} resource{matchCount !== 1 ? "s" : ""}.</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button onClick={handleDelete} disabled={deleting}
                    className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50">
                    {deleting ? "Deleting..." : "Yes, delete it"}
                  </button>
                  <button onClick={() => setDeleteConfirm(false)}
                    className="flex-1 px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t p-4">
          <button
            onClick={onEdit}
            className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Edit Policy
          </button>
        </div>
      </div>
    </>
  );
}

// ── pagination ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  const visible: (number | "...")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= page - 1 && i <= page + 1)) visible.push(i);
    else if (visible[visible.length - 1] !== "...") visible.push("...");
  }
  return (
    <div className="flex gap-1 text-sm">
      <button onClick={() => onChange(page - 1)} disabled={page === 1}
        className="px-2.5 py-1.5 border rounded bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">&#8249;</button>
      {visible.map((v, i) =>
        v === "..."
          ? <span key={`e${i}`} className="px-2.5 py-1.5 text-muted-foreground">...</span>
          : <button key={v} onClick={() => onChange(v as number)}
              className={`px-2.5 py-1.5 border rounded font-medium transition-colors ${v === page ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>{v}</button>
      )}
      <button onClick={() => onChange(page + 1)} disabled={page === Math.ceil(total / PAGE_SIZE)}
        className="px-2.5 py-1.5 border rounded bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">&#8250;</button>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const queryClient = useQueryClient();
  const { setActions } = useHeaderActions();
  const [search, setSearch]         = useState("");
  const [vhostFilter, setVhost]     = useState("all");
  const [applyFilter, setApply]     = useState("all");
  const [page, setPage]             = useState(1);
  const [selectedKey, setSelectedKey] = useState<{ vhost: string; name: string } | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<Partial<Policy> | null | false>(false); // false = closed, null = new, Policy = edit

  const { data: policies, isError, error } = useQuery<Policy[]>({
    queryKey: ["policies"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/policies");
      const json = (await res.json()) as { data?: Policy[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 10_000,
  });

  const { data: queues = [] } = useQuery<Queue[]>({
    queryKey: ["queues"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/queues");
      const json = (await res.json()) as { data?: Queue[] };
      return json.data ?? [];
    },
    refetchInterval: 10_000,
  });

  const { data: exchanges = [] } = useQuery<Exchange[]>({
    queryKey: ["exchanges"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/exchanges");
      const json = (await res.json()) as { data?: Exchange[] };
      return json.data ?? [];
    },
    refetchInterval: 10_000,
  });

  const { data: vhostsData } = useQuery<Vhost[]>({
    queryKey: ["vhosts"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/vhosts");
      const json = (await res.json()) as { data?: Vhost[] };
      return json.data ?? [];
    },
  });

  const vhostNames = useMemo(() => (vhostsData ?? []).map((v) => v.name).sort(), [vhostsData]);

  useEffect(() => {
    setActions(
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setEditingPolicy(null)} className="gap-1.5 shrink-0">
          <Plus className="h-3.5 w-3.5" /> Add Policy
        </Button>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 10 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            className="pl-9 pr-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary w-48"
            placeholder="Search…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={vhostFilter} onValueChange={(v) => { setVhost(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Vhost: All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vhost: All</SelectItem>
            {vhostNames.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={applyFilter} onValueChange={(v) => { setApply(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Apply To: All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Apply To: All</SelectItem>
            <SelectItem value="queues">Queues</SelectItem>
            <SelectItem value="exchanges">Exchanges</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    );
    return () => setActions(null);
  }, [search, vhostFilter, applyFilter, vhostNames, setActions]);

  const statuses = useMemo(() => computeStatuses(policies ?? []), [policies]);

  const anyHa = useMemo(() => policies?.some((p) => hasHaMode(p.definition)) ?? false, [policies]);

  const filtered = useMemo(() => {
    if (!policies) return [];
    const q = search.toLowerCase();
    return policies.filter((p) => {
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.pattern.toLowerCase().includes(q);
      const matchVhost  = vhostFilter === "all" || p.vhost === vhostFilter;
      const matchApply  = applyFilter === "all" || p["apply-to"] === applyFilter || (applyFilter === "queues" && (p["apply-to"] === "classic_queues" || p["apply-to"] === "quorum_queues" || p["apply-to"] === "streams"));
      return matchSearch && matchVhost && matchApply;
    });
  }, [policies, search, vhostFilter, applyFilter]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const forQueues    = useMemo(() => policies?.filter((p) => ["queues", "classic_queues", "quorum_queues", "streams", "all"].includes(p["apply-to"])).length ?? 0, [policies]);
  const forExchanges = useMemo(() => policies?.filter((p) => ["exchanges", "all"].includes(p["apply-to"])).length ?? 0, [policies]);
  const overridden   = useMemo(() => [...statuses.values()].filter((s) => s === "overridden").length, [statuses]);

  const selected = useMemo(
    () => policies?.find((p) => p.vhost === selectedKey?.vhost && p.name === selectedKey?.name) ?? null,
    [policies, selectedKey],
  );

  async function handleSaved() {
    await queryClient.invalidateQueries({ queryKey: ["policies"] });
    setEditingPolicy(false);
  }

  return (
    <div className="space-y-6">
      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load policies"}
        </div>
      )}

      {anyHa && (
        <div className="flex gap-3 p-3 border border-amber-300 rounded-lg bg-amber-50/50 dark:bg-amber-900/10">
          <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
          </svg>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <strong>Deprecation warning:</strong> The <code>ha-mode</code> mirroring policy is deprecated in favour of Quorum Queues. Consider migrating to quorum queues for high availability.
          </p>
        </div>
      )}

      {/* summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Policies"  value={policies?.length ?? 0} />
        <StatCard label="For Queues"      value={forQueues} />
        <StatCard label="For Exchanges"   value={forExchanges} />
        <StatCard label="Overridden"      value={overridden} accent={overridden > 0 ? "text-amber-500" : ""} sub={overridden > 0 ? "lower priority" : undefined} />
      </div>

      {/* table */}
      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-center">Priority</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Vhost</th>
                <th className="px-5 py-3">Pattern</th>
                <th className="px-5 py-3">Apply To</th>
                <th className="px-5 py-3">Definition</th>
                <th className="px-5 py-3 text-right">Matches</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!policies ? (
                <tr><td colSpan={9} className="px-5 py-6 text-center text-muted-foreground">Loading...</td></tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <p className="text-muted-foreground font-medium">No policies configured</p>
                    <p className="text-muted-foreground text-xs mt-1 max-w-sm mx-auto">
                      Policies apply TTL, DLX, max-length, and other rules automatically to queues and exchanges matching a regexp pattern.
                    </p>
                    <button
                      onClick={() => setEditingPolicy(null)}
                      className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Add your first policy
                    </button>
                  </td>
                </tr>
              ) : (
                paged.map((p) => {
                  const key = `${p.vhost}/${p.name}`;
                  const status = statuses.get(key) ?? "active";
                  const regex = safeRegex(p.pattern);
                  const matchCount = regex
                    ? (p["apply-to"] !== "exchanges" ? queues.filter((q) => q.vhost === p.vhost && regex.test(q.name)).length : 0)
                      + (p["apply-to"] !== "queues" ? exchanges.filter((e) => e.vhost === p.vhost && regex.test(e.name)).length : 0)
                    : 0;
                  return (
                    <tr
                      key={key}
                      onClick={() => setSelectedKey({ vhost: p.vhost, name: p.name })}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-5 py-3"><StatusBadge status={status} /></td>
                      <td className="px-5 py-3 text-center font-mono font-semibold">{p.priority}</td>
                      <td className="px-5 py-3 font-medium">{p.name}</td>
                      <td className="px-5 py-3 font-mono text-muted-foreground text-xs">{p.vhost}</td>
                      <td className="px-5 py-3 font-mono text-xs max-w-[160px] truncate" title={p.pattern}>{p.pattern}</td>
                      <td className="px-5 py-3"><ApplyBadge applyTo={p["apply-to"]} /></td>
                      <td className="px-5 py-3 text-muted-foreground text-xs max-w-[200px] truncate" title={JSON.stringify(p.definition)}>
                        {defSummary(p.definition) || <span className="italic">empty</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">{matchCount}</td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingPolicy(p)}
                            className="px-2.5 py-1 text-xs border rounded hover:bg-muted transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Delete policy "${p.name}"?`)) return;
                              await fetch(`/api/rabbitmq/policies/${encodeURIComponent(p.vhost)}/${encodeURIComponent(p.name)}`, { method: "DELETE" });
                              await queryClient.invalidateQueries({ queryKey: ["policies"] });
                            }}
                            className="px-2.5 py-1 text-xs border border-destructive/30 text-destructive rounded hover:bg-destructive/10 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 bg-muted/30 border-t flex justify-between items-center text-xs text-muted-foreground">
          <span>
            {filtered.length === 0 ? "0 policies" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          </span>
          <Pagination page={page} total={filtered.length} onChange={setPage} />
        </div>
      </div>

      {/* detail drawer */}
      {selected && editingPolicy === false && (
        <DetailDrawer
          policy={selected}
          status={statuses.get(`${selected.vhost}/${selected.name}`) ?? "active"}
          queues={queues}
          exchanges={exchanges}
          onClose={() => setSelectedKey(null)}
          onEdit={() => setEditingPolicy(selected)}
          onDelete={async () => {
            setSelectedKey(null);
            await queryClient.invalidateQueries({ queryKey: ["policies"] });
          }}
        />
      )}

      {/* add/edit drawer */}
      {editingPolicy !== false && (
        <PolicyDrawer
          policy={editingPolicy}
          vhosts={vhostNames.length > 0 ? vhostNames : ["/"]}
          queues={queues}
          exchanges={exchanges}
          onClose={() => setEditingPolicy(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
