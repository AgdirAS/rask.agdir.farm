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
            </div>
          </div>
          <FloatingPublishWidget open={publishOpen} onClose={() => setPublishOpen(false)} />
        </PublishWidgetProvider>
      </ConnectionErrorProvider>
    </HeaderActionsProvider>
  );
}
