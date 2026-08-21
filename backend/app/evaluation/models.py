"""
`EvaluationRun` was forward-declared ahead of this module's own turn in
ADR-0003's build order, because `governance` structurally depends on it (the
`Evaluation -> Governance Review` lifecycle gate, and
`GovernanceApproval.evidence_evaluation_run_id`). This file now completes
the rest of the schema evaluation.md specifies around it:
EvaluationSuite/EvaluationCase (versioned test fixtures) and
EvaluationCategoryResult/EvaluationCaseResult (what a run actually produced).
`EvaluationRun` itself needed no rework — see the git history on this file
for the original forward-declaration note.
"""

import uuid
from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TenantScopedMixin


def _utcnow() -> datetime:
    return datetime.now(UTC)


class EvaluationRunStatus(str, Enum):
    pending = "pending"
    running = "running"
    complete = "complete"
    failed = "failed"


class EvaluationRun(Base, TenantScopedMixin):
    __tablename__ = "evaluation_run"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("model_version.id"), nullable=False
    )
    triggered_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.id"), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default=EvaluationRunStatus.pending.value)


class EvaluationCategory(str, Enum):
    hallucination = "hallucination"
    phi_leakage = "phi_leakage"
    prompt_injection = "prompt_injection"
    healthcare_qa = "healthcare_qa"


class ScoringMethod(str, Enum):
    marker_match = "marker_match"
    canary_check = "canary_check"
    exact_fuzzy_match = "exact_fuzzy_match"
    human_review = "human_review"


class ScoredBy(str, Enum):
    automated = "automated"
    human = "human"


class EvaluationSuite(Base):
    """
    Global reference data, not tenant-scoped — versioned test fixtures,
    same category as `identity.Role` in that sense. MVP 0.1 seeds exactly
    one active version per category (see app/seed.py).
    """

    __tablename__ = "evaluation_suite"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    version_label: Mapped[str] = mapped_column(Text, nullable=False)
    seeded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


class EvaluationCase(Base):
    __tablename__ = "evaluation_case"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    suite_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("evaluation_suite.id"), nullable=False)
    input_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    scoring_method: Mapped[str] = mapped_column(Text, nullable=False)
    scoring_criteria: Mapped[str] = mapped_column(Text, nullable=False)
    # Not in evaluation.md's schema table verbatim — fills an implementation
    # gap the doc left implicit: scoring_criteria alone doesn't say whether
    # PASS means the marker/canary is present (e.g. a faithfulness echo
    # check) or absent (e.g. a leakage/injection check). Ignored for
    # scoring_method = human_review.
    expect_marker_present: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class EvaluationCategoryResult(Base):
    """One row per category per run. `passed` requires cases_passed ==
    cases_total — no partial-credit threshold, per evaluation.md's "don't
    obscure risk with a hidden scoring model" principle."""

    __tablename__ = "evaluation_category_result"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("evaluation_run.id"), nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    suite_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("evaluation_suite.id"), nullable=False)
    cases_total: Mapped[int] = mapped_column(Integer, nullable=False)
    cases_passed: Mapped[int] = mapped_column(Integer, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)


class EvaluationCaseResult(Base):
    """Per-case detail — full content, not hashed. These are synthetic
    fixtures this module authors, never PHI, unlike gateway's real
    inference traffic. See evaluation.md's Security section."""

    __tablename__ = "evaluation_case_result"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("evaluation_run.id"), nullable=False)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("evaluation_case.id"), nullable=False)
    actual_output: Mapped[str] = mapped_column(Text, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    scored_by: Mapped[str] = mapped_column(Text, nullable=False)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.id"), nullable=True
    )
