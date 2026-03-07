"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Queue, ConsumerDetail, QueueMessage, Binding } from "@/lib/types";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { fmtBytes, fmtRate, fmtCount } from "@/lib/utils";
import { StatCard } from "@/components/stat-card";
import { useHeaderActions } from "@/components/layout/header-actions-context";
import { useTraceStream } from "@/lib/use-trace-stream";
import { TraceTab } from "@/components/trace-tab";

function getArg<T>(args: Record<string, unknown>, key: string): T | undefined {
  return args[key] as T | undefined;
}

// ── badges ────────────────────────────────────────────────────────────────────

const STATE_STYLES: Record<string, string> = {
  running: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
  idle:    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  stopped: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400",
  crashed: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400",
  flow:    "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
};

const TYPE_STYLES: Record<string, string> = {
  classic: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  quorum:  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  stream:  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
};

function StateBadge({ state }: { state: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATE_STYLES[state] ?? "bg-muted text-muted-foreground border-border"}`}>
      {state}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium uppercase ${TYPE_STYLES[type] ?? "bg-muted text-muted-foreground"}`}>
      {type}
    </span>
  );
}

function DlxIcon({ exchange }: { exchange: string }) {
  return (
    <span title={`Dead letter exchange: ${exchange}`} className="ml-1 cursor-help">
      <svg className="inline w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none">
        <title>DLX: {exchange}</title>
        <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
      </svg>
    </span>
  );
}

// ── summary card ──────────────────────────────────────────────────────────────

