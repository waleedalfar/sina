"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "react-oidc-context";
import { LogOut, Menu } from "lucide-react";
import type { Me } from "@/types/api";
import { cn } from "@/lib/cn";

/** Two-position segmented control — the only kind of toggle in this
 * system. Both states stay legible at all times; there is no switch whose
 * meaning depends on remembering which way is on. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex border border-strong">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "font-mono tracking-[0.16em] uppercase transition-colors",
              size === "sm" ? "px-3 py-1.5 text-[9.5px]" : "px-4 py-2.5 text-[10px]",
              active ? "bg-rule text-surface" : "text-secondary hover:text-primary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The server has no idea what day it is where the reader is, so the date
 * is a client-only value: `useSyncExternalStore` renders nothing on the
 * server and the real date on the client, without the hydration mismatch a
 * plain `new Date()` in render would cause. */
const subscribeNever = () => () => {};
const todayLabel = () =>
  new Date()
    .toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();

function StatusStrip({ me }: { me: Me | undefined }) {
  const today = useSyncExternalStore(subscribeNever, todayLabel, () => null);

  return (
    <div className="flex items-center gap-3.5 font-mono text-[11px] tracking-[0.1em] text-secondary uppercase">
      <span className="hidden sm:inline">{today ?? " "}</span>
      <span aria-hidden="true" className="hidden h-3.5 w-px bg-strong sm:inline-block" />
      {/* Says only what is actually known: the control plane answered, or
          it hasn't yet. Not a synthetic health light. */}
      <span className={cn("inline-flex items-center gap-1.5", me ? "text-success" : "text-warning")}>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
        {me ? "Session active" : "Connecting"}
      </span>
    </div>
  );
}

export function Topbar({ me, onOpenNav }: { me: Me | undefined; onOpenNav: () => void }) {
  const { theme, setTheme } = useTheme();
  const auth = useAuth();
  const initials = (me?.display_name ?? me?.email ?? "?")
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <header className="flex h-15 shrink-0 items-center justify-between gap-4 border-b border-hairline bg-surface px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="-ml-1 flex h-11 w-11 items-center justify-center border border-transparent text-secondary transition-colors hover:border-hairline hover:text-primary md:hidden"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
        <StatusStrip me={me} />
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:block">
          <Segmented
            size="sm"
            label="Theme"
            value={theme === "dark" ? "dark" : "light"}
            onChange={(next) => setTheme(next)}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>

        {me && (
          <div className="flex items-center gap-2.5 border border-hairline bg-raised py-1.5 pr-3 pl-2">
            <span className="grid h-6.5 w-6.5 shrink-0 place-items-center bg-accent font-mono text-[10px] text-inverted">
              {initials || "?"}
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-xs font-medium text-primary">{me.display_name ?? me.email}</span>
              <span className="block font-mono text-[9px] tracking-[0.1em] text-warning uppercase">
                {me.roles.map((r) => r.name).join(" · ") || "No roles"}
              </span>
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => auth.signoutRedirect()}
          aria-label="Sign out"
          className="grid h-8.5 w-8.5 shrink-0 place-items-center border border-hairline text-secondary transition-colors hover:border-strong hover:text-primary"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
