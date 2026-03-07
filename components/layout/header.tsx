"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { NAV_ITEMS } from "@/components/layout/nav-config";
import { useHeaderActions } from "@/components/layout/header-actions-context";

// ── count + help subtitles ────────────────────────────────────────────────────

const COUNT_QUERIES: Partial<Record<string, { key: string[]; url: string; subtitle?: string }>> = {
  "/connections": { key: ["connections"], url: "/api/rabbitmq/connections",
    subtitle: "Each entry here is a TCP connection from a client to the broker. Connections carry one or more channels and consume file descriptors on the server. A healthy system typically has a small, stable number of long-lived connections — a rising count or frequent churn can indicate connection leaks, misconfigured clients not using pooling, or services crashing and reconnecting." },
  "/channels":    { key: ["channels"],    url: "/api/rabbitmq/channels",
    subtitle: "AMQP channels are lightweight virtual sessions multiplexed over a single TCP connection. Each connection can open many channels, and each acts as an independent context for publishing or consuming messages. High channel counts may indicate connection pooling issues, leaked consumers, or clients that aren't closing channels properly — all of which consume broker memory and tracking overhead." },
  "/bindings":    { key: ["bindings"],    url: "/api/rabbitmq/bindings",
    subtitle: "Bindings connect exchanges to queues (or other exchanges) via routing rules. When a message arrives at an exchange, RabbitMQ evaluates its routing key and headers against all bindings to decide which queues receive a copy. A queue with no binding never receives messages from an exchange; a queue can have multiple bindings from different exchanges." },
  "/queues":      { key: ["queues"],      url: "/api/rabbitmq/queues",
    subtitle: "Message queues. Click a row to peek messages, publish, purge, or delete a queue." },
  "/exchanges":   { key: ["exchanges"],   url: "/api/rabbitmq/exchanges",
    subtitle: "Exchange routing tables. Click a row to test routing keys and view bound queues." },
  "/parameters":  { key: ["global-parameters"], url: "/api/rabbitmq/global-parameters",
    subtitle: "Global parameters are cluster-wide key-value settings persisted in RabbitMQ's internal database and replicated across all nodes. Plugins such as Federation and Shovel rely on them to store their runtime configuration. Unlike policies, global parameters are not scoped to a vhost and apply broker-wide." },
  "/vhosts":      { key: ["vhosts"],      url: "/api/rabbitmq/vhosts",
    subtitle: "Virtual hosts are fully isolated logical partitions within a RabbitMQ broker. Each vhost has its own queues, exchanges, bindings, users, and permissions — nothing is shared between them. They're commonly used to separate environments (dev / staging / prod), isolate tenants in multi-tenant deployments, or segment unrelated applications sharing the same physical broker. The default vhost is \"/\"." },
  "/limits":      { key: ["vhost-limits"], url: "/api/rabbitmq/vhost-limits",
    subtitle: "Vhost limits cap resource consumption on a per-vhost basis. max-connections prevents a single vhost from monopolising broker connections; max-queues limits queue proliferation. These guards are critical in shared or production environments where a misconfigured service or runaway client could otherwise exhaust broker resources. Set a value to -1 to leave it unlimited." },
  "/policies":    { key: ["policies"],    url: "/api/rabbitmq/policies",
    subtitle: "Policies are rule sets that RabbitMQ applies automatically to matching queues or exchanges within a vhost. They control behaviour like message TTL, max length, dead-lettering, and high availability — without requiring changes to client code. A policy matches by name pattern (regex) and apply-to scope, and the highest-priority policy wins when multiple match." },
  "/feature-flags": { key: ["feature-flags"], url: "/api/rabbitmq/feature-flags",
    subtitle: "Feature flags are optional broker capabilities that can be enabled but never disabled once on. They are used to gate new behaviours during upgrades, ensuring all nodes in a cluster agree before a feature becomes active. Enabling a flag before all nodes support it can prevent cluster formation — always upgrade all nodes first." },
  "/users":       { key: ["admin-users"], url: "/api/rabbitmq/users",
    subtitle: "RabbitMQ users are broker-level accounts used for authentication. Each user has a password hash and a set of tags that determine management UI access level. Tags include: administrator (full access), monitoring (read-only stats), management (UI login), and policymaker (can set policies). A user without vhost permissions cannot access any queues or exchanges — permissions are configured separately." },
  "/permissions": { key: ["admin-permissions"], url: "/api/rabbitmq/permissions",
    subtitle: "Permissions control what each user can do within a specific virtual host. Each permission entry has three regexp fields: configure (create/delete resources), write (publish messages, bind queues), and read (consume messages). Use .* for full access or empty string for no access. Permissions are per user per vhost — the same user can have different rights in different vhosts." },
};

