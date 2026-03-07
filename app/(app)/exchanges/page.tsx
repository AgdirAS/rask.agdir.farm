"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, fmtRate } from "@/lib/utils";
import { StatCard } from "@/components/stat-card";
import { useHeaderActions } from "@/components/layout/header-actions-context";
import type { Exchange, Binding } from "@/lib/types";
import {
  CheckCircle2,
  XCircle,
  Lock,
  Send,
  Trash2,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  X,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { useTraceStream } from "@/lib/use-trace-stream";
import { TraceSidebar, type TraceSidebarEntity } from "@/components/trace-sidebar";

// ── type badge ────────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  direct:  { bg: "bg-blue-100 dark:bg-blue-900/40",   text: "text-blue-700 dark:text-blue-300",   label: "direct"  },
  fanout:  { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", label: "fanout"  },
  topic:   { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300", label: "topic"   },
  headers: { bg: "bg-slate-100 dark:bg-slate-800",    text: "text-slate-600 dark:text-slate-300",  label: "headers" },
};

function TypeBadge({ type }: { type: string }) {
  const s = TYPE_STYLES[type] ?? { bg: "bg-muted", text: "text-muted-foreground", label: type };
  return (
    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-bold tracking-wide", s.bg, s.text)}>
      {s.label}
    </span>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function BoolIcon({ value, title }: { value: boolean; title: string }) {
  return value
    ? <span title={title}><CheckCircle2 className="h-4 w-4 text-emerald-500" /></span>
    : <span title={`Not ${title.toLowerCase()}`}><XCircle className="h-4 w-4 text-muted-foreground/30" /></span>;
}


const isDefault = (name: string) => name === "";
const isSystem  = (name: string) => name.startsWith("amq.");

type SortKey = "name" | "vhost" | "type" | "bindings";
type SortDir = "asc" | "desc";

// ── skeleton rows ─────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 7 }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ── routing key tester ────────────────────────────────────────────────────────

function topicPattern(routingKeyPattern: string): RegExp {
  const escaped = routingKeyPattern
    .split(".")
    .map((word) => {
      if (word === "#") return "(?:[^.]+\\.)*[^.]*";
      if (word === "*") return "[^.]+";
      return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("\\.");
  // Handle leading/trailing # edge cases
  return new RegExp(`^${escaped.replace(/\\\.\(\?:\[^\\.\]\+\\\.\)\*\[^\\.\]\*/g, "(?:[^.]+\\.)*[^.]*")}$`);
}

function matchesBinding(type: string, bindingKey: string, testKey: string): boolean {
  if (type === "fanout") return true;
  if (type === "direct") return bindingKey === testKey;
  if (type === "topic") {
    try {
      return topicPattern(bindingKey).test(testKey);
    } catch {
      return false;
    }
  }
  return false;
}

function RoutingKeyTester({ exchange, bindings }: { exchange: Exchange; bindings: Binding[] }) {
  const [input, setInput] = useState("");
  const [debouncedKey, setDebouncedKey] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedKey(input), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [input]);

  if (exchange.type === "headers") {
    return (
      <div className="rounded-md bg-muted/60 px-4 py-4 text-sm text-muted-foreground">
        Headers exchanges match on message header attributes, not routing keys. Use the Publish page to test routing with actual headers.
      </div>
    );
  }

  const matched = debouncedKey
    ? bindings.filter((b) => matchesBinding(exchange.type, b.routing_key, debouncedKey))
    : [];

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Routing Key to Test</label>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={exchange.type === "topic" ? "order.created.eu" : "my.routing.key"}
          className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
        />
        {exchange.type === "topic" && (
          <p className="text-[11px] text-muted-foreground mt-1">
            <span className="font-mono">*</span> matches one word · <span className="font-mono">#</span> matches zero or more words
          </p>
        )}
        {exchange.type === "fanout" && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Fanout exchanges route to all bindings regardless of routing key.
          </p>
        )}
      </div>

      {debouncedKey && (
        <div>
          {matched.length === 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              ⚠ No match — message would be dropped (unroutable)
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-2">
                ✓ Would route to {matched.length} queue{matched.length !== 1 ? "s" : ""}:
              </p>
              {matched.map((b, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800">
                  <span className="shrink-0 font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    {b.routing_key || "#"}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{b.destination}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!debouncedKey && bindings.length > 0 && (
        <p className="text-xs text-muted-foreground">Type a routing key to see which queues would receive the message.</p>
      )}
      {!debouncedKey && bindings.length === 0 && (
        <p className="text-xs text-muted-foreground">No bindings on this exchange — all messages would be dropped.</p>
      )}
    </div>
  );
}

// ── detail drawer ─────────────────────────────────────────────────────────────

interface DrawerProps {
  exchange: Exchange | null;
  bindings: Binding[];
  onClose: () => void;
  onDelete: (vhost: string, name: string) => Promise<void>;
}

type DrawerTab = "details" | "test";

function ExchangeDrawer({ exchange, bindings, onClose, onDelete }: DrawerProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("details");

  if (!exchange) return null;

  const isDefault_ = isDefault(exchange.name);
  const isSystem_  = isSystem(exchange.name);
  const canDelete  = !isDefault_ && !isSystem_;

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* panel */}
      <aside className="fixed right-0 top-0 z-50 flex h-full w-[460px] flex-col border-l bg-background shadow-2xl">
        {/* header */}
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {isDefault_ ? (
                <span className="italic text-muted-foreground font-medium">(default)</span>
              ) : (
                <span className="font-semibold text-sm break-all">{exchange.name}</span>
              )}
              <TypeBadge type={exchange.type} />
              {exchange.internal && (
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  <Lock className="h-3 w-3" /> internal
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">vhost: {exchange.vhost}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 rounded p-1 hover:bg-muted transition-colors shrink-0"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* drawer tabs */}
        <div className="flex border-b bg-muted/30 px-5">
          {(["details", "test"] as DrawerTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setDrawerTab(t)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${drawerTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t === "details" ? "Details" : "Test Routing Key"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {drawerTab === "test" && (
            <RoutingKeyTester exchange={exchange} bindings={bindings} />
          )}
          {drawerTab === "details" && (<>
          {/* metadata grid */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Metadata</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Type",        value: exchange.type },
                { label: "Durable",     value: exchange.durable     ? "Yes" : "No" },
                { label: "Auto-delete", value: exchange.auto_delete ? "Yes" : "No" },
                { label: "Internal",    value: exchange.internal    ? "Yes" : "No" },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-md bg-muted/60 px-3 py-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="mt-0.5 text-sm font-medium">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* message rates */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Message Rates</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-muted/60 px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Publish in</p>
                <p className="mt-0.5 text-sm font-medium tabular-nums">
                  {fmtRate(exchange.message_stats?.publish_details?.rate)}
                </p>
              </div>
              <div className="rounded-md bg-muted/60 px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Deliver out</p>
                <p className="mt-0.5 text-sm font-medium tabular-nums">
                  {fmtRate(exchange.message_stats?.deliver_get_details?.rate)}
                </p>
              </div>
            </div>
          </div>

          {/* bindings */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Bindings ({bindings.length})
            </p>
            {bindings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bindings.</p>
            ) : (
              <div className="space-y-1">
                {bindings.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="shrink-0 font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground max-w-[140px] truncate">
                      {b.routing_key || "#"}
                    </span>
                    <span className="text-muted-foreground shrink-0">→</span>
                    <span className="font-medium truncate">{b.destination}</span>
                    {b.destination_type === "exchange" && (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground italic">exchange</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          </>)}
        </div>

        {/* actions footer */}
        <div className="border-t px-5 py-4 space-y-3">
          <Button size="sm" variant="outline" className="w-full gap-2">
            <Send className="h-3.5 w-3.5" />
            Publish Message
          </Button>

          {canDelete && !confirming && (
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Exchange
            </Button>
          )}

          {canDelete && confirming && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-2">
              <p className="text-sm text-destructive font-medium">
                Delete <strong>{exchange.name}</strong>?
              </p>
              <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await onDelete(exchange.vhost, exchange.name);
                      onClose();
                    } finally {
                      setDeleting(false);
                      setConfirming(false);
                    }
                  }}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ── sort button ───────────────────────────────────────────────────────────────

function SortButton({
  children,
  sortKey,
  active,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <button
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide hover:text-foreground transition-colors"
      onClick={() => onSort(sortKey)}
    >
      {children}
      {isActive ? (
        dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function ExchangesPage() {
  const queryClient = useQueryClient();
  const { setActions } = useHeaderActions();
  const [search,      setSearch]      = useState("");
  const [vhostFilter, setVhostFilter] = useState("__all__");
  const [typeFilter,  setTypeFilter]  = useState("__all__");
  const [sortKey,     setSortKey]     = useState<SortKey>("name");
  const [sortDir,     setSortDir]     = useState<SortDir>("asc");
  const [selected,    setSelected]    = useState<Exchange | null>(null);
  const [tracedEntity, setTracedEntity] = useState<TraceSidebarEntity | null>(null);
  const trace = useTraceStream();

  async function handleDelete(vhost: string, name: string) {
    await fetch(
      `/api/rabbitmq/exchanges/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    );
    await queryClient.invalidateQueries({ queryKey: ["exchanges"] });
    await queryClient.invalidateQueries({ queryKey: ["bindings"] });
  }

  const { data: exchangesData, isLoading, isError, error } = useQuery<Exchange[]>({
    queryKey: ["exchanges"],
    queryFn: async () => {
      const res  = await fetch("/api/rabbitmq/exchanges");
      const json = (await res.json()) as { data?: Exchange[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 10_000,
  });

  const exchanges = useMemo(() => exchangesData ?? [], [exchangesData]);

  const { data: allBindings = [] } = useQuery<Binding[]>({
    queryKey: ["bindings"],
    queryFn: async () => {
      const res  = await fetch("/api/rabbitmq/bindings");
      const json = (await res.json()) as { data?: Binding[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 10_000,
  });

  // count bindings per exchange
  const bindingsCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of allBindings) {
      const key = `${b.vhost}/${b.source}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [allBindings]);

  // filter options
  const vhosts = useMemo(() => [...new Set(exchanges.map((e) => e.vhost))].sort(), [exchanges]);
  const types  = useMemo(() => [...new Set(exchanges.map((e) => e.type))].sort(), [exchanges]);

  useEffect(() => {
    setActions(
      <div className="flex items-center gap-2">
        <Input
          placeholder="Filter by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-52 text-sm"
        />
        <Select value={vhostFilter} onValueChange={(v) => setVhostFilter(v)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Virtual Hosts</SelectItem>
            {vhosts.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Types</SelectItem>
            {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>,
    );
    return () => setActions(null);
  }, [search, vhostFilter, typeFilter, vhosts, types, setActions]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const list = exchanges.filter((e) => {
      if (vhostFilter !== "__all__" && e.vhost !== vhostFilter) return false;
      if (typeFilter  !== "__all__" && e.type  !== typeFilter)  return false;
      if (search) {
        const q = search.toLowerCase();
        const name = (e.name || "(default)").toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if      (sortKey === "name")     cmp = (a.name || "(default)").localeCompare(b.name || "(default)");
      else if (sortKey === "vhost")    cmp = a.vhost.localeCompare(b.vhost);
      else if (sortKey === "type")     cmp = a.type.localeCompare(b.type);
      else if (sortKey === "bindings") {
        const ac = bindingsCountMap.get(`${a.vhost}/${a.name}`) ?? 0;
        const bc = bindingsCountMap.get(`${b.vhost}/${b.name}`) ?? 0;
        cmp = ac - bc;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    // Default exchange always first
    const defaults = list.filter((e) => isDefault(e.name));
    const rest     = list.filter((e) => !isDefault(e.name));
    return [...defaults, ...rest];
  }, [exchanges, search, vhostFilter, typeFilter, sortKey, sortDir, bindingsCountMap]);

  const selectedBindings = useMemo(
    () => selected
      ? allBindings.filter((b) => b.source === selected.name && b.vhost === selected.vhost)
      : [],
    [selected, allBindings],
  );

  const typeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of exchanges) map[e.type] = (map[e.type] ?? 0) + 1;
    return map;
  }, [exchanges]);

  const mostBound = useMemo(() => {
    let top: { name: string; count: number } | null = null;
    for (const [key, count] of bindingsCountMap) {
      if (!top || count > top.count) top = { name: key.split("/").slice(1).join("/") || "(default)", count };
    }
    return top;
  }, [bindingsCountMap]);

  return (
    <div className="space-y-6">
      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load exchanges"}
        </div>
      )}

      {/* summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total" value={exchanges.length} />
        <StatCard label="Direct"  value={typeCounts["direct"]  ?? 0} />
        <StatCard label="Fanout"  value={typeCounts["fanout"]  ?? 0} />
        <StatCard label="Topic"   value={typeCounts["topic"]   ?? 0} />
        <StatCard
          label="Most Bindings"
          value={mostBound ? mostBound.count : 0}
          sub={mostBound?.name}
        />
      </div>

      {/* table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton sortKey="vhost" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Vhost
                </SortButton>
              </TableHead>
              <TableHead>
                <SortButton sortKey="name" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Name
                </SortButton>
              </TableHead>
              <TableHead>
                <SortButton sortKey="type" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Type
                </SortButton>
              </TableHead>
              <TableHead>Features</TableHead>
              <TableHead className="text-right">Rate In</TableHead>
              <TableHead className="text-right">Rate Out</TableHead>
              <TableHead>
                <SortButton sortKey="bindings" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Bindings
                </SortButton>
              </TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No exchanges found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((exchange) => {
                const bindCount   = bindingsCountMap.get(`${exchange.vhost}/${exchange.name}`) ?? 0;
                const isDefault_  = isDefault(exchange.name);
                const isSystem_   = isSystem(exchange.name);
                const publishRate = exchange.message_stats?.publish_details?.rate;
                const deliverRate = exchange.message_stats?.deliver_get_details?.rate;
                // Non-default, non-fanout exchanges with 0 bindings are likely misconfigured
                const warnNoBindings = !isDefault_ && exchange.type !== "fanout" && bindCount === 0;

                return (
                  <TableRow
                    key={`${exchange.vhost}/${exchange.name}`}
                    className={cn(
                      "cursor-pointer",
                      (isSystem_ || isDefault_) && "opacity-60",
                    )}
                    onClick={() => setSelected(exchange)}
                  >
                    <TableCell className="text-muted-foreground text-sm font-mono">
                      {exchange.vhost}
                    </TableCell>
                    <TableCell>
                      {isDefault_ ? (
                        <span className="italic text-muted-foreground text-sm">(default)</span>
                      ) : (
                        <span className={cn("text-sm font-medium", isSystem_ && "text-muted-foreground")}>
                          {exchange.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={exchange.type} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <BoolIcon value={exchange.durable} title="Durable" />
                        {exchange.auto_delete && (
                          <span
                            className="text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded px-1 py-0.5"
                            title="Auto-delete"
                          >
                            AD
                          </span>
                        )}
                        {exchange.internal && (
                          <span title="Internal — not directly publishable">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {fmtRate(publishRate)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {fmtRate(deliverRate)}
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-sm font-medium", warnNoBindings && "text-amber-600 dark:text-amber-400")}>
                        {bindCount}
                        {warnNoBindings && (
                          <span title="No bindings — likely misconfigured">
                            <AlertTriangle className="inline-block ml-1.5 h-3.5 w-3.5 align-text-bottom" />
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <button
                        title="Live trace"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTracedEntity({ type: "exchange", name: exchange.name, vhost: exchange.vhost });
                        }}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Activity className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* detail drawer */}
      <ExchangeDrawer
        exchange={selected}
        bindings={selectedBindings}
        onClose={() => setSelected(null)}
        onDelete={handleDelete}
      />
      <TraceSidebar
        entity={tracedEntity}
        trace={trace}
        onClose={() => setTracedEntity(null)}
      />
    </div>
  );
}
