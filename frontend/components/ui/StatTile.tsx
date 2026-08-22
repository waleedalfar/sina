"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";

interface StatTileProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: "gradient" | "neutral";
  hint?: string;
  index?: number;
}

export function StatTile({ label, value, icon: Icon, accent = "neutral", hint, index = 0 }: StatTileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: [0.4, 0, 0.2, 1] }}
    >
      <Card className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-secondary uppercase tracking-wide">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-primary tabular-nums font-mono">{value}</p>
            {hint && <p className="mt-1 text-xs text-tertiary">{hint}</p>}
          </div>
          <div
            className={
              accent === "gradient"
                ? "flex h-9 w-9 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#22d3ee_0%,#8b5cf6_100%)] text-inverted"
                : "flex h-9 w-9 items-center justify-center rounded-lg bg-raised text-secondary"
            }
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