const EXTRA_SUBTITLES: Partial<Record<string, string>> = {
  "/definitions": "Definitions are a complete JSON snapshot of the broker's configuration — all vhosts, exchanges, queues, bindings, users, permissions, and policies. Exporting creates a portable backup; importing merges the snapshot into the live broker without deleting existing resources. Use definitions to replicate topology across environments, version-control your broker config, or recover after a failure.",
  "/docs":     "Rask is an open source RabbitMQ management dashboard by Agdir Drift AS. Named after Ratatoskr, the Norse messenger squirrel.",
  "/terms":    "Rask is released under the Business Source License 1.1. Free for internal use. Commercial use requires a license — contact sales@agdir.no.",
  "/privacy":  "Rask stores nothing about you or your usage. No telemetry, no analytics, no data leaves your server.",
};

function usePageCount(pathname: string): { count: number | undefined; subtitle?: string; updatedAt: number } {
  const cfg = COUNT_QUERIES[pathname];
  const { data, dataUpdatedAt } = useQuery<unknown[]>({
    queryKey: cfg?.key ?? ["__noop__"],
    queryFn: async () => {
      const res = await fetch(cfg!.url);
      const json = (await res.json()) as { data?: unknown[] };
      return json.data ?? [];
    },
    enabled: !!cfg,
    refetchInterval: 5_000,
    staleTime: 5_000,
  });
  const subtitle = cfg?.subtitle ?? EXTRA_SUBTITLES[pathname];
  return { count: cfg ? data?.length : undefined, subtitle, updatedAt: dataUpdatedAt };
}

// ── header ────────────────────────────────────────────────────────────────────

export function Header() {
  const pathname = usePathname();
  const [infoOpen, setInfoOpen] = useState(false);

  const navItem = NAV_ITEMS.find((n) => n.href === pathname);
  const title = navItem?.label ?? pathname.split("/").filter(Boolean).join(" / ");
  const Icon = navItem?.icon;

  const { count, subtitle, updatedAt } = usePageCount(pathname);
  const { actions } = useHeaderActions();

  useEffect(() => { setInfoOpen(false); }, [pathname]);

  const updatedLabel = updatedAt > 0
    ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : null;

  return (
    <div className="shrink-0 border-b">
      <header className="flex h-14 items-center px-6 gap-4">
        {/* left: title */}
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon />}
          <h1 className="text-base font-semibold truncate">{title}</h1>
          {count !== undefined && (
            <span className="px-2 py-0.5 bg-muted rounded-full text-xs font-semibold text-muted-foreground shrink-0">
              {count}
            </span>
          )}
        </div>
        {/* center: page actions */}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        {/* right: updated + info */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {updatedLabel && (
            <span className="text-xs font-mono text-muted-foreground">
              {updatedLabel}
            </span>
          )}
          {subtitle && (
            <Button variant="outline" size="sm" onClick={() => setInfoOpen((o) => !o)}>
              ?
            </Button>
          )}
        </div>
      </header>
      <div className={`grid transition-all duration-200 ease-in-out ${infoOpen && subtitle ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="border-t bg-muted/40 px-6 py-4 text-sm leading-relaxed max-w-3xl">
            {subtitle}
          </div>
        </div>
      </div>
    </div>
  );
}
