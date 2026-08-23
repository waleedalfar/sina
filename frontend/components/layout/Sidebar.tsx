"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Boxes,
  ClipboardCheck,
  FlaskConical,
  ScrollText,
  ShieldAlert,
  Users,
  Settings,
  Aperture,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { Role } from "@/types/api";
import { hasRoleKind } from "@/lib/auth/roles";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  visible?: (roles: Role[]) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/models", label: "Models", icon: Boxes },
  { href: "/applications", label: "Applications", icon: ClipboardCheck },
  { href: "/evaluations", label: "Evaluations", icon: FlaskConical },
  // Sits with the build-and-operate group rather than the oversight group
  // below: it's where you exercise an Application, not where you review one.
  { href: "/playground", label: "Playground", icon: Terminal },
  {
    href: "/audit",
    label: "Audit",
    icon: ScrollText,
    visible: (roles) => hasRoleKind(roles, "admin") || hasRoleKind(roles, "signoff") || hasRoleKind(roles, "readonly"),
  },
  {
    href: "/security",
    label: "Security",
    icon: ShieldAlert,
    visible: (roles) => hasRoleKind(roles, "admin") || hasRoleKind(roles, "signoff") || hasRoleKind(roles, "readonly"),
  },
  {
    href: "/admin/identities",
    label: "Identities",
    icon: Users,
    visible: (roles) => hasRoleKind(roles, "admin"),
  },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * The nav itself, shared verbatim by the desktop rail and the mobile
 * drawer. Kept as one component on purpose — two copies of the nav list
 * would drift, and the role-visibility rules above are exactly the kind of
 * thing that must not differ between viewports.
 *
 * `layoutId` on the active-item highlight is suffixed per surface: the
 * desktop rail and the drawer can both be mounted at once (the drawer is
 * only hidden by CSS at `md`), and two elements sharing a `layoutId` make
 * Framer animate the highlight between them across the screen.
 */
function SidebarNav({
  roles,
  surface,
  onNavigate,
}: {
  roles: Role[];
  surface: "rail" | "drawer";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 px-3">
      {NAV_ITEMS.filter((item) => !item.visible || item.visible(roles)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "text-primary" : "text-secondary hover:text-primary hover:bg-raised",
            )}
          >
            {active && (
              <motion.span
                layoutId={`active-nav-${surface}`}
                className="absolute inset-0 rounded-lg bg-raised"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            {active && (
              <motion.span
                layoutId={`active-nav-bar-${surface}`}
                className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[linear-gradient(180deg,#22d3ee_0%,#8b5cf6_100%)]"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <item.icon className="relative h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="relative">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBrand() {
  return (
    <div className="flex items-center gap-2 px-5 py-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#22d3ee_0%,#8b5cf6_100%)]">
        <Aperture className="h-4.5 w-4.5 text-inverted" strokeWidth={2.5} />
      </div>
      <div>
        <p className="text-sm font-semibold text-primary leading-none">Aperture</p>
        <p className="text-[11px] text-tertiary leading-none mt-0.5">AI Governance Console</p>
      </div>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="px-5 py-4 text-[11px] text-tertiary border-t border-hairline">
      MVP 0.1 · single tenant
    </div>
  );
}

/** The permanent desktop rail. Hidden below `md`, where the drawer takes
 * over — at 390px this rail alone would occupy 61% of the viewport. */
export function Sidebar({ roles }: { roles: Role[] }) {
  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-hairline bg-surface md:flex">
      <SidebarBrand />
      <SidebarNav roles={roles} surface="rail" />
      <SidebarFooter />
    </aside>
  );
}

export { SidebarNav, SidebarBrand, SidebarFooter };
