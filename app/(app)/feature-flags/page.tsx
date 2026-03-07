"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeatureFlag } from "@/lib/types";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/stat-card";
import { useHeaderActions } from "@/components/layout/header-actions-context";
import { DataTable, type DataTableColumn } from "@/components/data-table";

// ── badges ────────────────────────────────────────────────────────────────────

function StabilityBadge({ stability }: { stability: string }) {
  if (stability === "experimental") {
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border border-orange-100 dark:border-orange-800">
        Experimental
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
      Stable
    </span>
  );
}

function StateBadge({ state }: { state: FeatureFlag["state"] }) {
  if (state === "enabled") {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium text-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        Enabled
      </span>
    );
  }
  if (state === "unavailable") {
    return (
      <span className="text-xs font-medium text-rose-500">Incompatible</span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">
      Disabled
    </span>
  );
}

// ── dependency cell ───────────────────────────────────────────────────────────

function DepsCell({ deps, enabledNames }: { deps?: string[]; enabledNames: Set<string> }) {
  if (!deps || deps.length === 0) {
    return <span className="text-muted-foreground/40 text-xs">—</span>;
  }
  const unmet = deps.filter((d) => !enabledNames.has(d));
  return (
    <span
      title={deps.map((d) => (enabledNames.has(d) ? `✓ ${d}` : `✗ ${d} (not enabled)`)).join("\n")}
      className={`inline-flex items-center gap-1 text-[11px] font-medium cursor-help ${
        unmet.length > 0 ? "text-rose-500" : "text-primary"
      }`}
    >
      <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none">
        <path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      {deps.length}
    </span>
  );
}

// ── confirm dialog ─────────────────────────────────────────────────────────────

function ConfirmDialog({
  flag,
  onCancel,
  onConfirm,
  enabling,
}: {
  flag: FeatureFlag;
  onCancel: () => void;
  onConfirm: () => void;
  enabling: boolean;
}) {
  const [checked, setChecked] = useState(false);
  const isExperimental = flag.stability === "experimental";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-background w-full max-w-md rounded-lg shadow-2xl border overflow-hidden">
        <div className="p-6 space-y-4">
          {/* title row */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold">Enable Feature Flag?</h3>
              <p className="text-sm text-muted-foreground">
                You are about to enable{" "}
                <code className="font-mono font-bold text-foreground bg-muted px-1 py-0.5 rounded text-xs">
                  {flag.name}
                </code>
              </p>
            </div>
          </div>

          {/* irreversible warning */}
          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-md">
            <p className="text-rose-700 dark:text-rose-400 text-xs font-semibold uppercase tracking-wider mb-1">
              Irreversible Action
            </p>
            <p className="text-rose-600 dark:text-rose-400/80 text-sm">
              Enabling a feature flag is irreversible. Once enabled, it cannot be disabled without recreating the cluster.
            </p>
          </div>

          {/* experimental extra warning */}
          {isExperimental && (
            <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-md">
              <p className="text-orange-700 dark:text-orange-400 text-xs font-semibold uppercase tracking-wider mb-1">
                Experimental Flag
              </p>
              <p className="text-orange-600 dark:text-orange-400/80 text-sm">
                This flag is marked experimental. It may cause data loss or cluster instability in production environments.
              </p>
            </div>
          )}

          {/* I understand checkbox */}
          <label className="flex items-start gap-3 p-3 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-sm font-medium text-foreground">
              I understand the risks and that this action is irreversible.
            </span>
          </label>
        </div>

        {/* footer */}
        <div className="px-6 py-4 bg-muted/30 border-t flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={enabling}
            className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!checked || enabling}
            className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {enabling ? "Enabling…" : "Confirm Activation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── section header ────────────────────────────────────────────────────────────

function SectionHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      {icon}
      <h2 className="font-semibold">{label}</h2>
    </div>
  );
}

// ── column factory ────────────────────────────────────────────────────────────

