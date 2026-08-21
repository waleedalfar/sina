import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import emit as audit_emit
from app.core.db import get_db
from app.core.exceptions import Conflict, NotFound
from app.evaluation.models import (
    EvaluationCase,
    EvaluationCaseResult,
    EvaluationCategoryResult,
    EvaluationRun,
    EvaluationRunStatus,
    EvaluationSuite,
    ScoredBy,
)
from app.evaluation.runner import execute_run
from app.evaluation.schemas import (
    EvaluationCaseResultOut,
    EvaluationCategoryResultOut,
    EvaluationRunDetailOut,
    EvaluationRunOut,
    HumanReviewIn,
)
from app.identity.security import ResolvedIdentity, require_role
from app.models.models import ModelVersion

router = APIRouter(prefix="/api/v1", tags=["evaluation"])

_TRIGGER_ROLES = ("ML Engineer", "Platform Administrator", "Auditor")
# Read access: builders + all sign-off roles + admin/readonly — everyone
# except a bare Clinician (permitted_user), since evaluation results are an
# internal governance/engineering concern, not something an application's
# end user needs to see.
_READ_ROLES = (
    *_TRIGGER_ROLES,
    "Application Developer",
    "Clinical Safety Reviewer",
    "Privacy Officer",
    "Security Administrator",
    "AI Governance Officer",
    "Compliance Officer",
)


@router.post("/model-versions/{version_id}/evaluation-runs", response_model=EvaluationRunOut, status_code=201)
async def trigger_evaluation_run(
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role(*_TRIGGER_ROLES)),
):
    """
    Runs synchronously — the caller waits for all four category suites to
    complete before getting a response. No self-review conflict modeled:
    per evaluation.md, this is (mostly) automated scoring against fixed
    synthetic fixtures, not a subjective sign-off, so an ML Engineer
    running the suite against their own imported model isn't "approving"
    anything.
    """
    version = await db.get(ModelVersion, version_id)
    if version is None:
        raise NotFound(f"model version {version_id} not found")

    run = EvaluationRun(
        id=uuid.uuid4(),
        tenant_id=current.identity.tenant_id,
        model_version_id=version_id,
        triggered_by=current.identity.id,
        status=EvaluationRunStatus.running.value,
    )
    db.add(run)
    await audit_emit(
        db,
        tenant_id=current.identity.tenant_id,
        event_type="evaluation.run_started",
        actor_identity_id=current.identity.id,
        resource_type="model_version",
        resource_id=version_id,
        payload={"run_id": str(run.id)},
    )
    await db.commit()

    await execute_run(db, version, run)

    await db.refresh(run)
    return run


@router.get("/model-versions/{version_id}/evaluation-runs", response_model=list[EvaluationRunOut])
async def list_evaluation_runs(
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(require_role(*_READ_ROLES)),
):
    result = await db.execute(
        select(EvaluationRun)
        .where(EvaluationRun.model_version_id == version_id)
        .order_by(EvaluationRun.triggered_at.desc())
    )
    return list(result.scalars().all())


@router.get("/evaluation-runs/{run_id}", response_model=EvaluationRunDetailOut)
async def get_evaluation_run(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(require_role(*_READ_ROLES)),
):
    run = await db.get(EvaluationRun, run_id)
    if run is None:
        raise NotFound(f"evaluation run {run_id} not found")

    category_results = await db.execute(
        select(EvaluationCategoryResult).where(EvaluationCategoryResult.run_id == run_id)
    )
    case_results = await db.execute(select(EvaluationCaseResult).where(EvaluationCaseResult.run_id == run_id))

    return EvaluationRunDetailOut(
        **EvaluationRunOut.model_validate(run).model_dump(),
        category_results=[EvaluationCategoryResultOut.model_validate(r) for r in category_results.scalars().all()],
        case_results=[EvaluationCaseResultOut.model_validate(r) for r in case_results.scalars().all()],
    )


@router.patch("/evaluation-runs/{run_id}/cases/{case_result_id}", response_model=EvaluationCaseResultOut)
async def submit_human_review(
    run_id: uuid.UUID,
    case_result_id: uuid.UUID,
    body: HumanReviewIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role(*_TRIGGER_ROLES)),
):
    """
    Not in evaluation.md's original API surface — a real gap the doc left:
    `scored_by = human` cases have nowhere to actually get scored without
    this. Closed here rather than left as an unusable schema value.
    Recomputes the owning EvaluationCategoryResult after updating, since a
    pending human_review case counts as not-passed until reviewed.
    """
    case_result = await db.get(EvaluationCaseResult, case_result_id)
    if case_result is None or case_result.run_id != run_id:
        raise NotFound(f"case result {case_result_id} not found under run {run_id}")
    if case_result.scored_by != ScoredBy.human.value:
        raise Conflict("this case was scored automatically and cannot be manually reviewed")

    case_result.passed = body.passed
    case_result.reviewed_by = current.identity.id

    case = await db.get(EvaluationCase, case_result.case_id)
    suite = await db.get(EvaluationSuite, case.suite_id)
    category_result_query = await db.execute(
        select(EvaluationCategoryResult).where(
            EvaluationCategoryResult.run_id == run_id,
            EvaluationCategoryResult.category == suite.category,
        )
    )
    category_result = category_result_query.scalar_one()

    sibling_results = await db.execute(
        select(EvaluationCaseResult)
        .join(EvaluationCase, EvaluationCase.id == EvaluationCaseResult.case_id)
        .where(EvaluationCaseResult.run_id == run_id, EvaluationCase.suite_id == suite.id)
    )
    all_results = list(sibling_results.scalars().all())
    category_result.cases_passed = sum(1 for r in all_results if r.passed)
    category_result.passed = category_result.cases_passed == category_result.cases_total

    await db.commit()
    return case_result
