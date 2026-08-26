"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { Role } from "@/types/api";
import { hasRoleKind } from "@/lib/auth/roles";

interface NavItem {
  href: string;
  label: string;
  /** Fixed slot number. Deliberately not derived from position: a nav item
   * hidden by role must not renumber the ones below it, or two people
   * comparing screens would be reading different registers. */
  num: string;
  visible?: (roles: Role[]) => boolean;
}

/*
  The nav is split into two racks rather than one list. Rack A is what you
  do; Rack B is what watches what you did. The separation is the product's
  whole premise — the people who build are not the people who sign off —
  and putting Audit in the same undifferentiated list as Models would say
  the opposite.
*/
const RACK_A: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", num: "01" },
  { href: "/models", label: "Models", num: "02" },
  { href: "/applications", label: "Applications", num: "03" },
  { href: "/evaluations", label: "Evaluations", num: "04" },
  // Sits with the build-and-operate rack rather than the oversight one:
  // it's where you exercise an Application, not where you review one.
  { href: "/playground", label: "Playground", num: "05" },
];

const RACK_B: NavItem[] = [
  {
    href: "/audit",
    label: "Audit",
    num: "06",
    visible: (roles) => hasRoleKind(roles, "admin") || hasRoleKind(roles, "signoff") || hasRoleKind(roles, "readonly"),
  },
  {
    href: "/security",
    label: "Security",
    num: "07",
    visible: (roles) => hasRoleKind(roles, "admin") || hasRoleKind(roles, "signoff") || hasRoleKind(roles, "readonly"),
  },
  {
    href: "/admin/identities",
    label: "Identities",
    num: "08",
    visible: (roles) => hasRoleKind(roles, "admin"),
  },
  { href: "/settings", label: "Settings", num: "09" },
];

const RACKS: { name: string; items: NavItem[] }[] = [
  { name: "Rack A — Operations", items: RACK_A },
  { name: "Rack B — Assurance", items: RACK_B },
];

function NavRow({
  item,
  active,
  onNavigate,
  compact,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  compact: boolean;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "grid grid-cols-[18px_1fr_auto] items-center gap-2.5 border-l-[3px] px-2.5 font-mono uppercase tracking-[0.12em] transition-colors",
        compact ? "py-2.5 text-[11px]" : "min-h-12 text-[12px]",
        active
          ? "border-l-accent bg-surface text-primary"
          : "border-l-transparent text-secondary hover:bg-surface hover:text-primary",
      )}
    >
      {/* Filled when you are here, hollow when you are not: the rack's own
          "this slot is occupied" tell, matching the lifecycle tubes. */}
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 rounded-full border border-strong", active && "border-accent bg-accent")}
      />
      <span>{item.label}</span>
      <span className="text-[9px] text-tertiary">{item.num}</span>
    </Link>
  );
}

/**
 * The nav itself, shared verbatim by the desktop rail and the mobile
 * drawer. Kept as one component on purpose — two copies of the nav list
 * would drift, and the role-visibility rules above are exactly the kind of
 * thing that must not differ between viewports.
 */
function SidebarNav({
  roles,
  onNavigate,
  compact = true,
}: {
  roles: Role[];
  surface?: "rail" | "drawer";
  onNavigate?: () => void;
  /** The drawer gives every row a 48px touch target; the rail is denser. */
  compact?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="flex-1 overflow-y-auto pb-2">
      {RACKS.map((rack) => {
        const items = rack.items.filter((item) => !item.visible || item.visible(roles));
        if (items.length === 0) return null;
        return (
          <div key={rack.name}>
            <div className="label-mono px-3 pt-4 pb-2">{rack.name}</div>
            <nav aria-label={rack.name} className="flex flex-col gap-0.5 px-2.5">
              {items.map((item) => (
                <NavRow
                  key={item.href}
                  item={item}
                  active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                  onNavigate={onNavigate}
                  compact={compact}
                />
              ))}
            </nav>
          </div>
        );
      })}
    </div>
  );
}

/** The wordmark. The teal dot is the only circle in the brand and the only
 * place the accent appears at rest — it reads as a live indicator lamp. */
export function Wordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const text = size === "lg" ? "text-[30px]" : size === "sm" ? "text-[19px]" : "text-[26px]";
  const dot = size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2";
  return (
    <span className="flex items-baseline gap-2">
      <span className={cn("font-semibold tracking-[-0.02em]", text)}>Sina</span>
      <span
        aria-hidden="true"
        className={cn("rounded-full bg-accent shadow-[0_0_0_3px_var(--color-accent-bg)]", dot)}
      />
    </span>
  );
}

function SidebarBrand() {
  return (
    <div className="border-b border-hairline px-5 pt-5 pb-4">
      <Wordmark />
      <p className="mt-1.5 font-mono text-[9.5px] tracking-[0.18em] text-warning uppercase">AI Governance Console</p>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="mt-auto border-t border-hairline px-4 py-3.5 font-mono text-[9.5px] leading-relaxed text-secondary">
      <div>TENANT&nbsp;&nbsp;SINGLE</div>
      <div>BUILD&nbsp;&nbsp;&nbsp;MVP 0.1</div>
    </div>
  );
}

/** The permanent desktop rail. Hidden below `md`, where the drawer takes
 * over — at 390px this rail alone would occupy 61% of the viewport. */
export function Sidebar({ roles }: { roles: Role[] }) {
  return (
    <aside className="hidden h-full w-62 shrink-0 flex-col border-r border-hairline bg-raised md:flex">
      <SidebarBrand />
      <SidebarNav roles={roles} />
      <SidebarFooter />
    </aside>
  );
}

export { SidebarNav, SidebarBrand, SidebarFooter };
