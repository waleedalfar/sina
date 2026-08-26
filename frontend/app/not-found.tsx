import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * Themed 404 for any URL that matches no route. Deliberately standalone
 * rather than shell-wrapped: an unmatched URL isn't necessarily inside the
 * authenticated area, and rendering a sidebar full of links to a visitor
 * who may not be signed in would be misleading.
 *
 * Next's default 404 follows the OS colour scheme and can't see this app's
 * `data-theme` attribute, which is exactly why it's replaced here rather
 * than left alone.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-base px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center border border-dashed border-strong text-secondary">
        <Compass className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div>
        <p className="font-mono text-[10px] tracking-[0.2em] text-secondary uppercase">404</p>
        <h1 className="mt-1 text-lg font-semibold text-primary">There&apos;s nothing at this address</h1>
        <p className="mt-2 max-w-sm text-sm text-secondary">
          The page you asked for doesn&apos;t exist. If you followed a link from inside Sina, the thing it
          pointed at may since have been removed.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="mt-1 border border-strong px-4 py-2.5 font-mono text-[10px] tracking-[0.16em] text-secondary uppercase transition-colors hover:text-primary"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
