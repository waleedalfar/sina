"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Boxes, CheckCircle2, XCircle } from "lucide-react";
import { dashboardApi } from "@/lib/api/dashboard";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { riskTone, runtimeTone, RUNTIME_LABEL } from "@/lib/status";

export default function ModelsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-models"],
    queryFn: dashboardApi.models,
    refetchInterval: 10_000,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-primary">Models</h1>
        <p className="text-sm text-secondary mt-0.5">The registry of every Model and Version imported into the platform.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs font-medium uppercase tracking-wide text-tertiary">
                <th className="px-5 py-3">Model</th>
                <th className="px-5 py-3">Version</th>
                <th className="px-5 py-3">Runtime</th>
                <th className="px-5 py-3">Risk</th>
                <th className="px-5 py-3">AI Governance</th>
                <th className="px-5 py-3">Evaluation</th>
                <th className="px-5 py-3">Applications</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-hairline last:border-0">
                    <td className="px-5 py-4" colSpan={7}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}
              {!isLoading && data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Boxes className="h-6 w-6 text-tertiary" strokeWidth={1.5} />
                      <p className="text-sm text-tertiary">No model versions imported yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {data?.map((row, i) => (
                <motion.tr
                  key={row.version_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                  className="border-b border-hairline last:border-0 hover:bg-raised transition-colors"
                >
                  <td className="px-5 py-3.5 font-medium text-primary">{row.model_name}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-secondary">{row.version_label}</td>
                  <td className="px-5 py-3.5">
                    <StatusPill
                      tone={runtimeTone(row.runtime_status)}
                      label={RUNTIME_LABEL[row.runtime_status]}
                      live={row.runtime_status === "running"}
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusPill tone={riskTone(row.risk_classification)} label={row.risk_classification ?? "Unclassified"} />
                  </td>
                  <td className="px-5 py-3.5">
                    {row.ai_governance_decision ? (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        {row.ai_governance_decision === "approved" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-danger" />
                        )}
                        <span className="text-secondary capitalize">{row.ai_governance_decision}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-tertiary">Pending</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {row.evaluation_summary ? (
                      <div className="flex gap-1">
                        {Object.entries(row.evaluation_summary).map(([cat, passed]) => (
                          <span
                            key={cat}
                            title={cat}
                            className={`h-2 w-2 rounded-full ${passed ? "bg-success" : "bg-danger"}`}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-tertiary">No runs</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-secondary">{row.applications.length || "—"}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
