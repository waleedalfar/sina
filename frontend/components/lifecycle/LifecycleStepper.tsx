"use client";

import { motion } from "framer-motion";
import { Check, Ban, Archive } from "lucide-react";
import { cn } from "@/lib/cn";
import { LIFECYCLE_LABEL } from "@/lib/status";
import type { LifecycleState } from "@/types/api";

const MAIN_PATH: LifecycleState[] = [
  "draft",
  "development",
  "evaluation",
  "governance_review",
  "approved",
  "staging",
  "production",
];

/**
 * The product's signature UI element — see docs/modules/frontend.md.
 * The governance lifecycle state machine is the core mechanic this
 * platform governs; this stepper is built with the same care as the
 * state machine itself, not treated as a generic status badge.
 */
export function LifecycleStepper({ state }: { state: LifecycleState }) {
  if (state === "suspended" || state === "retired") {
    return <BranchState state={state} />;
  }

  const currentIndex = MAIN_PATH.indexOf(state);

  return (
    <div className="flex items-center">
      {MAIN_PATH.map((step, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isFuture = i > currentIndex;

        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div className="relative flex h-8 w-8 items-center justify-center">
                {isCurrent && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#22d3ee,#8b5cf6,#22d3ee)]"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  />
                )}
                <div
                  className={cn(
                    "relative flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold",
                    isCurrent && "m-[2px] h-[calc(2rem-4px)] w-[calc(2rem-4px)] border-transparent bg-base text-primary",
                    isDone && "border-success bg-success-bg text-success",
                    isFuture && "border-hairline bg-surface text-tertiary",
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                </div>
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium whitespace-nowrap",
                  isCurrent && "text-primary",
                  isDone && "text-secondary",
                  isFuture && "text-tertiary",
                )}
              >
                {LIFECYCLE_LABEL[step]}
              </span>
            </div>
            {i < MAIN_PATH.length - 1 && (
              <div className={cn("h-0.5 flex-1 mx-1 rounded-full mb-5", isDone ? "bg-success" : "bg-hairline")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BranchState({ state }: { state: "suspended" | "retired" }) {
  const isSuspended = state === "suspended";
  const Icon = isSuspended ? Ban : Archive;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-danger/25 bg-danger-bg px-4 py-3">
      <Icon className="h-5 w-5 text-danger" strokeWidth={2} />
      <div>
        <p className="text-sm font-semibold text-danger">{LIFECYCLE_LABEL[state]}</p>
        <p className="text-xs text-secondary">
          {isSuspended
            ? "Re-entry requires a new Governance Review — never straight back to Production."
            : "Terminal state — no further transitions."}
        </p>
      </div>
    </div>
  );
}

/** Compact variant for table rows and the activity feed. */
export function LifecycleStepperCompact({ state }: { state: LifecycleState }) {
  const isBranch = state === "suspended" || state === "retired";
  const isCurrent = !isBranch && lifecycleIsInProgress(state);
  return (
    <span className="inline-flex items-center gap-1.5">
      {isCurrent && (
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-pulse-live rounded-full bg-[conic-gradient(from_0deg,#22d3ee,#8b5cf6)]" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan" />
        </span>
      )}
      <span className="text-xs font-medium text-secondary">{LIFECYCLE_LABEL[state]}</span>
    </span>
  );
}

function lifecycleIsInProgress(state: LifecycleState) {
  return state === "evaluation" || state === "governance_review" || state === "production";
}
