"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/status";

interface StatTileProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  index?: number;
}

/*
  A gauge on the control plane: raised fill, a 3px cap in the tone colour
  along the top, and the number set large in mono so a column of tiles
  reads at a glance. The icon is subordinate — the number is the tile.
*/
const capClasses: Record<Tone, string> = {
  success: "border-t-success text-success",
  warning: "border-t-warning text-warning",
  danger: "border-t-danger text-danger",
  info: "border-t-accent text-accent",
  neutral: "border-t-rule text-primary",
};

export function StatTile({ label, value, icon: Icon, tone = "neutral", hint }: StatTileProps) {
  return (
    <div className={cn("flex flex-col gap-2.5 border border-t-[3px] border-hairline bg-raised p-4", capClasses[tone])}>
      <div className="flex items-start justify-between gap-3">
        <p className="label-mono">{label}</p>
        <Icon className="h-3.5 w-3.5 shrink-0 text-tertiary" strokeWidth={2} aria-hidden="true" />
      </div>
      <p className="font-mono text-[2.375rem] leading-none font-semibold tabular-nums">{value}</p>
      {hint && <p className="font-mono text-[10px] text-secondary">{hint}</p>}
    </div>
  );
}
