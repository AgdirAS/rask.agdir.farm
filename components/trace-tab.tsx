"use client";

import { useEffect, useRef } from "react";
import type { TraceEvent } from "@/lib/types";
import type { UseTraceStreamReturn } from "@/lib/use-trace-stream";

interface Props {
  trace: UseTraceStreamReturn;
  events: TraceEvent[]; // already filtered by caller
}

export function TraceTab({ trace, events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {trace.active && (
        <div className="mx-3 mt-3 p-2 rounded border border-amber-300 bg-amber-50/60 dark:bg-amber-900/10 text-[11px] text-amber-700 dark:text-amber-400 shrink-0">
          <strong>Firehose active</strong> — adds CPU/memory overhead. Switch tabs or close drawer to stop.
        </div>
      )}
      {trace.error && (
        <div className="mx-3 mt-2 p-2 rounded border border-rose-300 bg-rose-50 dark:bg-rose-900/10 text-xs text-rose-700 dark:text-rose-400 shrink-0">
          {trace.error}
        </div>
      )}
      <div className="flex-1 overflow-y-auto text-xs font-mono min-h-0">
        {events.length === 0 ? (
          <p className="p-4 text-muted-foreground italic">
            {trace.active ? "Waiting for messages…" : "Starting trace…"}
          </p>
        ) : (
          events.map((e, i) => (
            <div
              key={i}
              className={`px-3 py-2 border-b hover:bg-muted/30 ${
                e.type === "publish"
                  ? "border-l-2 border-l-violet-400"
                  : "border-l-2 border-l-emerald-400"
              }`}
            >
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-0.5">
                <span className={e.type === "publish" ? "text-violet-500 font-semibold" : "text-emerald-500 font-semibold"}>
                  {e.type}
                </span>
                <span>{new Date(e.timestamp).toLocaleTimeString()}</span>
                {e.routingKey && e.routingKey !== e.queue && (
                  <span className="text-muted-foreground/60">key: {e.routingKey}</span>
                )}
              </div>
              <div className="text-foreground truncate">
                {e.exchange || "(default)"}{e.queue ? ` → ${e.queue}` : ""}
              </div>
              <div className="text-muted-foreground truncate mt-0.5">
                {e.payload.slice(0, 120)}{e.payload.length > 120 ? "…" : ""}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
