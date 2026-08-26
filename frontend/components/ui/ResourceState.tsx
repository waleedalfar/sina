"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Ban, FileQuestion, TriangleAlert } from "lucide-react";
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
 *
 * Presented as a blank specimen card: a dashed glyph box (nothing mounted
 * here), the kind of blankness named in tracked mono, then the plain-language
 * explanation. Refusals and failures carry a brick-red cap; absences carry
 * a steel one, because "not here" is not an error.
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
  let kind = "Request failed";
  let title = `Couldn't load this ${resource}`;
  let description =
    error instanceof ApiError
      ? error.detail
      : "Something went wrong reaching the platform API. It may be a temporary problem.";

  if (notFound) {
    icon = FileQuestion;
    kind = "Not found";
    title = `This ${resource} doesn't exist`;
    description = `No ${resource} matches that id. It may have been removed, or the link may be wrong.`;
  } else if (denied) {
    icon = Ban;
    kind = "Forbidden";
    title = `You can't view this ${resource}`;
    description =
      error instanceof ApiError && error.detail
        ? error.detail
        : "Your roles do not permit this. The attempt itself was recorded in the audit log.";
  }

  const Icon = icon;
  const cap = notFound ? "border-t-warning text-warning" : "border-t-danger text-danger";

  return (
    <div className={`flex flex-col items-center gap-3 border border-t-[3px] border-hairline bg-surface px-5 py-10 text-center ${cap}`}>
      <div className="flex h-12 w-12 items-center justify-center border border-dashed border-current">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em]">{kind}</p>
      <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
      <p className="max-w-[42ch] text-[12.5px] leading-relaxed text-secondary">{description}</p>
      <div className="mt-1 flex items-center gap-2">
        <Link href={backHref}>
          <Button variant="secondary" size="sm">
            <ArrowLeft className="h-3 w-3" /> {backLabel}
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
    </div>
  );
}

/**
 * The same card for an empty list — an absence that is expected rather
 * than a failure, so it is capped steel and offers the action that would
 * fill it.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 border border-t-[3px] border-hairline border-t-warning bg-surface px-5 py-10 text-center text-warning">
      <div className="flex h-12 w-12 items-center justify-center border border-dashed border-current">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Empty</p>
      <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
      <p className="max-w-[42ch] text-[12.5px] leading-relaxed text-secondary">{description}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/**
 * A page-level refusal. Same card, brick cap: being told plainly that your
 * roles do not permit something — and that the attempt was recorded — is
 * more useful than an empty page that looks broken.
 */
export function RestrictedState({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center gap-3 border border-t-[3px] border-hairline border-t-danger bg-surface px-5 py-10 text-center text-danger">
      <div className="flex h-12 w-12 items-center justify-center border border-dashed border-current">
        <Ban className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Forbidden</p>
      <h2 className="text-[15px] font-semibold text-primary">Your roles do not permit this</h2>
      <p className="max-w-[42ch] text-[12.5px] leading-relaxed text-secondary">
        {what} The attempt itself was recorded in the audit log.
      </p>
    </div>
  );
}
