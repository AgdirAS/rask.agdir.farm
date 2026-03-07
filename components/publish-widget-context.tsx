"use client";

import { createContext, useContext, type ReactNode } from "react";

type PublishWidgetCtx = { open: () => void };

const Ctx = createContext<PublishWidgetCtx>({ open: () => {} });

export function PublishWidgetProvider({
  children,
  onOpen,
}: {
  children: ReactNode;
  onOpen: () => void;
}) {
  return <Ctx.Provider value={{ open: onOpen }}>{children}</Ctx.Provider>;
}

export function usePublishWidget() {
  return useContext(Ctx);
}
