import { FlaskConical } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function EvaluationsPage() {
  return (
    <ComingSoon
      icon={FlaskConical}
      title="Evaluation runs"
      phase="Phase 5"
      description="Per-category pass/fail breakdowns, trigger-run action, and the human-review case queue for evaluation runs against Model Versions."
    />
  );
}
