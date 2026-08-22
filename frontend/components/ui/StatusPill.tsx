import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/status";
import { LiveDot } from "./LiveDot";

const toneClasses: Record<Tone, string> = {
  success: "bg-success-bg text-success border-success/25",
  warning: "bg-warning-bg text-warning border-warning/25",
  danger: "bg-danger-bg text-danger border-danger/25",
  neutral: "bg-neutral-bg text-neutral border-neutral/25",
  info: "bg-info-bg text-info border-info/25",
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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {live ? <LiveDot tone={tone} /> : Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
      {label}
    </span>
  );
}
