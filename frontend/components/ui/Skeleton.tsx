import { cn } from "@/lib/cn";

/** A specimen tube filling: opacity pulse on a flat fill, square. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-specimen bg-skeleton", className)} />;
}
