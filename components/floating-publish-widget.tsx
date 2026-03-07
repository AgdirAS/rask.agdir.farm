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
