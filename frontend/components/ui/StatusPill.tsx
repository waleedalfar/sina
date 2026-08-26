import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/status";
import { LiveDot } from "./LiveDot";

/*
  The specimen label. Square, hairline box with a 4px spine on the left in
  the tone colour, tracked uppercase mono. Never a soft rounded badge —
  every status in this product is a record of a decision, and it is
  labelled the way a sample is labelled.
*/
const toneClasses: Record<Tone, string> = {
  success: "bg-success-bg text-success border-success",
  warning: "bg-warning-bg text-warning border-warning",
  danger: "bg-danger-bg text-danger border-danger",
  neutral: "text-neutral border-strong",
  info: "bg-info-bg text-info border-accent",
};

interface StatusPillProps {
  tone: Tone;
  label: string;
  icon?: LucideIcon;
  live?: boolean;
  className?: string;
}

/** Status is always communicated by color + icon + text together — never
 * color alone (WCAG; see frontend.md's Accessibility section). */
export function StatusPill({ tone, label, icon: Icon, live, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap border border-l-4 px-2.5 py-1",
        "font-mono text-[9.5px] uppercase tracking-[0.16em]",
        toneClasses[tone],
        className,
      )}
    >
      {live ? <LiveDot tone={tone} /> : Icon ? <Icon className="h-3 w-3" strokeWidth={2.5} /> : null}
      {label}
    </span>
  );
}
