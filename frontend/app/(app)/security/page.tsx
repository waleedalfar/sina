import { ShieldAlert } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function SecurityPage() {
  return (
    <ComingSoon
      icon={ShieldAlert}
      title="Security dashboard"
      phase="Phase 6"
      description="The five-column §26 security view: Policy Violations, PHI Events, Failed Authentication, Suspicious Prompts, Security Findings."
    />
  );
}
