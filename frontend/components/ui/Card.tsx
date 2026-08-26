import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/*
  A panel of the register: square, one hairline, paper fill. Cards do not
  float — depth comes from the border and the raised header strip, never
  from a radius or a drop shadow (the only shadowed surfaces in this system
  are modals and the drawer, which genuinely sit above the page).
*/
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border border-hairline bg-surface", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel-head", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-mono text-[10px] uppercase tracking-[0.22em] text-primary", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}
