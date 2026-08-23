"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Plus, X, Users, History, ChevronDown } from "lucide-react";
import { useIdentities, useRoles, useIdentityRoleMutations, useIdentityRoleHistory } from "@/lib/hooks/useIdentity";
import { useMe } from "@/lib/hooks/useMe";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { hasAnyRole, IDENTITY_ADMIN_ROLES, findConflictingKind } from "@/lib/auth/roles";
import { ApiError } from "@/lib/api/client";
import type { Identity, Role } from "@/types/api";

export default function IdentitiesPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data: identities, isLoading } = useIdentities();
  const { data: roles } = useRoles();

  if (meLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!me || !hasAnyRole(me.roles, IDENTITY_ADMIN_ROLES)) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-raised text-tertiary">
          <Lock className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h2 className="text-base font-semibold text-primary">Access restricted</h2>
        <p className="max-w-md text-sm text-secondary">Identity and role administration requires the Platform Administrator role.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-primary">Identities</h1>
        <p className="text-sm text-secondary mt-0.5">
          Every identity on the platform, its roles, and the separation-of-duties matrix — a conflicting grant is
          disabled here before the backend would ever reject it.
        </p>
      </div>

      {isLoading &&
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}

      {!isLoading && identities?.length === 0 && (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <Users className="h-6 w-6 text-tertiary" strokeWidth={1.5} />
          <p className="text-sm text-tertiary">No identities found.</p>
        </Card>
      )}

      {identities?.map((identity, i) => (
        <motion.div key={identity.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.03 }}>
          <IdentityCard identity={identity} allRoles={roles ?? []} />
        </motion.div>
      ))}
    </div>
  );
}

function IdentityCard({ identity, allRoles }: { identity: Identity; allRoles: Role[] }) {
  const { grant, revoke } = useIdentityRoleMutations(identity.id);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: history, isLoading: historyLoading } = useIdentityRoleHistory(identity.id, historyOpen);

  const heldRoleIds = new Set(identity.roles.map((r) => r.id));
  const heldKinds = identity.roles.map((r) => r.kind);
  const availableRoles = allRoles.filter((r) => !heldRoleIds.has(r.id));

  const mutationError = [grant.error, revoke.error].find((e): e is Error => e instanceof Error);
  const errorMessage = mutationError instanceof ApiError ? mutationError.detail : mutationError?.message;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{identity.display_name ?? identity.email ?? identity.service_client_id ?? identity.id}</CardTitle>
          <p className="text-xs text-tertiary font-mono mt-0.5">
            {identity.type} · {identity.email ?? identity.service_client_id ?? identity.id}
          </p>
        </div>
        <StatusPill tone={identity.active ? "success" : "neutral"} label={identity.active ? "Active" : "Inactive"} />
      </CardHeader>
      <CardContent className="space-y-3">
        {errorMessage && (
          <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-2.5 text-xs text-danger">{errorMessage}</div>
        )}

        <div className="flex flex-wrap gap-2">
          {identity.roles.length === 0 && <span className="text-xs text-tertiary">No roles granted.</span>}
          {identity.roles.map((role) => (
            <span
              key={role.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-raised px-2.5 py-1 text-xs text-secondary"
            >
              {role.name}
              <button
                type="button"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(role.id)}
                aria-label={`Revoke ${role.name}`}
                className="text-tertiary hover:text-danger transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-hairline pt-3">
          <select
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            className="flex-1 rounded-lg border border-hairline bg-raised px-3 py-1.5 text-xs text-primary outline-none focus:border-cyan"
          >
            <option value="">Grant a role…</option>
            {availableRoles.map((role) => {
              const conflict = findConflictingKind(role.kind, heldKinds);
              return (
                <option key={role.id} value={role.id} disabled={!!conflict}>
                  {role.name}
                  {conflict ? ` — conflicts with held ${conflict} role` : ""}
                </option>
              );
            })}
          </select>
          <Button
            variant="secondary"
            size="sm"
            disabled={!selectedRoleId || grant.isPending}
            onClick={() => grant.mutate(selectedRoleId, { onSuccess: () => setSelectedRoleId("") })}
          >
            <Plus className="h-3.5 w-3.5" /> Grant
          </Button>
        </div>

        {/* Revoked assignments were always kept in the database (a revoke
            sets revoked_at, it never deletes the row) but nothing read
            them back, so "who held what, when" was only recoverable from
            the audit log. Collapsed by default and only fetched when
            opened — this is reference material, not the primary view. */}
        <div className="border-t border-hairline pt-3">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="flex items-center gap-1.5 text-xs text-tertiary transition-colors hover:text-secondary"
          >
            <History className="h-3.5 w-3.5" />
            Role history
            <ChevronDown className={`h-3 w-3 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
          </button>

          {historyOpen && (
            <div className="mt-3">
              {historyLoading && <Skeleton className="h-16" />}
              {history && history.length === 0 && (
                <p className="text-xs text-tertiary">No role assignments recorded.</p>
              )}
              {history && history.length > 0 && (
                <ul className="divide-y divide-[var(--color-border-hairline)]">
                  {history.map((a) => (
                    <li key={a.assignment_id} className="flex items-center justify-between gap-3 py-2">
                      <span className={`text-xs ${a.revoked_at ? "text-tertiary line-through" : "text-primary"}`}>
                        {a.name}
                      </span>
                      <span className="text-[11px] text-tertiary text-right">
                        granted {new Date(a.granted_at).toLocaleString()}
                        {a.revoked_at && ` · revoked ${new Date(a.revoked_at).toLocaleString()}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
