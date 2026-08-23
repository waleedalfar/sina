"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FlaskConical } from "lucide-react";
import { useDashboardEvaluations } from "@/lib/hooks/useDashboard";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { runStatusTone, RUN_STATUS_LABEL } from "@/lib/status";

export default function EvaluationsPage() {
  const { data, isLoading } = useDashboardEvaluations();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-primary">Evaluations</h1>
        <p className="text-sm text-secondary mt-0.5">Every evaluation run across every Model Version.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs font-medium uppercase tracking-wide text-tertiary">
                <th scope="col" className="px-5 py-3">Model</th>
                <th scope="col" className="px-5 py-3">Version</th>
                <th scope="col" className="px-5 py-3">Status</th>
                <th scope="col" className="px-5 py-3">Triggered</th>
                <th scope="col" className="px-5 py-3">Categories</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-hairline last:border-0">
                    <td className="px-5 py-4" colSpan={5}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}
              {!isLoading && data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <FlaskConical className="h-6 w-6 text-tertiary" strokeWidth={1.5} />
                      <p className="text-sm text-tertiary">No evaluation runs yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {data?.map((row, i) => (
                <motion.tr
                  key={row.run_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                  className="border-b border-hairline last:border-0 hover:bg-raised transition-colors"
                >
                  <td className="px-5 py-3.5 font-medium text-primary">
                    <Link href={`/evaluations/${row.run_id}`} className="hover:underline">
                      {row.model_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-secondary">{row.model_version_label}</td>
                  <td className="px-5 py-3.5">
                    <StatusPill tone={runStatusTone(row.status)} label={RUN_STATUS_LABEL[row.status]} live={row.status === "running"} />
                  </td>
                  <td className="px-5 py-3.5 text-xs text-secondary">{new Date(row.triggered_at).toLocaleString()}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1.5">
                      {Object.entries(row.category_summary).map(([cat, passed]) => (
                        <span key={cat} className="inline-flex items-center gap-1 text-xs text-secondary">
                          <span className={`h-2 w-2 rounded-full ${passed ? "bg-success" : "bg-danger"}`} />
                          {cat.replace("_", " ")}
                        </span>
                      ))}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
