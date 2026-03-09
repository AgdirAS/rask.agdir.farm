"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import {
  Sun, Moon, Monitor, ChevronDown,
  Settings, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Overview } from "@/lib/types";
import { NAV_ITEMS, ADMIN_ITEMS } from "@/components/layout/nav-config";

// ── quick-action bar (theme · publish · admin) ────────────────────────────────

const THEME_OPTIONS = [
  { value: "light",  label: "Light",  icon: Sun },
  { value: "dark",   label: "Dark",   icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;


const iconBtn = "rounded-md p-1.5 transition-colors text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const iconBtnActive = "bg-sidebar-accent text-sidebar-accent-foreground";

function QuickActionBar({ onOpenPublish }: { onOpenPublish: () => void }) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = THEME_OPTIONS.find((o) => o.value === (mounted ? theme : "system")) ?? THEME_OPTIONS[2];
  const ThemeIcon = current.icon;
  const adminActive = ADMIN_ITEMS.some(({ href }) => pathname.startsWith(href));

  return (
    <div className="flex items-center justify-center gap-0.5 border-b px-3 py-1.5">
      {/* theme */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button title={`Theme: ${current.label}`} className={cn(iconBtn)}>
            <ThemeIcon className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-36">
          {THEME_OPTIONS.map(({ value, label, icon: Ic }) => (
            <DropdownMenuItem key={value} onClick={() => setTheme(value)} className="flex items-center gap-2">
              <Ic className="h-3.5 w-3.5 text-muted-foreground" />
              {label}
              {mounted && theme === value && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* publish */}
      <button title="Publish message" onClick={onOpenPublish} className={cn(iconBtn)}>
        <Send className="h-4 w-4" />
      </button>

      {/* admin */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button title="Admin" className={cn(iconBtn, adminActive && iconBtnActive)}>
            <Settings className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-48">
          {ADMIN_ITEMS.map(({ href, label, icon: Ic }) => (
            <DropdownMenuItem key={href} asChild>
              <Link href={href} className="flex items-center gap-2">
                <Ic className="h-3.5 w-3.5 text-muted-foreground" />
                {label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── server panel ──────────────────────────────────────────────────────────────

function ServerPanel({ onSwitchEnv }: { onSwitchEnv: () => void }) {
  const { data: overview, isError } = useQuery<Overview>({
    queryKey: ["overview"],
    queryFn: async () => {
      const res  = await fetch("/api/rabbitmq/overview");
      const json = (await res.json()) as { data?: Overview; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data!;
    },
    refetchInterval: 15_000,
    retry: false,
  });

  const reachable   = overview !== undefined && !isError;
  const clusterName = overview?.cluster_name ?? "—";
  const version     = overview?.rabbitmq_version;
  const erlang      = overview?.erlang_version;
  const node        = overview?.node;

  return (
    <div className="border-b px-3 py-2 space-y-1">
      <button
        onClick={onSwitchEnv}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group"
        title="Switch environment"
      >
        <span
          className={cn("h-2 w-2 rounded-full shrink-0", reachable ? "bg-green-500" : "bg-red-500")}
          title={reachable ? "Connected" : "Cannot reach RabbitMQ"}
        />
        <span className="flex-1 text-left font-medium truncate text-sidebar-foreground text-xs">
          {clusterName}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 group-hover:text-sidebar-accent-foreground" />
      </button>

      <div className="px-1 text-[10px] text-muted-foreground leading-relaxed">
        {version && (
          <div>RabbitMQ {version}{erlang ? ` · Erlang ${erlang}` : ""}</div>
        )}
        {node && <div className="truncate">{node}</div>}
        {!reachable && <div className="text-red-500">Unreachable</div>}
      </div>
    </div>
  );
}

// ── sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar({
  onSwitchEnv,
  onOpenPublish,
}: {
  onSwitchEnv: () => void;
  onOpenPublish: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[240px] flex-col border-r bg-sidebar">
      {/* logo */}
      <div className="flex h-14 items-center border-b px-4">
        <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-sidebar-foreground">
          <Image src="/rask-logo.png" alt="Rask" width={40} height={40} className="object-contain" />
          <span className="leading-tight">
            Rask
            <sub className="text-[10px] font-normal text-muted-foreground block leading-none">RabbitMQ client</sub>
          </span>
        </span>
      </div>

      {/* server widget — below logo, above nav */}
      <ServerPanel onSwitchEnv={onSwitchEnv} />

      {/* quick-action bar — theme · publish · admin */}
      <QuickActionBar onOpenPublish={onOpenPublish} />

      {/* nav */}
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* sidebar footer */}
      <div className="border-t px-3 py-2 text-[10px] text-muted-foreground space-y-1.5">
        <div>© 2026 Agdir Drift AS · v{process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <Link href="/docs"    className="hover:text-foreground transition-colors">About</Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link href="/terms"   className="hover:text-foreground transition-colors">Terms</Link>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="text-muted-foreground/60">RabbitMQ:</span>
          {[
            { href: "api/",                                                    label: "HTTP API" },
            { href: "https://www.rabbitmq.com/docs",                          label: "Docs" },
            { href: "https://www.rabbitmq.com/tutorials",                     label: "Tutorials" },
            { href: "https://www.rabbitmq.com/release-information",           label: "Releases" },
            { href: "https://www.rabbitmq.com/commercial-offerings",          label: "Support" },
            { href: "https://github.com/rabbitmq/rabbitmq-server/discussions",label: "Discussions" },
            { href: "https://rabbitmq.com/discord/",                          label: "Discord" },
            { href: "https://www.rabbitmq.com/docs/plugins",                  label: "Plugins" },
            { href: "https://www.rabbitmq.com/github",                        label: "GitHub" },
          ].map(({ href, label }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              className="hover:text-foreground transition-colors">{label}</a>
          ))}
        </div>
      </div>

    </aside>
  );
}
