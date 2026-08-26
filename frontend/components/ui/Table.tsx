import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Registers, not data grids. A table here is an ink masthead over hairline
 * rows, each row carrying a 4px spine on the left in the colour of its
 * state — so a column of rows shows where the exceptions are before you
 * read a word of it.
 *
 * One column template is passed per table and shared by the head and every
 * row, which is what keeps the columns actually aligned. Below `md` the
 * template is dropped and cells stack: a six-column register at 390px is
 * unreadable, and squeezing it produces a worse artefact than stacking it.
 */
type ColProps = { cols: string } & { style?: CSSProperties };

function colStyle(cols: string, style?: CSSProperties): CSSProperties {
  return { ...style, ["--cols" as string]: cols };
}

export function TableHead({ cols, children, className }: ColProps & { children: ReactNode; className?: string }) {
  return (
    <div className={cn("table-head row-grid hidden md:grid", className)} style={colStyle(cols)}>
      {children}
    </div>
  );
}

export function TableRow({
  cols,
  mark = "transparent",
  tint,
  href,
  children,
  className,
}: ColProps & {
  /** The 4px spine colour — a CSS colour or var(). */
  mark?: string;
  /** Optional row tint for exceptional rows (failed, blocked, quarantined). */
  tint?: string;
  /** Rows that open a record are real links, not click handlers on a div:
   * middle-click, keyboard focus and "copy link address" all matter on a
   * register someone is working through. */
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  const classes = cn(
    "row-grid items-center gap-x-3 gap-y-1.5 border-b border-l-4 border-hairline px-4 py-3 transition-colors last:border-b-0 hover:bg-raised",
    className,
  );
  const style = colStyle(cols, { borderLeftColor: mark, background: tint });

  if (href) {
    return (
      <Link href={href} className={classes} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}

/** Footnote strip under a table — the register's marginalia. */
export function TableNote({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 py-2.5 font-mono text-[9.5px] text-secondary", className)}>{children}</div>;
}

/** A cell that needs its column name spoken on mobile, where the ink
 * masthead is gone. */
export function Cell({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && <span className="label-mono mr-2 md:hidden">{label}</span>}
      {children}
    </div>
  );
}
