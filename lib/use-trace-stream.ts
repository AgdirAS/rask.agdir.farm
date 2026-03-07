"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { TraceEvent } from "@/lib/types";

export interface UseTraceStreamReturn {
  events: TraceEvent[];
  active: boolean;
  error: string | null;
  start: (vhost: string) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
}

export function useTraceStream(): UseTraceStreamReturn {
  const [events, setEvents]   = useState<TraceEvent[]>([]);
  const [active, setActive]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const esRef                 = useRef<EventSource | null>(null);
  const vhostRef              = useRef<string>("/");

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  const start = useCallback(async (vhost: string) => {
    // Close any existing connection first
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
      try {
        await fetch(`/api/rabbitmq/vhosts/${encodeURIComponent(vhostRef.current)}/trace-off`, { method: "POST" });
      } catch { /* best effort */ }
    }

    setError(null);
    vhostRef.current = vhost;
    try {
      const res = await fetch(`/api/rabbitmq/vhosts/${encodeURIComponent(vhost)}/trace-on`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to enable tracing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enable tracing");
      return;
    }
    const es = new EventSource(`/api/rabbitmq/trace/stream?vhost=${encodeURIComponent(vhost)}`);
    esRef.current = es;
    es.addEventListener("error", (e) => {
      const me = e as MessageEvent;
      if (me.data) {
        // Named "event: error" from server
        try { setError((JSON.parse(me.data as string) as { error: string }).error); } catch { /* ignore */ }
      } else {
        // Network-level EventSource failure
        setError("Connection lost");
        setActive(false);
      }
    });
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as TraceEvent;
        setEvents((prev) => [...prev.slice(-299), event]);
      } catch { /* skip */ }
    };
    setActive(true);
  }, []);

  const stop = useCallback(async () => {
    esRef.current?.close();
    esRef.current = null;
    setActive(false);
    try {
      await fetch(`/api/rabbitmq/vhosts/${encodeURIComponent(vhostRef.current)}/trace-off`, { method: "POST" });
    } catch { /* best effort */ }
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  return { events, active, error, start, stop, clear };
}
