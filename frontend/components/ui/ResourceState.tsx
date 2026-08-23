"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, FileQuestion, TriangleAlert } from "lucide-react";
import { Card } from "./Card";
import { Button } from "./Button";
import { ApiError } from "@/lib/api/client";

/**
 * What a detail page shows when the thing it was asked to display isn't
 * there or wouldn't load.
 *
 * Every detail page previously did `if (isLoading || !data) return
 * <Skeleton/>` — which is correct while loading and wrong forever after a
 * failed fetch: a mistyped or deleted id left a skeleton pulsing
 * indefinitely with no way to tell "still loading" from "this doesn't
 * exist". A 404 and a real failure are shown differently on purpose; only
 * the second is worth retrying.
 */
export function ResourceState({
  error,
  resource,
  backHref,
  backLabel,
  onRetry,
}: {
  error: unknown;
  resource: string;
  backHref: string;
  backLabel: string;
  onRetry?: () => void;
}) {
  const notFound = error instanceof ApiError && error.status === 404;
  const denied = error instanceof ApiError && error.status === 403;

  let icon: LucideIcon = TriangleAlert;
  let title = `Couldn't load this ${resource}`;
  let description =
    error instanceof ApiError
      ? error.detail
      : "Something went wrong reaching the platform API. It may be a temporary problem.";

  if (notFound) {
    icon = FileQuestion;
    title = `This ${resource} doesn't exist`;
    description = `No ${resource} matches that id. It may have been removed, or the link may be wrong.`;
  } else if (denied) {
    title = `You can't view this ${resource}`;
    description = error instanceof ApiError ? error.detail : "";
  }

  const Icon = icon;

  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-raised text-tertiary">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h2 className="text-base font-semibold text-primary">{title}</h2>
      <p className="max-w-md text-sm text-secondary">{description}</p>
      <div className="mt-1 flex items-center gap-2">
        <Link href={backHref}>
          <Button variant="secondary" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
          </Button>
        </Link>
        {/* Retrying a 404 or a 403 just asks the same question again and
            gets the same answer — offered only for failures that could
            plausibly be transient. */}
        {onRetry && !notFound && !denied && (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </Card>
  );
}
