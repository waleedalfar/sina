"use client";

import { useTheme } from "next-themes";
import { useAuth } from "react-oidc-context";
import { Moon, Sun, LogOut } from "lucide-react";
import type { Me } from "@/types/api";
import { Button } from "@/components/ui/Button";

export function Topbar({ me }: { me: Me | undefined }) {
  const { theme, setTheme } = useTheme();
  const auth = useAuth();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline bg-surface px-6">
      <div className="text-sm text-tertiary font-mono">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {me && (
          <div className="flex items-center gap-2.5 rounded-lg border border-hairline bg-raised px-3 py-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[linear-gradient(135deg,#22d3ee_0%,#8b5cf6_100%)] text-[11px] font-semibold text-inverted">
              {(me.display_name ?? me.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="leading-tight">
              <p className="text-xs font-medium text-primary">{me.display_name ?? me.email}</p>
              <p className="text-[10px] text-tertiary">{me.roles.map((r) => r.name).join(", ") || "No roles"}</p>
            </div>
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={() => auth.signoutRedirect()} aria-label="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
