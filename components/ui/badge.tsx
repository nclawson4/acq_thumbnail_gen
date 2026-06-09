import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "muted" | "success" | "warn" | "error";

const toneClasses: Record<Tone, string> = {
  default:
    "bg-[color:var(--muted)] text-foreground border border-[color:var(--border)]",
  muted: "bg-transparent text-[color:var(--muted-foreground)] border border-[color:var(--border)]",
  success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  error: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
