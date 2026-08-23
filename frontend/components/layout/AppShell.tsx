"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { Topbar } from "./Topbar";
import { useMe } from "@/lib/hooks/useMe";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [navOpenedAt, setNavOpenedAt] = useState(pathname);

  // Belt and braces alongside the drawer's own onNavigate: the route can
  // also change from the back button, and a drawer left open over the new
  // page would hide it. Adjusted during render rather than in an effect —
  // React re-renders before committing, so the drawer never paints in the
  // wrong state, and an effect here would be a second render pass for no
  // reason (and trips react-hooks/set-state-in-effect).
  if (navOpen && navOpenedAt !== pathname) {
    setNavOpen(false);
  }
  if (navOpenedAt !== pathname) {
    setNavOpenedAt(pathname);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar roles={me?.roles ?? []} />
      <MobileNavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        roles={me?.roles ?? []}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar me={me} onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="mx-auto max-w-7xl px-4 py-6 sm:px-6"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
