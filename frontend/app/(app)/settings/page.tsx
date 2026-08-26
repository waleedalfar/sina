"use client";

import { useTheme } from "next-themes";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataRow } from "@/components/ui/DataList";
import { Segmented } from "@/components/layout/Topbar";
import { useMe } from "@/lib/hooks/useMe";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { data: me } = useMe();

  return (
    <div className="flex max-w-3xl flex-col gap-4.5">
      <PageHeader
        title="Settings"
        description="Identity and roles are set by hospital SSO and cannot be edited here."
      />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <div className="text-sm font-medium">Theme</div>
            <div className="mt-0.5 font-mono text-[10px] text-secondary">Stored per identity, per device</div>
          </div>
          <Segmented
            label="Theme"
            value={theme === "dark" ? "dark" : "light"}
            onChange={(next) => setTheme(next)}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signed-in identity</CardTitle>
          <span className="font-mono text-[9px] tracking-[0.14em] text-warning uppercase">Read-only</span>
        </CardHeader>
        <DataRow label="Identity">{me?.display_name ?? me?.email ?? "—"}</DataRow>
        <DataRow label="Email">{me?.email ?? "—"}</DataRow>
        <DataRow label="Tenant">{me?.tenant_id ?? "—"}</DataRow>
        <DataRow label="Roles">{me?.roles.map((r) => r.name).join(" · ") || "None"}</DataRow>
      </Card>
    </div>
  );
}
