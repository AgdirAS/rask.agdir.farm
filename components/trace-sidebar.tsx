"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { TraceEvent } from "@/lib/types";
import type { UseTraceStreamReturn } from "@/lib/use-trace-stream";

export type TraceSidebarEntity = {
  type: "queue" | "exchange" | "connection" | "channel";
  name: string;
  vhost: string;
};

interface Props {
  entity: TraceSidebarEntity | null;
  trace: UseTraceStreamReturn;
  onClose: () => void;
}

function filterEvents(events: TraceEvent[], entity: TraceSidebarEntity): TraceEvent[] {
  if (entity.type === "queue") {
    return events.filter((e) => e.queue === entity.name || e.routingKey === entity.name);
  }
  if (entity.type === "exchange") {
    return events.filter((e) => e.exchange === entity.name);
  }
  return events; // connection / channel: unfiltered
}

const TYPE_COLOR: Record<TraceSidebarEntity["type"], string> = {
  queue:      "text-blue-500",
  exchange:   "text-violet-500",
  connection: "text-slate-500",
  channel:    "text-emerald-500",
};

export function TraceSidebar({ entity, trace, onClose }: Props) {
  const open = entity !== null;
  const bottomRef = useRef<HTMLDivElement>(null);
  const visible = useMemo(
    () => entity ? filterEvents(trace.events, entity) : [],
    [trace.events, entity]
  );

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible.length]);

  // Start/stop tracing when entity changes
  useEffect(() => {
    if (!entity) {
      void trace.stop();
      trace.clear();
      return;
    }
    void trace.start(entity.vhost);
    return () => {
      void trace.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity?.name, entity?.vhost]);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm font-mono truncate max-w-[260px]" title={entity?.name ?? ""}>
              {entity && (
                <>
                  <span className={`text-xs uppercase font-bold mr-2 ${TYPE_COLOR[entity.type]}`}>
                    {entity.type}
                  </span>
                  {entity.name || <span className="italic text-muted-foreground">(default)</span>}
                </>
              )}
            </SheetTitle>
            <div className="flex items-center gap-2 shrink-0">
              {trace.active && (
                <span className="flex items-center gap-1 text-xs text-rose-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  live
                </span>
              )}
              <button
                onClick={trace.clear}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </SheetHeader>

        {/* Firehose warning */}
        {trace.active && (
          <div className="mx-3 mt-2 p-2 rounded border border-amber-300 bg-amber-50/60 dark:bg-amber-900/10 text-[11px] text-amber-700 dark:text-amber-400 shrink-0">
            <strong>Firehose active</strong> — adds CPU/memory overhead. Close panel to stop.
          </div>
        )}

        {trace.error && (
          <div className="mx-3 mt-2 p-2 rounded border border-rose-300 bg-rose-50 dark:bg-rose-900/10 text-xs text-rose-700 dark:text-rose-400 shrink-0">
            {trace.error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto text-xs font-mono min-h-0">
          {visible.length === 0 ? (
            <p className="p-4 text-muted-foreground italic">
              {trace.active ? "Waiting for messages…" : "Starting trace…"}
            </p>
          ) : (
            visible.map((e, i) => (
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
                  {e.payload.slice(0, 100)}{e.payload.length > 100 ? "…" : ""}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
