"use client";

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

const BRANCH: LifecycleState[] = ["suspended", "retired"];

/*
  The product's signature UI element — see docs/modules/frontend.md.

  A rack of specimen tubes rather than a row of dots on a line. The
  metaphor is doing real work: a lifecycle state in this system is a
  container that is either sealed (done, and not reopenable), drawing
  (current), empty (not reached), or armed (a transition you personally
  could trigger right now). A dotted progress bar can only say "how far
  along"; this says what may be done next and by whom, which is the actual
  question an Application page has to answer.
*/
type Fill = "sealed" | "current" | "empty" | "armed";

const FILL_STYLE: Record<Fill, { cap: string; tube: string; fill: string; text: string; height: string }> = {
  sealed: {
    cap: "bg-success border-strong",
    tube: "border-strong border-solid bg-surface",
    fill: "bg-success/75",
    text: "text-success",
    height: "100%",
  },
  current: {
    cap: "bg-accent border-accent",
    tube: "border-accent border-solid bg-surface",
    fill: "bg-accent/80",
    text: "text-accent",
    height: "52%",
  },
  empty: {
    cap: "bg-strong border-strong",
    tube: "border-strong border-dashed hatch",
    fill: "",
    text: "text-secondary",
    height: "0%",
  },
  armed: {
    cap: "bg-danger border-danger",
    tube: "border-danger border-dashed bg-danger-bg",
    fill: "",
    text: "text-danger",
    height: "0%",
  },
};

function Tube({
  state,
  fill,
  note,
  position,
  total,
}: {
  state: LifecycleState;
  fill: Fill;
  note: string;
  position: number;
  total: number;
}) {
  const style = FILL_STYLE[fill];
  const spoken =
    fill === "sealed" ? "completed" : fill === "current" ? "current state" : fill === "armed" ? "available to you" : "not reached";

  return (
    <li
      aria-current={fill === "current" ? "step" : undefined}
      className="flex min-w-[84px] flex-1 flex-col items-center gap-2"
    >
      {/* The cap. Sealed caps are solid; an empty slot's cap is grey. */}
      <div
        aria-hidden="true"
        className={cn("h-2.5 w-full border border-b-0", style.cap, fill === "current" && "shadow-[0_0_0_3px_var(--color-accent-bg)]")}
      />
      <div
        aria-hidden="true"
        className={cn(
          "relative h-[118px] w-full overflow-hidden rounded-b-lg border",
          style.tube,
          // The drawing tube is ringed rather than merely coloured: on a
          // rack of nine, the one that is live has to be findable in
          // peripheral vision.
          fill === "current" && "shadow-[0_0_0_3px_var(--color-accent-bg)]",
        )}
      >
        {style.fill && <div className={cn("absolute inset-x-0 bottom-0", style.fill)} style={{ height: style.height }} />}
        {/* The meniscus — the surface of the liquid, pulsing while it
            draws. The one piece of ambient motion in the product. */}
        {fill === "current" && (
          <div className="absolute inset-x-0 h-[3px] animate-pulse-live bg-accent" style={{ bottom: style.height }} />
        )}
        {/* Graduation marks, as on a real tube — they are what stop the
            fill from reading as a plain progress bar. */}
        <div
          className="absolute inset-0"
          style={{
            background: "repeating-linear-gradient(180deg, rgba(255,255,255,.24) 0 1px, transparent 1px 14px)",
          }}
        />
      </div>
      <div
        className={cn(
          "flex min-h-[26px] items-start justify-center text-center font-mono text-[10px] leading-[1.3] tracking-[0.1em] uppercase",
          style.text,
        )}
      >
        {LIFECYCLE_LABEL[state]}
        <span className="sr-only">{` — step ${position} of ${total}, ${spoken}`}</span>
      </div>
      <div className={cn("font-mono text-[9px] tracking-[0.08em] uppercase", style.text)}>{note}</div>
    </li>
  );
}

export function LifecycleStepper({
  state,
  available = [],
}: {
  state: LifecycleState;
  /** States this identity could transition to right now. Rendered armed —
   * dashed and brick red — so "what can I do" is answered by the rack
   * itself rather than only by the button row above it. */
  available?: LifecycleState[];
}) {
  const currentIndex = MAIN_PATH.indexOf(state);
  const onBranch = state === "suspended" || state === "retired";
  const total = MAIN_PATH.length + BRANCH.length;

  const mainFill = (step: LifecycleState, i: number): Fill => {
    if (step === state) return "current";
    if (available.includes(step)) return "armed";
    // Everything before the current state is sealed. From a branch state
    // the main path is history: suspension came from somewhere, and that
    // somewhere is filed.
    if (onBranch) return i <= MAIN_PATH.indexOf("governance_review") ? "sealed" : "empty";
    return i < currentIndex ? "sealed" : "empty";
  };

  const noteFor = (step: LifecycleState, fill: Fill): string => {
    if (fill === "current") return `Drawing · ${FILL_STYLE.current.height}`;
    if (fill === "sealed") return "Sealed";
    if (fill === "armed") return "▲ Available";
    if (step === "approved" || step === "staging" || step === "production") return "Locked";
    return "Empty";
  };

  return (
    // Scrolls horizontally rather than compressing. The signature component
    // of this console is the lifecycle, and a squashed rack that drops its
    // labels communicates less than one you swipe.
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol aria-label="Application lifecycle" className="flex min-w-max items-start gap-2.5 lg:min-w-0">
        {MAIN_PATH.map((step, i) => (
          <Tube key={step} state={step} fill={mainFill(step, i)} note={noteFor(step, mainFill(step, i))} position={i + 1} total={total} />
        ))}
        {/* The two off-path states are separated by a rule: they are not
            further along the path, they are a way off it. */}
        <li aria-hidden="true" className="mx-1 h-[118px] w-px shrink-0 self-start bg-strong" />
        {BRANCH.map((step, i) => {
          const fill: Fill = step === state ? "current" : available.includes(step) ? "armed" : "empty";
          return (
            <Tube
              key={step}
              state={step}
              fill={fill}
              note={noteFor(step, fill)}
              position={MAIN_PATH.length + i + 1}
              total={total}
            />
          );
        })}
      </ol>
    </div>
  );
}

/** The rack's legend. Kept beside it rather than inside a tooltip: the
 * four fills are the vocabulary of the whole page. */
export function LifecycleLegend() {
  return (
    <div className="flex flex-wrap gap-x-4.5 gap-y-1.5 font-mono text-[9px] tracking-[0.1em] text-secondary uppercase">
      <span>■ Sealed = completed</span>
      <span className="text-accent">■ Drawing = current</span>
      <span>◻ Empty = not reached</span>
      <span className="text-danger">▲ Available to you</span>
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
          <span className="absolute inline-flex h-full w-full animate-pulse-live rounded-full bg-accent" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      )}
      <span className="font-mono text-[10px] tracking-[0.12em] text-secondary uppercase">{LIFECYCLE_LABEL[state]}</span>
    </span>
  );
}

function lifecycleIsInProgress(state: LifecycleState) {
  return state === "evaluation" || state === "governance_review" || state === "production";
}
