"use client";

import { useState, useCallback, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { EnvGateway, type GatewayReason } from "@/components/env-gateway";
import { HeaderActionsProvider } from "@/components/layout/header-actions-context";
import { ConnectionErrorProvider } from "@/components/layout/connection-error-context";
import { PublishWidgetProvider } from "@/components/publish-widget-context";
import { FloatingPublishWidget } from "@/components/floating-publish-widget";
import { SESSION_ENV_KEY } from "@/lib/constants";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [activeEnv, setActiveEnv] = useState<string | null>(null);
  const [reason, setReason] = useState<GatewayReason | null>(null);

  useEffect(() => {
    const slug = sessionStorage.getItem(SESSION_ENV_KEY);
    setActiveEnv(slug);
    if (!slug) setReason("first-run");
  }, []);

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
              <footer className="shrink-0 border-t px-6 py-2.5 text-xs text-muted-foreground bg-background space-y-1.5">
                {/* Agdir row */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium text-foreground/70">© Agdir Drift AS</span>
                  <span className="text-border">·</span>
                  {[
                    { href: "https://agdir.no",  label: "agdir.no",  external: true  },
                    { href: "/docs",             label: "About",     external: false },
                    { href: "/docs/privacy",     label: "Privacy",   external: false },
                    { href: "/docs/terms",       label: "Terms",     external: false },
                    { href: "/docs/licence",     label: "Licence",   external: false },
                  ].map(({ href, label, external }) => (
                    <a key={label} href={href}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="hover:text-foreground transition-colors">{label}</a>
                  ))}
                </div>
                {/* RabbitMQ row */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium text-foreground/60">RabbitMQ:</span>
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
