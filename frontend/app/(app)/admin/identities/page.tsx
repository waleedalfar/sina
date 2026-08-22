import { Users } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function IdentitiesPage() {
  return (
    <ComingSoon
      icon={Users}
      title="Identities & roles"
      phase="Phase 7"
      description="Identity list and role grant/revoke, with the separation-of-duties conflict matrix surfaced proactively before a conflicting grant is even attempted."
    />
  );
}
