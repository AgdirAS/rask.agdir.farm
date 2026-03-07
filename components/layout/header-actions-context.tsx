"use client";

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";

type Ctx = { actions: ReactNode; setActions: (n: ReactNode) => void };

const HeaderActionsCtx = createContext<Ctx>({ actions: null, setActions: () => {} });

export function HeaderActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  const value = useMemo(() => ({ actions, setActions }), [actions]);
  return <HeaderActionsCtx.Provider value={value}>{children}</HeaderActionsCtx.Provider>;
}

export function useHeaderActions() {
  return useContext(HeaderActionsCtx);
}

/** Mount page-level header actions; clears them on unmount. */
export function useSetHeaderActions(node: ReactNode) {
  const { setActions } = useHeaderActions();
  useEffect(() => {
    setActions(node);
    return () => setActions(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
