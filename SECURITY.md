# Security

This is a governance platform, so its own security posture is part of the
product claim. This document states what is actually enforced, how it was
verified, and what is not protected.

## Reporting a vulnerability

Open a GitHub issue for anything non-sensitive. For something exploitable,
please use GitHub's private vulnerability reporting on this repository
rather than a public issue.

This is a pre-1.0 project with no security SLA. Expect a best-effort
response, not a guaranteed one.

---

## What is enforced

### Authentication

The backend never sees a password. It is an OIDC relying party only:
authentication happens at the identity provider, and the backend validates
the resulting RS256 token with a maintained JWT library, never a
hand-rolled decoder.

Verified by test (`backend/tests/test_authentication.py`), against the real
decode path rather than a stub:

- `alg: none` tokens are refused, the classic JWT bypass. `algorithms=` is
  passed explicitly on every decode so it cannot be negotiated away.
- A token signed by the wrong key is refused.
- Expiry, issuer and audience are each enforced, not merely present.
- An identity deactivated in the platform is refused even while holding an
  otherwise valid, unexpired token.
- Identities are keyed by `(issuer, subject)`, not subject alone, so two
  identity providers issuing the same `sub` cannot collapse into one
  account.

**Just-in-time provisioning is fail-closed.** A valid token from an unknown
person creates an identity with **zero roles**. Authentication grants no
authority; a Platform Administrator has to grant it.

### Authorization and separation of duties

Roles are a code-enforced conflict matrix, not a policy note
(`backend/app/identity/roles.py`). Builder roles cannot be combined with
sign-off roles (prevents self-review), Platform Administrator cannot be
combined with sign-off roles (prevents self-escalation), and Auditor
combines with nothing (preserves independence). A conflicting grant is
refused by the API, and the console mirrors the same matrix to disable and
explain it before it is attempted.

The frontend copy is tested against the backend's truth table over every
ordered pair of role kinds (`frontend/lib/auth/roles.test.ts`), because a
mirror that drifts is worse than no mirror.

**Nothing reaches production without five distinct sign-offs.** Clinical
Safety, Privacy, Security, AI Governance and Compliance each have a named
role. One person cannot sign two categories in the same review cycle, an
application's creator cannot sign their own application even if they hold
the role, and the transition to Approved is *system-triggered* as a side
effect of the final approval. There is no manual path to it. A test
asserts against the transition table itself that no such edge exists, so
adding one fails the build rather than silently becoming policy.

### The inference gateway

Every request passes seven checks, in order, before a single token is
generated: lifecycle state, caller role, the bound model version's
governance approval, whether the model is actually running, rate limit,
request size, and prompt-injection screening.

Each check has a test that breaks exactly one precondition and asserts both
the refusal and that inference never ran
(`backend/tests/test_gateway_checklist.py`).

The model-approval check is deliberate defence in depth: governance's own
state machine already gates it, and the gateway does not trust that it was
enforced upstream.

### Audit

Append-only, with two independent layers:

1. **Privilege revocation.** The application's database role holds no
   `UPDATE` or `DELETE` grant on the audit table. This is enforced by
   migration and asserted by a test that tries both statements and expects
   permission to be denied.
2. **A trigger-computed hash chain.** Each event's hash covers the previous
   one, so any modification breaks the chain. `/audit-events/verify-integrity`
   walks it and reports the first break. Recomputation calls the *same* SQL
   function the insert trigger uses rather than reimplementing it, because
   two implementations of one hash will eventually disagree and report
   false breaks.

This makes tampering **detectable**, not impossible. A sufficiently
privileged database administrator can still alter history. Detectably, but
they can. Making that impossible needs an append-only store outside this
database, which MVP does not have.

### PHI handling

**The gateway records prompt and response *hashes*, never their content.**
The audit trail can prove which model answered which request, and that the
content has not changed, without the audit log itself becoming a store of
patient data.

Evaluation results *do* store full model output, deliberately: those are
synthetic fixtures this project authors, never real traffic.

No real patient data has been used anywhere in development.

### Fail-closed by default

Where the safe answer and the convenient answer differ, the code takes the
safe one, and each has a test:

- A malware scanner that cannot be reached **refuses the import**. "Could
  not scan" is never read as "clean".
- A model artifact whose hash no longer matches what was recorded at import
  **refuses to start**, as does one whose file has been deleted.
- The gateway **never lazily starts a model**. An unstarted model is an
  operational state to fix, not something an inference request should
  quietly trigger.
- A malware-positive artifact is persisted as a durable record of a blocked
  import, but can never be started.

### Supply chain and configuration

- No application dependency has a known vulnerability (`npm audit`: 0;
  `pip-audit`: only `pip` itself, a build-time tool).
- Both containers run as unprivileged users.
- Datastores are not published to the host. Postgres, Redis, Ollama and
  ClamAV are reachable only over the compose network.
- CORS is an explicit origin allowlist with `allow_credentials=false`.
- No secrets are committed. `.env*` is ignored with only an example file
  tracked.

---

## What is NOT protected

A governance tool that overstates its own assurance is worse than one that
admits its edges.

- **The development compose file is not a production deployment.** Keycloak
  runs in dev mode without TLS. There is no HTTPS anywhere in it, no
  secret manager, no backup or restore, and no high availability. The test
  credentials in `infra/` are real, published, and must never exist outside
  a local machine.
- **Prompt-injection detection is a small keyword list**, not a model. It
  is trivially bypassable by rephrasing, and it will produce false
  positives on legitimate clinical language. Blocking on it is a deliberate
  decision to accept that trade, not a claim that the detection is good.
- **Rate limiting covers the inference gateway only.** Other endpoints are
  not rate limited.
- **Single tenant.** Every tenant-owned entity carries a `tenant_id` so this
  can change without a breaking migration, but no tenant isolation is
  enforced today.
- **Tamper evidence is not tamper prevention** at the database-administrator
  level. See Audit above.
- **No formal threat model or third-party penetration test** has been done.
- **The console's accessibility and responsive layout are unverified.** The
  structural work is in place: a skip link, list semantics on the lifecycle
  rack, live regions on result surfaces, a focus-trapped mobile nav. An
  earlier version of the console did pass a 430px responsive check and a
  VoiceOver pass, but the interface was redesigned afterwards and the markup
  changed substantially. Neither pass has been repeated. Treat both as
  outstanding, not as polish.
- **This is not a compliance certification.** It implements technical
  controls that contribute to HIPAA/GDPR/EU-AI-Act-shaped requirements. It
  does not make an organization compliant, and none of it is legal advice.
- **Not clinically validated.** Nothing here has been assessed for clinical
  safety by a qualified body.

## How this was verified

174 backend tests at 90% line coverage, plus 47 frontend tests over the
logic that encodes rules. Both suites run against real infrastructure: a
real Postgres, so the audit triggers and the privilege revocation are the
ones that ship, rather than a substitute that behaves differently.

```bash
docker compose exec backend python -m pytest -q --cov=app   # backend
cd frontend && npm test                                     # frontend
```

Before that, every module was verified live against running infrastructure:
real tokens, real virus scans, real inference, a real approval cycle. Both
matter. The live passes found contract mismatches that tests would not, and
the tests catch the regressions that live passes never re-check.
