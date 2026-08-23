"use client"; // error boundaries must be Client Components

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Catches uncaught render errors inside the authenticated route group.
 * Because it sits below `(app)/layout.tsx`, this renders *inside* the
 * AppShell — the sidebar, topbar and theme survive, so one broken page
 * doesn't look like the whole console fell over.
 *
 * Next 16 names the recovery prop `retry` (re-fetches and re-renders the
 * boundary's children), not `reset`. See
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // No error-reporting service in MVP 0.1 (no SIEM/observability
    // integration until Phase 2, §43) — the console is the only sink
    // there is, and swallowing this silently would be worse.
    console.error(error);
  }, [error]);

  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger-bg text-danger">
        <TriangleAlert className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h2 className="text-base font-semibold text-primary">This page hit an unexpected error</h2>
      <p className="max-w-md text-sm text-secondary">
        Nothing was changed on the platform — this is a display failure, not a failed action. The rest of the
        console is still usable.
      </p>
      {error.digest && (
        <p className="font-mono text-[11px] text-tertiary">
          Reference: {error.digest}
        </p>
      )}
      <Button variant="secondary" size="sm" className="mt-1" onClick={() => retry()}>
        Try again
      </Button>
    </Card>
  );
}
