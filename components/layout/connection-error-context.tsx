"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

interface ConnectionErrorContextValue {
  reportError: () => void;
}

const ConnectionErrorContext = createContext<ConnectionErrorContextValue>({
  reportError: () => {},
});

export function ConnectionErrorProvider({
  children,
  onError,
}: {
  children: ReactNode;
  onError: () => void;
}) {
  const value = useMemo(() => ({ reportError: onError }), [onError]);
  return (
    <ConnectionErrorContext.Provider value={value}>
      {children}
    </ConnectionErrorContext.Provider>
  );
}

export function useConnectionError() {
  return useContext(ConnectionErrorContext);
}
