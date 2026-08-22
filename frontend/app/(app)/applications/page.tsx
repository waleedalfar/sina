"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ClipboardCheck, Plus } from "lucide-react";
import { useDashboardApplications } from "@/lib/hooks/useDashboard";
import { useMe } from "@/lib/hooks/useMe";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { lifecycleTone, LIFECYCLE_LABEL, riskTone } from "@/lib/status";
import { hasAnyRole, CREATE_APPLICATION_ROLES } from "@/lib/auth/roles";

export default function ApplicationsPage() {
  const { data, isLoading } = useDashboardApplications();
  const { data: me } = useMe();
  const canCreate = me && hasAnyRole(me.roles, CREATE_APPLICATION_ROLES);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-primary">Applications</h1>
          <p className="text-sm text-secondary mt-0.5">Every AI Application registered on the platform and where it stands in governance.</p>
        </div>
        {canCreate && (
          <Link href="/applications/new">
            <Button variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5" /> New Application
            </Button>
          </Link>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {!isLoading && data?.length === 0 && (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <ClipboardCheck className="h-6 w-6 text-tertiary" strokeWidth={1.5} />
          <p className="text-sm text-tertiary">No Applications registered yet.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((app, i) => (
          <motion.div key={app.application_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.03 }}>
            <Link href={`/applications/${app.application_id}`}>
              <Card className="h-full p-5 transition-colors hover:border-strong">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-primary">{app.name}</h3>
                  <StatusPill tone={riskTone(app.risk_classification)} label={app.risk_classification ?? "Unclassified"} />
                </div>
                <p className="mt-1 text-xs text-tertiary">
                  {app.model_name} · {app.model_version_label}
                </p>
                <p className="mt-1 text-xs text-secondary">Owner: {app.owner ?? "Unknown"}</p>

                <div className="mt-4 flex items-center justify-between">
                  <StatusPill tone={lifecycleTone(app.lifecycle_state)} label={LIFECYCLE_LABEL[app.lifecycle_state]} live={app.lifecycle_state === "governance_review"} />
                  {app.lifecycle_state === "governance_review" && (
                    <span className="text-xs font-mono text-secondary">
                      {app.approvals_complete}/{app.approvals_required}
                    </span>
                  )}
                </div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
