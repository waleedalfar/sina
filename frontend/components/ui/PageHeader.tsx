import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Every page opens the same way: a tracked-mono eyebrow naming where you
 * are in the register, the title, one line of what this page is for, and
 * then the heavy ink rule. The rule is the strongest line on the page and
 * it is what makes a screen read as a document rather than a dashboard.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  aside,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("page-rule flex flex-wrap items-end justify-between gap-4 pb-3.5", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className={cn("text-[26px] leading-tight font-semibold tracking-[-0.025em] sm:text-[30px]", eyebrow && "mt-2")}>
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-[70ch] text-[13.5px] text-secondary">{description}</p>}
        {aside}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
