# Architecture

What is actually built, and why it is shaped this way. This describes the
system as it exists — not a roadmap.

## Shape

A Python/FastAPI **modular monolith**, a Next.js console, and self-hosted
infrastructure. One deployable backend, seven modules inside it with
explicit boundaries.

Chosen over microservices deliberately. The module boundaries here are real
— each owns its own tables and exposes a narrow surface to the others — but
a hospital's platform team should not have to operate seven services to run
a governance tool. The boundaries are drawn so that extracting a service
later is a deployment change, not a rewrite.

Everything is **self-hosted with no external SaaS dependency**, because the
target environment frequently cannot call out to one.

```
                    ┌─────────────────────┐
   browser ────────▶│  Next.js console    │
      │             └──────────┬──────────┘
      │  OIDC redirect         │  Bearer token
      ▼                        ▼
┌──────────┐          ┌─────────────────────────────────────┐
│ Keycloak │◀─ JWKS ──│         FastAPI backend             │
└──────────┘          │                                     │
                      │  identity ── audit ── models        │
                      │      │         │        │           │
                      │  governance ── gateway ─ evaluation  │
                      │            \    │    /              │
                      │             dashboard               │
                      └──────┬─────────┬──────────┬─────────┘
                             │         │          │
                        ┌────▼───┐ ┌───▼───┐ ┌────▼────┐
                        │Postgres│ │ Redis │ │ Ollama  │
                        └────────┘ └───────┘ └─────────┘
                                              ┌─────────┐
                                              │ ClamAV  │
                                              └─────────┘
```

The browser authenticates **directly against Keycloak** using
Authorization Code + PKCE. There is no Next.js backend session and no
client secret in the browser — the console is a pure relying party holding
a short-lived token.

## The modules

Built in dependency order; each depends only on those above it.

| Module | Owns |
|---|---|
| `core` | Settings, database session, shared exception types |
| `identity` | OIDC validation, identities, roles, the separation-of-duties matrix |
| `audit` | The append-only, tamper-evident event log |
| `models` | Model registry: import, hash verification, malware scanning, runtime start/stop |
| `governance` | Application lifecycle, risk classification, the approval mechanism |
| `gateway` | OpenAI-compatible inference endpoint and its policy checklist |
| `evaluation` | Test-suite execution against model versions |
| `dashboard` | Read-only aggregation over everything above |

`dashboard` invents no authorization of its own — every endpoint reuses the
access rule its underlying data source already established. There is a test
that holds it to that.

## The ideas worth understanding

### The lifecycle is the product

An Application moves Draft → Development → Evaluation → Governance Review →
Approved → Staging → Production, with Suspended and Retired as branches.

The important part is what is **not** possible. `Governance Review →
Approved` is system-triggered only, as a side effect of recording the final
approval. No manual transition reaches it, and a test asserts that against
the transition table itself — so adding such an edge fails the build rather
than quietly becoming policy. Promotion to Production is
Platform-Administrator-only. Retirement is terminal.

Entering Governance Review requires a completed evaluation run on the bound
model version. You cannot review what nobody has tested.

### Approvals are structural, not procedural

One generic, resource-scoped `GovernanceApproval` table serves both
Applications (five required categories) and Model Versions (one:
`ai_governance`). Distinct signers and no-self-approval are enforced at
write time, not by convention.

Re-entering review starts a **new cycle**: prior-cycle rows are superseded
rather than deleted, so a reviewer who signed before can sign again without
a spurious conflict, while within-cycle rules still hold — and the previous
cycle's decisions remain readable as history.

An Application's five sign-offs are necessary but not sufficient: the bound
Model Version must *also* carry an approved `ai_governance` decision, which
must itself cite a completed evaluation run as evidence. That chain is easy
to miss reading any one module, so it is asserted by test.

### Audit is a chain, not a table

Two independent layers: the application's database role has no `UPDATE` or
`DELETE` grant on the audit table (enforced by migration), and a
trigger-computed hash chain makes any modification detectable. One SQL
function computes the hash, called both by the insert trigger and by the
verification endpoint — deliberately not reimplemented twice, because two
implementations of one hash eventually disagree.

Audit emission is **transactional with the action it records**. A single
commit covers both, so there is no window in which something happened but
was not logged.

### The gateway enforces, it does not advise

Seven checks run in order before inference. The gateway re-checks the bound
model's governance approval even though the lifecycle already gated it —
defence in depth, on the assumption that upstream enforcement might have a
bug.

It records prompt and response **hashes**, never content: enough to prove
what happened, not enough to become a patient-data store.

It never lazily starts a model. An unstarted model is an operational state
for a human to fix.

### Evaluation runs synchronously

No job queue. It reuses the same Ollama client the gateway uses, so there
is one inference code path — but it does **not** route through the
gateway's checklist, which is Application-centric while evaluation runs
against a bare Model Version.

Scoring is substring and marker matching, not semantic. That is a stated
limitation, not an oversight.

## Data model, briefly

Every entity carries a `tenant_id` from day one even though MVP is single
tenant, so multi-tenancy is not a breaking migration later.

`ModelVersion` is immutable — an imported artifact is a record of what was
imported. Mutable operational state lives in a separate
`ModelRuntimeState`. `Model`-level metadata *is* editable, and renames are
audited with the previous value, because a model's name is the label an
auditor sees beside every historical approval recorded against its
versions.

Permitted users are a typed foreign-key table, not free text — the gateway
has to evaluate them at request time.

## Testing

174 backend tests at 90% line coverage, and 47 frontend tests over the
logic that encodes rules rather than renders.

Backend tests run against a **real Postgres**, on a throwaway database that
is dropped, recreated and migrated per session. Not SQLite: the audit
tamper-evidence is a trigger and a privilege revocation that exist only in
the database, so a substitute engine would be testing a different system.

Authentication is stubbed in most suites and driven for real in one, which
signs its own RS256 tokens to prove the decode path rejects what it should.

One measurement note that cost real time: SQLAlchemy's asyncio layer runs
queries inside greenlets, and coverage's default tracer loses the frame
across that switch — every endpoint body after its first `await db.…` reads
as unexecuted even when a test provably ran it. `concurrency = ["greenlet"]`
is set in `pyproject.toml`; without it, coverage on this stack understates
by roughly 25 points.

## A note on source comments

Comments throughout the code cite per-module design documents by name —
`governance.md`, `gateway.md`, `identity.md` and so on — and reference
numbered ADRs. Those documents are the project's internal design record and
are not published here; this page is the public summary of what they
decided.

The references were left in place rather than stripped. Each comment states
its reasoning in full where it stands — the citation says *why this was
decided elsewhere*, not *go read elsewhere to understand this line* — and
rewriting ninety of them risked damaging explanations that are worth more
than the tidiness.

## Deliberate limits

- Single tenant, no HA, no backup/restore story.
- Prompt-injection detection is a keyword list, not a model.
- Rate limiting covers the gateway only.
- The compose file is a development environment, not a deployment.

See [SECURITY.md](../SECURITY.md) for the full statement of what is and is
not protected.
