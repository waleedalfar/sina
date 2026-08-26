"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

/*
  A modal is a form you sign, so it is presented like one: a solid header
  bar (ink for neutral work, brick red when the action is destructive), a
  square body, and no rounding. The ESC affordance is written into the
  header rather than left implicit.
*/
export function Modal({
  open,
  onClose,
  title,
  tone = "neutral",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  tone?: "neutral" | "danger";
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-[rgba(16,23,26,0.45)]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            className="relative w-full max-w-lg border border-rule bg-surface shadow-[var(--shadow-modal)]"
          >
            <div
              className={`flex items-center justify-between gap-3 px-4.5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] ${
                tone === "danger" ? "bg-danger text-inverted" : "bg-rule text-surface"
              }`}
            >
              <span>{title}</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="opacity-60 transition-opacity hover:opacity-100"
              >
                ESC
              </button>
            </div>
            <div className="flex flex-col gap-3.5 p-4.5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
