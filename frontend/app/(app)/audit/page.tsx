import { ScrollText } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function AuditPage() {
  return (
    <ComingSoon
      icon={ScrollText}
      title="Audit log"
      phase="Phase 6"
      description="A filterable, tamper-evident audit event log with single-event detail and a real, runnable hash-chain integrity check."
    />
  );
}
