import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/status";

const toneDot: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-neutral",
  info: "bg-accent",
};

/** The pulsing-dot motif reserved for genuinely live state — see
 * docs/modules/frontend.md's motion design decision. Not decorative.
 * The one circle in a system of squares, which is what makes it read as
 * "this is moving right now" rather than as another label. */
export function LiveDot({ tone = "info", live = true, className }: { tone?: Tone; live?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex h-1.5 w-1.5", className)}>
      {live && (
        <span className={cn("absolute inline-flex h-full w-full animate-pulse-live rounded-full", toneDot[tone])} />
      )}
      <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", toneDot[tone])} />
    </span>
  );
}