// ── pagination ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  const visible: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= page - 1 && i <= page + 1)) visible.push(i);
    else if (visible[visible.length - 1] !== "…") visible.push("…");
  }
  return (
    <div className="flex gap-1 text-sm">
      <button onClick={() => onChange(page - 1)} disabled={page === 1}
        className="px-2.5 py-1.5 border rounded bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">‹</button>
      {visible.map((v, i) =>
        v === "…"
          ? <span key={`e${i}`} className="px-2.5 py-1.5 text-muted-foreground">…</span>
          : <button key={v} onClick={() => onChange(v as number)}
              className={`px-2.5 py-1.5 border rounded font-medium transition-colors ${v === page ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>{v}</button>
      )}
      <button onClick={() => onChange(page + 1)} disabled={page === Math.ceil(total / PAGE_SIZE)}
        className="px-2.5 py-1.5 border rounded bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">›</button>
    </div>
  );
}

// ── DLQ chain tracing ─────────────────────────────────────────────────────────

interface ChainNode {
  queue: string;
  vhost: string;
  dlx: string;
  nextQueue: string | null;
  nextVhost: string | null;
}

function buildDlxChain(
  startQueue: Queue,
  allQueues: Queue[],
  allBindings: Binding[],
  maxDepth = 5,
): ChainNode[] {
  const chain: ChainNode[] = [];
  let current: Queue | undefined = startQueue;

  for (let depth = 0; depth < maxDepth; depth++) {
    const dlx = current?.arguments?.["x-dead-letter-exchange"] as string | undefined;
    if (!dlx) break;

    const dlrk = current?.arguments?.["x-dead-letter-routing-key"] as string | undefined;

    // Find queues bound to this DLX that match the routing key
    const matchingBindings = allBindings.filter(
      (b) => b.source === dlx && b.vhost === current!.vhost &&
             (!dlrk || b.routing_key === dlrk || b.routing_key === ""),
    );
    const nextQueue = matchingBindings.length > 0
      ? allQueues.find((q) => q.name === matchingBindings[0].destination && q.vhost === current!.vhost)
      : undefined;

    chain.push({
      queue: current.name,
      vhost: current.vhost,
      dlx,
      nextQueue: nextQueue?.name ?? null,
      nextVhost: nextQueue?.vhost ?? null,
    });

    if (!nextQueue) break;
    current = nextQueue;
  }

  return chain;
}

function DlxChain({ queue }: { queue: Queue }) {
  const { data: allQueues } = useQuery<Queue[]>({
    queryKey: ["queues"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/queues");
      const json = (await res.json()) as { data?: Queue[] };
      return json.data ?? [];
    },
    staleTime: 5_000,
  });

  const { data: allBindings } = useQuery<Binding[]>({
    queryKey: ["bindings"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/bindings");
      const json = (await res.json()) as { data?: Binding[] };
      return json.data ?? [];
    },
    staleTime: 10_000,
  });

  const dlx = queue.arguments?.["x-dead-letter-exchange"] as string | undefined;
  if (!dlx) return null;
  if (!allQueues || !allBindings) {
    return <p className="text-xs text-muted-foreground">Loading chain…</p>;
  }

  const chain = buildDlxChain(queue, allQueues, allBindings);
  if (chain.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Dead Letter Chain</p>
      <div className="flex flex-col gap-2">
        {chain.map((node, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 bg-muted rounded font-mono font-medium truncate max-w-[160px]" title={node.queue}>
                {node.queue}
              </span>
              <span className="text-muted-foreground shrink-0">→</span>
              <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-mono text-[11px] truncate max-w-[120px]" title={node.dlx}>
                {node.dlx}
              </span>
              <span className="text-muted-foreground shrink-0">→</span>
              {node.nextQueue ? (
                <span className="px-2 py-1 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 rounded font-mono font-medium truncate max-w-[160px]" title={node.nextQueue}>
                  {node.nextQueue}
                </span>
              ) : (
                <span className="px-2 py-1 bg-muted/60 text-muted-foreground rounded text-[11px] italic">
                  no matching queue
                </span>
              )}
            </div>
            {i === 0 && (
              <p className="text-[10px] text-muted-foreground pl-2">
                This queue → exchange <span className="font-mono">{node.dlx}</span> → dead letter destination
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── create queue dialog ───────────────────────────────────────────────────────

const OVERFLOW_OPTIONS = ["drop-head", "reject-publish", "reject-publish-dlx"] as const;

function CreateQueueDialog({
  vhosts,
  onClose,
  onCreated,
}: {
  vhosts: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [vhost, setVhost] = useState(vhosts[0] ?? "/");
  const [durable, setDurable] = useState(true);
  const [autoDelete, setAutoDelete] = useState(false);
  const [ttl, setTtl] = useState("");
  const [maxLength, setMaxLength] = useState("");
  const [maxLengthBytes, setMaxLengthBytes] = useState("");
  const [dlx, setDlx] = useState("");
  const [dlrk, setDlrk] = useState("");
  const [overflow, setOverflow] = useState<"" | typeof OVERFLOW_OPTIONS[number]>("");
  const [lazy, setLazy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const args: Record<string, unknown> = {};
      if (ttl) args["x-message-ttl"] = Number(ttl);
      if (maxLength) args["x-max-length"] = Number(maxLength);
      if (maxLengthBytes) args["x-max-length-bytes"] = Number(maxLengthBytes);
      if (dlx) args["x-dead-letter-exchange"] = dlx;
      if (dlrk) args["x-dead-letter-routing-key"] = dlrk;
      if (overflow) args["x-overflow"] = overflow;
      if (lazy) args["x-queue-mode"] = "lazy";

      const res = await fetch(
        `/api/rabbitmq/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durable, auto_delete: autoDelete, arguments: args }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Create failed");
    },
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : "Create failed"),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-background border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-5 border-b">
            <h2 className="font-semibold text-base">New Queue</h2>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="p-5 space-y-4">
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label htmlFor="create-queue-name" className="text-xs font-medium text-muted-foreground block mb-1">Name *</label>
                <input
                  id="create-queue-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-queue"
                  className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Vhost</label>
                <select
                  value={vhost}
                  onChange={(e) => setVhost(e.target.value)}
                  className="w-full bg-background border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {vhosts.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-2 pt-4">
                {[
                  { label: "Durable", state: durable, set: setDurable },
                  { label: "Auto-delete", state: autoDelete, set: setAutoDelete },
                ].map(({ label, state, set }) => (
                  <label key={label} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state} onChange={(e) => set(e.target.checked)} className="rounded" />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">Arguments (optional)</p>
              <div className="space-y-2">
                {[
                  { label: "x-message-ttl (ms)", value: ttl, set: setTtl, placeholder: "60000" },
                  { label: "x-max-length", value: maxLength, set: setMaxLength, placeholder: "10000" },
                  { label: "x-max-length-bytes", value: maxLengthBytes, set: setMaxLengthBytes, placeholder: "104857600" },
                  { label: "x-dead-letter-exchange", value: dlx, set: setDlx, placeholder: "dlx.exchange" },
                  { label: "x-dead-letter-routing-key", value: dlrk, set: setDlrk, placeholder: "dead.letter" },
                ].map(({ label, value, set, placeholder }) => (
                  <div key={label} className="flex items-center gap-2">
                    <label className="text-xs font-mono text-muted-foreground w-52 shrink-0">{label}</label>
                    <input
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      placeholder={placeholder}
                      className="flex-1 px-2.5 py-1 bg-background border rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ))}

                <div className="flex items-center gap-2">
                  <label className="text-xs font-mono text-muted-foreground w-52 shrink-0">x-overflow</label>
                  <select
                    value={overflow}
                    onChange={(e) => setOverflow(e.target.value as typeof overflow)}
                    className="flex-1 bg-background border rounded px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">— default —</option>
                    {OVERFLOW_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={lazy} onChange={(e) => setLazy(e.target.checked)} className="rounded" />
                  <span className="text-xs font-mono text-muted-foreground">x-queue-mode: lazy</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex gap-2 p-5 pt-0">
            <button
              onClick={() => mutation.mutate()}
              disabled={!name.trim() || mutation.isPending}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? "Creating…" : "Create Queue"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── detail drawer ─────────────────────────────────────────────────────────────

type DrawerTab = "overview" | "consumers" | "messages" | "actions" | "trace";

function DetailDrawer({
  queue,
  onClose,
  onDeleted,
}: {
  queue: Queue;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [purging, setPurging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msgCount, setMsgCount] = useState(10);
  const [publishPayload, setPublishPayload] = useState("");
  const [publishContentType, setPublishContentType] = useState("application/json");
  const [publishPersistent, setPublishPersistent] = useState(true);
  const [publishHeaders, setPublishHeaders] = useState("");
  const [publishResult, setPublishResult] = useState<{ routed: boolean } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const trace = useTraceStream();
  const traceEvents = trace.events.filter(
    (e) => e.queue === queue.name || e.routingKey === queue.name
  );

  useEffect(() => {
    if (tab === "trace") {
      void trace.start(queue.vhost);
    } else {
      void trace.stop();
      trace.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    return () => { void trace.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dlx = getArg<string>(queue.arguments ?? {}, "x-dead-letter-exchange");
  const ttl = getArg<number>(queue.arguments ?? {}, "x-message-ttl");
  const isStream = queue.type === "stream";

  const { data: consumers, isLoading: consumersLoading } = useQuery<ConsumerDetail[]>({
    queryKey: ["queue-consumers", queue.vhost, queue.name],
    queryFn: async () => {
      const res = await fetch(`/api/rabbitmq/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}/consumers`);
      const json = (await res.json()) as { data?: ConsumerDetail[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    enabled: tab === "consumers",
    refetchInterval: 5_000,
  });

  const {
    data: messages,
    isLoading: messagesLoading,
    isError: messagesError,
    refetch: refetchMessages,
  } = useQuery<QueueMessage[]>({
    queryKey: ["queue-messages", queue.vhost, queue.name, msgCount],
    queryFn: async () => {
      const res = await fetch(
        `/api/rabbitmq/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}/get`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: msgCount }) },
      );
      const json = (await res.json()) as { data?: QueueMessage[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    enabled: false,
  });

  async function handlePurge() {
    setPurging(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/rabbitmq/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}/purge`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Purge failed");
      await queryClient.invalidateQueries({ queryKey: ["queues"] });
      setPurgeConfirm(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Purge failed");
    } finally {
      setPurging(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/rabbitmq/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Delete failed");
      await queryClient.invalidateQueries({ queryKey: ["queues"] });
      onDeleted();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setPublishError(null);
    setPublishResult(null);
    try {
      let headers: Record<string, unknown> | undefined;
      if (publishHeaders.trim()) {
        try {
          headers = JSON.parse(publishHeaders) as Record<string, unknown>;
        } catch {
          throw new Error("Headers must be valid JSON (e.g. {\"x-key\": \"value\"})");
        }
      }
      const res = await fetch(
        `/api/rabbitmq/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payload: publishPayload,
            content_type: publishContentType,
            persistent: publishPersistent,
            headers,
          }),
        },
      );
      const json = (await res.json()) as { routed?: boolean; error?: string };
      if (json.error) throw new Error(json.error);
      setPublishResult({ routed: json.routed ?? false });
      await queryClient.invalidateQueries({ queryKey: ["queues"] });
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  function formatPayload(msg: QueueMessage): string {
    if (msg.payload_encoding === "base64") return `[base64] ${msg.payload}`;
    try {
      return JSON.stringify(JSON.parse(msg.payload), null, 2);
    } catch {
      return msg.payload;
    }
  }

  const TABS: { id: DrawerTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "consumers", label: `Consumers (${queue.consumers})` },
    { id: "messages", label: "Messages" },
    { id: "actions", label: "Publish / Actions" },
    { id: "trace", label: trace.active ? "Live Trace ●" : "Live Trace" },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-[560px] max-w-full bg-background border-l shadow-xl flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-start justify-between p-5 border-b">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-semibold truncate">{queue.name}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{queue.vhost}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <TypeBadge type={queue.type ?? "classic"} />
              <StateBadge state={queue.state} />
              {queue.durable && <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">durable</span>}
              {queue.auto_delete && <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">auto-delete</span>}
              {queue.exclusive && <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">exclusive</span>}
              {dlx && <span className="text-xs text-amber-600 border border-amber-300 rounded px-1.5 py-0.5">DLX: {dlx}</span>}
            </div>
          </div>
          <button onClick={onClose} className="ml-4 p-1.5 rounded hover:bg-muted transition-colors shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* tabs */}
        <div className="flex border-b bg-muted/30 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── overview ─────────────────────────────────────────────────── */}
          {tab === "overview" && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Message Counts</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total", value: fmtCount(queue.messages), accent: "" },
                    { label: "Ready", value: fmtCount(queue.messages_ready), accent: "" },
                    { label: "Unacked", value: fmtCount(queue.messages_unacknowledged), accent: queue.messages_unacknowledged > 0 ? "text-amber-500" : "" },
                  ].map(({ label, value, accent }) => (
                    <div key={label} className="border rounded-lg p-3 text-center">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">{label}</p>
                      <p className={`text-lg font-bold ${accent}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Queue Details</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {[
                    ["Node", queue.node],
                    ["Memory", fmtBytes(queue.memory ?? 0)],
                    ["Consumers", String(queue.consumers)],
                    ["Type", queue.type ?? "classic"],
                    ["Durable", queue.durable ? "Yes" : "No"],
                    ["Auto-delete", queue.auto_delete ? "Yes" : "No"],
                    ["Exclusive", queue.exclusive ? "Yes" : "No"],
                    ["Idle since", queue.idle_since ?? "—"],
                    ...(dlx ? [["Dead Letter Exchange", dlx]] : []),
                    ...(ttl !== undefined ? [["Message TTL", `${ttl}ms`]] : []),
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10px] uppercase font-semibold text-muted-foreground">{k}</dt>
                      <dd className="font-mono text-sm mt-0.5 break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {Object.keys(queue.arguments ?? {}).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Arguments</p>
                  <div className="border rounded-md overflow-hidden text-xs font-mono">
                    {Object.entries(queue.arguments ?? {}).map(([k, v]) => (
                      <div key={k} className="flex gap-3 px-3 py-2 border-b last:border-b-0 hover:bg-muted/30">
                        <span className="text-muted-foreground min-w-[180px]">{k}</span>
                        <span className="break-all">{JSON.stringify(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DlxChain queue={queue} />
            </div>
          )}

          {/* ── consumers ────────────────────────────────────────────────── */}
          {tab === "consumers" && (
            <div>
              {consumersLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !consumers || consumers.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-muted-foreground font-medium">No consumers</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {queue.messages > 0 ? "⚠ Messages are backlogged with no consumer" : "Queue is idle"}
                  </p>
                </div>
              ) : (
                <div className="border rounded-md overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-muted/50 text-muted-foreground uppercase font-semibold">
                      <tr>
                        <th className="px-3 py-2">Tag</th>
                        <th className="px-3 py-2">Channel</th>
                        <th className="px-3 py-2 text-center">Ack</th>
                        <th className="px-3 py-2 text-right">Prefetch</th>
                        <th className="px-3 py-2 text-center">Exclusive</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {consumers.map((c) => (
                        <tr key={c.consumer_tag} className="hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono max-w-[120px] truncate" title={c.consumer_tag}>{c.consumer_tag}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate" title={c.channel_details.name}>{c.channel_details.name}</td>
                          <td className="px-3 py-2 text-center">{c.ack_required ? "manual" : "auto"}</td>
                          <td className="px-3 py-2 text-right">{c.prefetch_count || "∞"}</td>
                          <td className="px-3 py-2 text-center">{c.exclusive ? "✓" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── messages ─────────────────────────────────────────────────── */}
          {tab === "messages" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Select value={String(msgCount)} onValueChange={(v) => setMsgCount(Number(v))}>
                  <SelectTrigger className="w-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 5, 10, 25, 50].map((n) => (
                      <SelectItem key={n} value={String(n)}>Peek {n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  onClick={() => refetchMessages()}
                  disabled={messagesLoading}
                  className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {messagesLoading ? "Loading…" : "Fetch"}
                </button>
                {isStream && (
                  <p className="text-xs text-muted-foreground">(stream queues: shows from start of stream)</p>
                )}
              </div>

              {messagesError && (
                <p className="text-sm text-destructive">Failed to fetch messages</p>
              )}

              {messages && messages.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">Queue is empty</p>
              )}

              {messages && messages.length > 0 && (
                <div className="space-y-3">
                  {messages.map((msg, i) => (
                    <div key={i} className="border rounded-lg overflow-hidden text-xs">
                      <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 text-muted-foreground font-mono border-b">
                        <span>#{i + 1}</span>
                        {msg.routing_key && <span>key: <span className="text-foreground">{msg.routing_key}</span></span>}
                        {msg.exchange && <span>exchange: <span className="text-foreground">{msg.exchange || "(default)"}</span></span>}
                        {msg.redelivered && <span className="text-amber-500">redelivered</span>}
                      </div>
                      <pre className="p-3 overflow-x-auto text-xs leading-relaxed max-h-48 bg-muted/10 whitespace-pre-wrap break-words">
                        {formatPayload(msg)}
                      </pre>
                      {msg.properties && Object.keys(msg.properties).filter(k => msg.properties[k as keyof typeof msg.properties] !== undefined).length > 0 && (
                        <div className="px-3 py-2 border-t text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                          {Object.entries(msg.properties).map(([k, v]) =>
                            v !== undefined ? (
                              <span key={k}><span className="font-medium">{k}:</span> {String(v)}</span>
                            ) : null
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── actions ──────────────────────────────────────────────────── */}
          {tab === "actions" && (
            <div className="space-y-6">
              {/* publish */}
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Publish Message</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block">Content-Type</label>
                      <input
                        value={publishContentType}
                        onChange={(e) => setPublishContentType(e.target.value)}
                        className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Persistent</label>
                      <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <input type="checkbox" checked={publishPersistent} onChange={(e) => setPublishPersistent(e.target.checked)} className="rounded" />
                        <span className="text-sm">delivery-mode: 2</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Headers (JSON, optional)</label>
                    <input
                      value={publishHeaders}
                      onChange={(e) => setPublishHeaders(e.target.value)}
                      placeholder='{"x-custom": "value"}'
                      className="w-full px-3 py-1.5 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Payload</label>
                    <textarea
                      value={publishPayload}
                      onChange={(e) => setPublishPayload(e.target.value)}
                      rows={6}
                      placeholder='{"key": "value"}'
                      className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono resize-y"
                    />
                  </div>

                  {publishResult && (
                    <p className={`text-sm font-medium ${publishResult.routed ? "text-emerald-600" : "text-amber-600"}`}>
                      {publishResult.routed ? "✓ Message routed successfully" : "⚠ Message was not routed (no binding?)"}
                    </p>
                  )}
                  {publishError && <p className="text-sm text-destructive">{publishError}</p>}

                  <button
                    onClick={handlePublish}
                    disabled={publishing || !publishPayload.trim()}
                    className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {publishing ? "Publishing…" : "Publish Message"}
                  </button>
                </div>
              </div>

              {/* purge */}
              <div className="border-t pt-6">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Danger Zone</p>
                {actionError && (
                  <p className="text-sm text-destructive mb-3">{actionError}</p>
                )}
                {!isStream ? (
                  !purgeConfirm ? (
                    <button
                      onClick={() => setPurgeConfirm(true)}
                      className="w-full px-4 py-2 bg-amber-50 text-amber-700 border border-amber-300 rounded-md text-sm font-medium hover:bg-amber-100 transition-colors dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                    >
                      Purge Queue
                    </button>
                  ) : (
                    <div className="space-y-3 border border-amber-300 rounded-lg p-4 bg-amber-50/50 dark:bg-amber-900/10">
                      <p className="text-sm font-medium">Purge all {fmtCount(queue.messages)} messages from <span className="font-mono text-amber-700">{queue.name}</span>?</p>
                      <p className="text-xs text-muted-foreground">This permanently removes all messages. Cannot be undone.</p>
                      <div className="flex gap-2">
                        <button onClick={handlePurge} disabled={purging}
                          className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50">
                          {purging ? "Purging…" : "Yes, purge all"}
                        </button>
                        <button onClick={() => setPurgeConfirm(false)}
                          className="flex-1 px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground py-2">Purge is not available for stream queues.</p>
                )}

                <div className="mt-3">
                  {!deleteConfirm ? (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="w-full px-4 py-2 bg-destructive/10 text-destructive border border-destructive/30 rounded-md text-sm font-medium hover:bg-destructive/20 transition-colors"
                    >
                      Delete Queue
                    </button>
                  ) : (
                    <div className="space-y-3 border border-destructive/30 rounded-lg p-4 bg-destructive/5">
                      <p className="text-sm font-medium">Delete queue <span className="font-mono text-destructive">{queue.name}</span>?</p>
                      <p className="text-xs text-muted-foreground">All messages will be lost. This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button onClick={handleDelete} disabled={deleting}
                          className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50">
                          {deleting ? "Deleting…" : "Yes, delete it"}
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
            </div>
          )}

          {tab === "trace" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <TraceTab trace={trace} events={traceEvents} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

const ALL_STATES = ["running", "idle", "stopped", "crashed", "flow"] as const;
const ALL_TYPES  = ["classic", "quorum", "stream"] as const;

export default function QueuesPage() {
  const queryClient = useQueryClient();
  const { setActions } = useHeaderActions();
  const [search, setSearch]       = useState("");
  const [vhostFilter, setVhost]   = useState("all");
  const [typeFilter, setType]     = useState("all");
  const [stateFilter, setState]   = useState("all");
  const [page, setPage]           = useState(1);
  const [selectedKey, setSelectedKey] = useState<{ vhost: string; name: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isError, error } = useQuery<Queue[]>({
    queryKey: ["queues"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/queues");
      const json = (await res.json()) as { data?: Queue[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 5_000,
  });

  const selected = useMemo(
    () => data?.find((q) => q.vhost === selectedKey?.vhost && q.name === selectedKey?.name) ?? null,
    [data, selectedKey],
  );

  const vhosts = useMemo(() => Array.from(new Set(data?.map((q) => q.vhost) ?? [])).sort(), [data]);

  useEffect(() => {
    setActions(
      <div className="flex items-center gap-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <Input
            className="pl-9 w-52"
            placeholder="Search by name or vhost…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        {[
          { label: "Vhost",  value: vhostFilter, set: setVhost,  opts: vhosts },
          { label: "Type",   value: typeFilter,  set: setType,   opts: ALL_TYPES as unknown as string[] },
          { label: "State",  value: stateFilter, set: setState,  opts: ALL_STATES as unknown as string[] },
        ].map(({ label, value, set, opts }) => (
          <Select key={label} value={value} onValueChange={(v) => { set(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{label}: All</SelectItem>
              {opts.map((o) => (
                <SelectItem key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Queue
        </Button>
      </div>,
    );
    return () => setActions(null);
  }, [search, vhostFilter, typeFilter, stateFilter, vhosts, setActions]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((queue) => {
      const matchSearch = !q || queue.name.toLowerCase().includes(q) || queue.vhost.toLowerCase().includes(q);
      const matchVhost  = vhostFilter === "all" || queue.vhost === vhostFilter;
      const matchType   = typeFilter === "all" || (queue.type ?? "classic") === typeFilter;
      const matchState  = stateFilter === "all" || queue.state === stateFilter;
      return matchSearch && matchVhost && matchType && matchState;
    });
  }, [data, search, vhostFilter, typeFilter, stateFilter]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalMessages  = data?.reduce((s, q) => s + (q.messages ?? 0), 0) ?? 0;
  const totalUnacked   = data?.reduce((s, q) => s + (q.messages_unacknowledged ?? 0), 0) ?? 0;
  const totalConsumers = data?.reduce((s, q) => s + q.consumers, 0) ?? 0;
  const noConsumerBusy = data?.filter((q) => q.consumers === 0 && q.messages > 0).length ?? 0;

  function rowClass(q: Queue): string {
    const isCritical = (q.state === "crashed" || q.state === "stopped") || (q.messages > 0 && q.consumers === 0);
    const isWarning  = !isCritical && q.messages_unacknowledged > 0;
    if (isCritical) return "bg-rose-50/60 dark:bg-rose-900/10 hover:bg-rose-50 dark:hover:bg-rose-900/20";
    if (isWarning)  return "bg-amber-50/40 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20";
    return "hover:bg-muted/30";
  }

  return (
    <div className="space-y-6">
      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load queues"}
        </div>
      )}

      {/* summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Messages" value={fmtCount(totalMessages)} />
        <StatCard
          label="Unacknowledged"
          value={fmtCount(totalUnacked)}
          accent={totalUnacked > 0 ? "text-amber-500" : ""}
        />
        <StatCard label="Total Consumers" value={totalConsumers} />
        <StatCard
          label="No Consumer"
          value={noConsumerBusy}
          accent={noConsumerBusy > 0 ? "text-rose-500" : ""}
        />
      </div>

      {/* table */}
      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Vhost</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3 text-right">Ready</th>
                <th className="px-5 py-3 text-right">Unacked</th>
                <th className="px-5 py-3 text-right">Consumers</th>
                <th className="px-5 py-3 text-right">In</th>
                <th className="px-5 py-3 text-right">Deliver</th>
                <th className="px-5 py-3 text-right">Memory</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data ? (
                <tr><td colSpan={10} className="px-5 py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center">
                    <p className="text-muted-foreground font-medium">No queues found</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      {search || vhostFilter !== "all" || typeFilter !== "all" || stateFilter !== "all"
                        ? "Try adjusting your filters"
                        : "No queues declared in this broker"}
                    </p>
                  </td>
                </tr>
              ) : (
                paged.map((q) => {
                  const dlxArg = getArg<string>(q.arguments ?? {}, "x-dead-letter-exchange");
                  const noConsumerAlert = q.consumers === 0 && q.messages > 0;
                  return (
                    <tr
                      key={`${q.vhost}/${q.name}`}
                      onClick={() => setSelectedKey({ vhost: q.vhost, name: q.name })}
                      className={`cursor-pointer transition-colors ${rowClass(q)}`}
                    >
                      <td className="px-5 py-3">
                        <span className="font-medium">{q.name}</span>
                        {dlxArg && <DlxIcon exchange={dlxArg} />}
                      </td>
                      <td className="px-5 py-3 font-mono text-sm text-muted-foreground">{q.vhost}</td>
                      <td className="px-5 py-3"><TypeBadge type={q.type ?? "classic"} /></td>
                      <td className="px-5 py-3"><StateBadge state={q.state} /></td>
                      <td className="px-5 py-3 text-right font-mono">{fmtCount(q.messages_ready)}</td>
                      <td className={`px-5 py-3 text-right font-mono font-semibold ${q.messages_unacknowledged > 0 ? "text-amber-500" : ""}`}>
                        {fmtCount(q.messages_unacknowledged)}
                      </td>
                      <td className={`px-5 py-3 text-right font-mono font-semibold ${noConsumerAlert ? "text-rose-500" : ""}`}>
                        {q.consumers}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                        {fmtRate(q.message_stats?.publish_details?.rate)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                        {fmtRate(q.message_stats?.deliver_get_details?.rate)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                        {fmtBytes(q.memory ?? 0)}
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
            {filtered.length === 0 ? "0 queues" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          </span>
          <Pagination page={page} total={filtered.length} onChange={setPage} />
        </div>
      </div>

      {selected && (
        <DetailDrawer
          queue={selected}
          onClose={() => setSelectedKey(null)}
          onDeleted={() => {
            setSelectedKey(null);
            void queryClient.invalidateQueries({ queryKey: ["queues"] });
          }}
        />
      )}

      {showCreate && (
        <CreateQueueDialog
          vhosts={vhosts.length > 0 ? vhosts : ["/"]}
          onClose={() => setShowCreate(false)}
          onCreated={() => void queryClient.invalidateQueries({ queryKey: ["queues"] })}
        />
      )}
    </div>
  );
}
