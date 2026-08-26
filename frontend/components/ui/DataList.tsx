import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The key/value block used on every detail page: a fixed label column in
 * tracked mono, the value in mono beside it. Fixed rather than auto so
 * that stacked rows align down the page — a record you can scan a column
 * of, not a set of sentences.
 */
export function DataRow({
  label,
  children,
  tone,
  className,
}: {
  label: string;
  children: ReactNode;
  tone?: "default" | "danger" | "warning" | "accent";
  className?: string;
}) {
  const toneClass =
    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "accent" ? "text-accent" : "text-primary/80";
  return (
    <div
      className={cn(
        "grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-hairline px-4 py-2.5 last:border-b-0 sm:grid-cols-[136px_minmax(0,1fr)]",
        className,
      )}
    >
      <div className="label-mono pt-0.5">{label}</div>
      <div className={cn("min-w-0 font-mono text-[11.5px] break-words", toneClass)}>{children}</div>
    </div>
  );
}
