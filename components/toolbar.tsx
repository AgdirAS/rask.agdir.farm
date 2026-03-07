import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Toolbar({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center border-y py-4 my-4", className)}>
      <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0">
        {children}
      </div>
      {right && (
        <div className="ml-4 flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
          {right}
        </div>
      )}
    </div>
  );
}
