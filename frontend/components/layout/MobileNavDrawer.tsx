"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { Role } from "@/types/api";
import { SidebarNav, SidebarBrand, SidebarFooter } from "./Sidebar";

/**
 * Navigation below `md`, where the 240px desktop rail would take 61% of a
 * 390px viewport.
 *
 * A real modal dialog rather than a CSS-only disclosure, because while it's
 * open it covers the page and everything behind it is inert: it traps
 * focus, closes on Escape, restores focus to whatever opened it, and locks
 * body scroll. A nav you can tab out of into invisible content behind a
 * backdrop is worse than no nav at all for a keyboard or screen-reader
 * user.
 */
export function MobileNavDrawer({
  open,
  onClose,
  roles,
}: {
  open: boolean;
  onClose: () => void;
  roles: Role[];
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the panel itself rather than the first link: announcing the
    // dialog and its label first is more use than dropping straight onto
    // "Dashboard" with no context.
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusTo.current?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            tabIndex={-1}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 40 }}
            className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-hairline bg-surface outline-none"
          >
            <div className="flex items-start justify-between">
              <SidebarBrand />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation"
                className="m-4 rounded-lg p-2 text-secondary transition-colors hover:bg-raised hover:text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Closing on navigate is the expected behaviour for a modal
                nav — leaving it open over the page just navigated to would
                hide the result of the tap. */}
            <SidebarNav roles={roles} surface="drawer" onNavigate={onClose} />
            <SidebarFooter />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
