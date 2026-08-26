"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/*
  Square, hairline-bordered, tracked uppercase mono. There is no rounding
  and no fill gradient anywhere in this system: a control either carries
  ink (primary/danger, a decision) or a hairline outline (everything else).
  Motion is deliberately absent — a governance action should not feel
  springy.
*/
const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-inverted border border-accent-strong hover:bg-accent-strong",
  secondary: "border border-strong text-primary hover:bg-raised",
  ghost: "border border-transparent text-secondary hover:border-hairline hover:text-primary",
  danger: "bg-danger text-inverted border border-danger-ink hover:brightness-95",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3.5 py-2 text-[9.5px] gap-1.5",
  md: "px-4 py-2.5 text-[10px] gap-2",
};

export function Button({ variant = "secondary", size = "md", className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap font-mono uppercase tracking-[0.16em] transition-colors duration-150",
        // A disabled control keeps its outline and goes flat rather than
        // ghosting away — on this screen "you may not do this" is
        // information, not an absence.
        "disabled:pointer-events-none disabled:border-hairline disabled:bg-raised disabled:text-tertiary",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
