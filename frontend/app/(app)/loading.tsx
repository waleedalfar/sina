import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Instant fallback while a route segment's code streams in. Every page in
 * this group is a client component that renders its own skeletons as soon
 * as it mounts, so this covers the window *before* that — the first
 * navigation to a segment whose chunk hasn't loaded yet — rather than
 * duplicating per-page loading states.
 */
export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24" />
      <Skeleton className="h-64" />
    </div>
  );
}