function makeFlagColumns(
  enabledNames: Set<string>,
  onEnableClick: (flag: FeatureFlag) => void,
): DataTableColumn<FeatureFlag>[] {
  return [
    {
      key: "name",
      header: "Name",
      render: (flag) => {
        const isUnavailable = flag.state === "unavailable";
        const isExperimental = flag.stability === "experimental";
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`font-mono text-xs font-semibold ${
                isUnavailable
                  ? "text-muted-foreground/50"
                  : isExperimental && flag.state === "disabled"
                  ? "text-indigo-700 dark:text-indigo-400"
                  : "text-foreground"
              }`}
            >
              {flag.name}
            </span>
            {isExperimental && flag.state === "disabled" && (
              <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-[9px] rounded font-bold uppercase tracking-widest border border-indigo-200 dark:border-indigo-800">
                Experimental
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "desc",
      header: "Description",
      render: (flag) => {
        const isUnavailable = flag.state === "unavailable";
        const isExperimental = flag.stability === "experimental";
        return (
          <span
            className={`text-sm max-w-xs truncate block ${
              isUnavailable ? "text-muted-foreground/40" : "text-muted-foreground"
            } ${isExperimental && flag.state === "disabled" ? "italic" : ""}`}
            title={flag.desc}
          >
            {flag.desc}
          </span>
        );
      },
    },
    {
      key: "stability",
      header: "Stability",
      render: (flag) => {
        const isUnavailable = flag.state === "unavailable";
        return isUnavailable ? (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-muted text-muted-foreground/50 border border-border">
            {flag.stability}
          </span>
        ) : (
          <StabilityBadge stability={flag.stability} />
        );
      },
    },
    {
      key: "provided_by",
      header: "Provided By",
      render: (flag) => {
        const isUnavailable = flag.state === "unavailable";
        return (
          <span className={`text-sm ${isUnavailable ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
            {flag.provided_by}
          </span>
        );
      },
    },
    {
      key: "depends_on",
      header: "Deps",
      align: "center",
      render: (flag) => <DepsCell deps={flag.depends_on} enabledNames={enabledNames} />,
    },
    {
      key: "state",
      header: "State / Action",
      align: "right",
      render: (flag) => {
        const isExperimental = flag.stability === "experimental";
        const unmetDeps = (flag.depends_on ?? []).filter((d) => !enabledNames.has(d));
        const canEnable = flag.state === "disabled" && unmetDeps.length === 0;

        if (flag.state === "enabled") return <StateBadge state="enabled" />;
        if (flag.state === "unavailable") {
          return (
            <div className="inline-flex items-center gap-1.5">
              <StateBadge state="unavailable" />
              <span
                title="Not all cluster nodes support this flag"
                className="text-muted-foreground cursor-help"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M8 7.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="8" cy="5.5" r="0.75" fill="currentColor" />
                </svg>
              </span>
            </div>
          );
        }
        // disabled
        if (canEnable) {
          return (
            <button
              onClick={(e) => { e.stopPropagation(); onEnableClick(flag); }}
              className={`px-3 py-1 text-xs font-semibold rounded hover:opacity-90 transition-opacity shadow-sm ${
                isExperimental
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-foreground text-background"
              }`}
            >
              Enable
            </button>
          );
        }
        return (
          <span title={`Requires: ${unmetDeps.join(", ")}`} className="inline-block">
            <button
              disabled
              className="px-3 py-1 text-xs font-semibold rounded bg-muted text-muted-foreground/50 cursor-not-allowed"
            >
              Enable
            </button>
          </span>
        );
      },
    },
  ];
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function FeatureFlagsPage() {
  const queryClient = useQueryClient();
  const { setActions } = useHeaderActions();
  const [stateFilter, setStateFilter] = useState("all");
  const [stabilityFilter, setStabilityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pendingFlag, setPendingFlag] = useState<FeatureFlag | null>(null);
  const [enabling, setEnabling] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery<FeatureFlag[]>({
    queryKey: ["feature-flags"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/feature-flags");
      const json = (await res.json()) as { data?: FeatureFlag[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const flags = useMemo(() => data ?? [], [data]);

  const enabledNames = useMemo(
    () => new Set(flags.filter((f) => f.state === "enabled").map((f) => f.name)),
    [flags],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return flags.filter((f) => {
      if (stateFilter !== "all" && f.state !== stateFilter) return false;
      if (stabilityFilter !== "all" && f.stability !== stabilityFilter) return false;
      if (q && !f.name.toLowerCase().includes(q) && !f.desc.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [flags, stateFilter, stabilityFilter, search]);

  useEffect(() => {
    setActions(
      <div className="flex items-center gap-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <Input
            className="pl-9 w-48"
            placeholder="Search flags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={stateFilter} onValueChange={(v) => setStateFilter(v)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">State: All</SelectItem>
            <SelectItem value="enabled">Enabled</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
            <SelectItem value="unavailable">Unavailable</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stabilityFilter} onValueChange={(v) => setStabilityFilter(v)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Stability: All</SelectItem>
            <SelectItem value="stable">Stable</SelectItem>
            <SelectItem value="experimental">Experimental</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M13.5 2.5A7 7 0 1 0 14 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M14 2.5V6h-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Refresh
        </Button>
      </div>,
    );
    return () => setActions(null);
  }, [search, stateFilter, stabilityFilter, refetch, setActions]);

  // summary counts
  const enabledCount     = flags.filter((f) => f.state === "enabled").length;
  const disabledCount    = flags.filter((f) => f.state === "disabled").length;
  const unavailableCount = flags.filter((f) => f.state === "unavailable").length;
  const experimentalCount = flags.filter((f) => f.stability === "experimental" && f.state === "enabled").length;

  // grouped
  const enabledFlags     = filtered.filter((f) => f.state === "enabled");
  const disabledFlags    = filtered.filter((f) => f.state === "disabled");
  const unavailableFlags = filtered.filter((f) => f.state === "unavailable");

  const hasDisabledFlags = disabledCount > 0;

  const flagColumns = useMemo(
    () => makeFlagColumns(enabledNames, setPendingFlag),
    [enabledNames],
  );

  async function handleConfirm() {
    if (!pendingFlag) return;
    setEnabling(true);
    try {
      await fetch(`/api/rabbitmq/feature-flags/${encodeURIComponent(pendingFlag.name)}`, {
        method: "PUT",
      });
      await queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
      setPendingFlag(null);
    } finally {
      setEnabling(false);
    }
  }

  return (
    <div className="space-y-6">
      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load feature flags"}
        </div>
      )}

      {/* recommended banner */}
      {hasDisabledFlags && !isLoading && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg flex gap-3 items-start">
          <svg className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M6.788 1.996c.533-.924 1.891-.924 2.424 0l5.025 8.7c.532.923-.135 2.079-1.212 2.079H2.975c-1.077 0-1.744-1.156-1.212-2.079l5.025-8.7zM8 4a.75.75 0 01.75.75v2.8a.75.75 0 01-1.5 0V4.75A.75.75 0 018 4zm0 7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <div>
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400">
              {disabledCount} Feature Flag{disabledCount !== 1 ? "s" : ""} Disabled
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-500/80 mt-0.5">
              Some feature flags are currently disabled. Review below and enable them during your maintenance window.
            </p>
          </div>
        </div>
      )}

      {/* summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Enabled"     value={enabledCount}     accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Disabled"    value={disabledCount}    accent="text-muted-foreground" />
        <StatCard label="Unavailable" value={unavailableCount} accent={unavailableCount > 0 ? "text-rose-500" : ""} />
        <StatCard
          label="Experimental Enabled"
          value={experimentalCount}
          warn
          icon={
            experimentalCount > 0 ? (
              <svg className="w-4 h-4 text-orange-500" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M6.788 1.996c.533-.924 1.891-.924 2.424 0l5.025 8.7c.532.923-.135 2.079-1.212 2.079H2.975c-1.077 0-1.744-1.156-1.212-2.079l5.025-8.7zM8 4a.75.75 0 01.75.75v2.8a.75.75 0 01-1.5 0V4.75A.75.75 0 018 4zm0 7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            ) : undefined
          }
        />
      </div>

      {/* loading state */}
      {isLoading && (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading feature flags…</div>
      )}

      {/* all-green calm state */}
      {!isLoading && disabledCount === 0 && unavailableCount === 0 && flags.length > 0 && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/30 rounded-lg flex gap-3 items-center">
          <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.28 5.78a.75.75 0 00-1.06-1.06L7 8.94 5.78 7.72a.75.75 0 00-1.06 1.06l1.75 1.75a.75.75 0 001.06 0l3.75-3.75z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
            All {enabledCount} feature flags are enabled. Your cluster is fully up to date.
          </p>
        </div>
      )}

      {/* grouped sections */}
      {!isLoading && (
        <div className="space-y-8">
          {/* enabled */}
          {enabledFlags.length > 0 && (
            <section>
              <SectionHead
                icon={
                  <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.28 5.78a.75.75 0 00-1.06-1.06L7 8.94 5.78 7.72a.75.75 0 00-1.06 1.06l1.75 1.75a.75.75 0 001.06 0l3.75-3.75z" clipRule="evenodd" />
                  </svg>
                }
                label="Enabled Feature Flags"
              />
              <DataTable
                columns={flagColumns}
                data={enabledFlags}
                pageSize={0}
                emptyMessage="No enabled flags"
              />
            </section>
          )}

          {/* disabled */}
          {disabledFlags.length > 0 && (
            <section>
              <SectionHead
                icon={
                  <svg className="w-4 h-4 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                }
                label="Disabled Feature Flags"
              />
              <DataTable
                columns={flagColumns}
                data={disabledFlags}
                pageSize={0}
                emptyMessage="No disabled flags"
                getRowClassName={(flag) =>
                  flag.stability === "experimental"
                    ? "bg-indigo-50/30 dark:bg-indigo-950/20 border-l-2 border-indigo-500"
                    : ""
                }
              />
              {disabledFlags.some((f) => f.stability === "experimental") && (
                <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-lg flex gap-3 items-center">
                  <svg className="w-4 h-4 text-orange-500 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M6.788 1.996c.533-.924 1.891-.924 2.424 0l5.025 8.7c.532.923-.135 2.079-1.212 2.079H2.975c-1.077 0-1.744-1.156-1.212-2.079l5.025-8.7z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-orange-700 dark:text-orange-400">
                    Flags marked <strong>Experimental</strong> should not be enabled in production — they may cause data loss or cluster instability.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* unavailable */}
          {unavailableFlags.length > 0 && (
            <section>
              <SectionHead
                icon={
                  <svg className="w-4 h-4 text-rose-500 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zM5.03 5.03a.75.75 0 011.061 0L8 6.94l1.909-1.91a.75.75 0 111.06 1.06L9.06 8l1.91 1.909a.75.75 0 11-1.06 1.06L8 9.06l-1.909 1.91a.75.75 0 11-1.06-1.06L6.94 8 5.03 6.091a.75.75 0 010-1.061z" clipRule="evenodd" />
                  </svg>
                }
                label="Unavailable Feature Flags"
              />
              <div className="opacity-75">
                <DataTable
                  columns={flagColumns}
                  data={unavailableFlags}
                  pageSize={0}
                  emptyMessage="No unavailable flags"
                  getRowClassName={() => "bg-muted/20"}
                />
              </div>
            </section>
          )}

          {!isLoading && filtered.length === 0 && flags.length > 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">No flags match your filters.</p>
          )}
        </div>
      )}

      {/* confirm dialog */}
      {pendingFlag && (
        <ConfirmDialog
          flag={pendingFlag}
          onCancel={() => setPendingFlag(null)}
          onConfirm={handleConfirm}
          enabling={enabling}
        />
      )}
    </div>
  );
}
