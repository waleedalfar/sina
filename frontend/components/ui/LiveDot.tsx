import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/status";

const toneDot: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-neutral",
  info: "bg-info",
};

/** The pulsing-dot motif reserved for genuinely live state — see
 * docs/modules/frontend.md's motion design decision. Not decorative. */
export function LiveDot({ tone = "info", live = true, className }: { tone?: Tone; live?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      {live && (
        <span className={cn("absolute inline-flex h-full w-full rounded-full animate-pulse-live", toneDot[tone])} />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", toneDot[tone])} />
    </span>
  );
}
