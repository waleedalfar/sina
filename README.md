# Enterprise AI Platform for Regulated Healthcare

This repository is the control plane for deploying, evaluating, governing,
securing, monitoring, and auditing AI/ML/LLM systems inside regulated
healthcare organizations.

The full product vision, philosophy, and requirements live in
[`MasterPrompt.md`](./MasterPrompt.md). That document is the source of truth
for scope and intent; everything in `docs/` is a working decomposition of it
into buildable, reviewable pieces.

## Status

Pre-code. This repo currently contains only the architecture/decision
foundation — no application code has been written yet. See
`docs/decisions/` for what's been decided and why, and `MasterPrompt.md` §41
for the MVP 0.1 scope this foundation is building toward.

## How this repo is organized

```
MasterPrompt.md           Full product/architecture specification (source of truth)
DEVELOPMENT_RULES.md       Operational checklist distilled from MasterPrompt §49–50
docs/
  decisions/               ADRs — one file per architecture decision
  architecture/             System-level component map and core entity overview
  modules/                  Per-module design docs (Identity, Model Registry, ...)
backend/                   (not yet created) Python/FastAPI modular monolith
frontend/                  (not yet created) TypeScript/Next.js admin UI
infra/                     (not yet created) Docker Compose, later Helm/Terraform
```

## Working process

Every module (Identity, Model Registry, AI Gateway, Governance, Evaluation,
Audit, Dashboard, ...) gets:

1. A design doc in `docs/modules/` (template: `docs/modules/template.md`)
   reviewed and approved before implementation.
2. Any consequential architectural choice inside that module recorded as an
   ADR in `docs/decisions/` (template: `docs/decisions/template.md`),
   following the Decision Format in `MasterPrompt.md` §50.
3. Implementation only after the design doc is approved.

See `DEVELOPMENT_RULES.md` for the checklist every change is held against.

## Data

No real PHI is used anywhere in this repository's development or
demonstrations. Synthetic or de-identified data only, per
`MasterPrompt.md` §30 and §49.24.
