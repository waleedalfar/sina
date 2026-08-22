"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useMe } from "@/lib/hooks/useMe";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { data: me } = useMe();

  return (
    <div className="max-w-lg space-y-5">
      <h1 className="text-lg font-semibold text-primary">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-secondary">Aperture is dark-first by design — light mode is fully supported.</p>
          <div className="flex gap-1 rounded-lg border border-hairline bg-raised p-1">
            <Button variant={theme === "dark" ? "primary" : "ghost"} size="sm" onClick={() => setTheme("dark")}>
              <Moon className="h-3.5 w-3.5" /> Dark
            </Button>
            <Button variant={theme === "light" ? "primary" : "ghost"} size="sm" onClick={() => setTheme("light")}>
              <Sun className="h-3.5 w-3.5" /> Light
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Identity" value={me?.display_name ?? me?.email ?? "—"} />
          <Row label="Tenant" value={me?.tenant_id ?? "—"} mono />
          <Row label="Roles" value={me?.roles.map((r) => r.name).join(", ") || "None"} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-tertiary">{label}</span>
      <span className={`text-xs text-primary ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
