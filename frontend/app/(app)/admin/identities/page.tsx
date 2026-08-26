"use client";

import { useState } from "react";
import { ChevronDown, History, Users, X } from "lucide-react";
import { useIdentities, useRoles, useIdentityRoleMutations, useIdentityRoleHistory } from "@/lib/hooks/useIdentity";
import { useMe } from "@/lib/hooks/useMe";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, RestrictedState } from "@/components/ui/ResourceState";
import { hasAnyRole, IDENTITY_ADMIN_ROLES, findConflictingKind } from "@/lib/auth/roles";
import { ApiError } from "@/lib/api/client";
import type { Identity, Role } from "@/types/api";

export default function IdentitiesPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data: identities, isLoading } = useIdentities();
  const { data: roles } = useRoles();

  if (meLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!me || !hasAnyRole(me.roles, IDENTITY_ADMIN_ROLES)) {
    return <RestrictedState what="Identity and role administration requires the Platform Administrator role." />;
  }

  return (
    <>
      <PageHeader
        title="Identities & Roles"
        description="Roles arrive from hospital SSO; grants here are additive and audited. Conflicting roles are refused before they are attempted."
      />

      {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}

      {!isLoading && identities?.length === 0 && (
        <EmptyState icon={Users} title="No identities found" description="Identities appear here once they first sign in through hospital SSO." />
      )}

      {identities?.map((identity) => (
        <IdentityCard key={identity.id} identity={identity} allRoles={roles ?? []} />
      ))}
    </>
  );
}

function initialsOf(identity: Identity) {
  const source = identity.display_name ?? identity.email ?? identity.service_client_id ?? "?";
  return source
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function IdentityCard({ identity, allRoles }: { identity: Identity; allRoles: Role[] }) {
  const { grant, revoke } = useIdentityRoleMutations(identity.id);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: history, isLoading: historyLoading } = useIdentityRoleHistory(identity.id, historyOpen);

  const heldRoleIds = new Set(identity.roles.map((r) => r.id));
  const heldKinds = identity.roles.map((r) => r.kind);
  const grantable = allRoles.filter((r) => !heldRoleIds.has(r.id));

  const mutationError = [grant.error, revoke.error].find((e): e is Error => e instanceof Error);
  const errorMessage = mutationError instanceof ApiError ? mutationError.detail : mutationError?.message;

  return (
    <section className="border border-hairline bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-hairline bg-raised px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8.5 w-8.5 shrink-0 place-items-center bg-accent font-mono text-[11px] text-inverted">
            {initialsOf(identity) || "?"}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">
              {identity.display_name ?? identity.email ?? identity.service_client_id ?? identity.id}
            </div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-secondary">
              {identity.email ?? identity.service_client_id ?? identity.id} · {identity.type}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={identity.active ? "success" : "neutral"} label={identity.active ? "Active" : "Inactive"} />
          {identity.roles.map((role) => (
            <span
              key={role.id}
              className="inline-flex items-center gap-2 border border-success border-l-4 bg-success-bg px-2.5 py-1 font-mono text-[9.5px] tracking-[0.12em] text-success-ink uppercase"
            >
              {role.name}
              <button
                type="button"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(role.id)}
                aria-label={`Revoke ${role.name}`}
                className="text-danger transition-opacity hover:opacity-70 disabled:opacity-40"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {errorMessage && (
        <p className="border-b border-danger bg-danger-bg px-4 py-2.5 text-[12.5px] text-danger">{errorMessage}</p>
      )}

      <div className="grid grid-cols-1 gap-4.5 p-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <div className="label-mono">Grantable roles</div>
          {grantable.length === 0 && (
            <p className="font-mono text-[10px] text-secondary">Every role is already held.</p>
          )}
          {/*
            The separation-of-duties matrix is mirrored client-side so a
            conflicting grant is refused, explained and visibly disabled
            before it is ever attempted. The backend enforces the same rule
            — this is not the check, it is the check made legible.
          */}
          {grantable.map((role) => {
            const conflict = findConflictingKind(role.kind, heldKinds);
            return (
              <div
                key={role.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border px-3 py-2.5 ${
                  conflict ? "border-danger bg-danger-bg" : "border-strong"
                }`}
              >
                <div className="min-w-0">
                  <div
                    className={`font-mono text-[10.5px] tracking-[0.1em] uppercase ${
                      conflict ? "text-danger" : "text-primary"
                    }`}
                  >
                    {role.name}
                  </div>
                  <div className={`mt-1 text-[12px] leading-snug ${conflict ? "text-danger" : "text-secondary"}`}>
                    {conflict ? `Conflicts with a held ${conflict} role — separation of duties.` : `${role.kind} role`}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!!conflict || grant.isPending}
                  onClick={() => grant.mutate(role.id)}
                  className={`border px-3 py-1.5 font-mono text-[9px] tracking-[0.14em] whitespace-nowrap uppercase transition-colors ${
                    conflict
                      ? "cursor-not-allowed border-danger text-danger"
                      : "border-accent text-accent hover:bg-accent-bg disabled:opacity-50"
                  }`}
                >
                  {conflict ? "Blocked · conflict" : "Grant"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Revoked assignments were always kept in the database (a revoke
            sets revoked_at, it never deletes the row) but nothing read
            them back, so "who held what, when" was only recoverable from
            the audit log. Collapsed by default and only fetched when
            opened — this is reference material, not the primary view. */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="label-mono">Role history</div>
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
              className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.14em] text-accent uppercase hover:underline"
            >
              <History className="h-3 w-3" />
              {historyOpen ? "Hide" : "Show"}
              <ChevronDown className={`h-3 w-3 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          {historyOpen && (
            <>
              {historyLoading && <Skeleton className="h-16" />}
              {history && history.length === 0 && (
                <p className="font-mono text-[10px] text-secondary">No role assignments recorded.</p>
              )}
              {history?.map((a) => (
                <div
                  key={a.assignment_id}
                  className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-hairline py-2"
                >
                  <span className="font-mono text-[10px] text-secondary">
                    {new Date(a.granted_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })}
                  </span>
                  <span
                    className={`truncate font-mono text-[10.5px] tracking-[0.08em] uppercase ${
                      a.revoked_at ? "text-secondary line-through" : "text-primary/80"
                    }`}
                  >
                    {a.name}
                  </span>
                  <span
                    className={`font-mono text-[9px] tracking-[0.14em] uppercase ${
                      a.revoked_at ? "text-danger" : "text-success"
                    }`}
                  >
                    {a.revoked_at ? "Revoked" : "Held"}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
