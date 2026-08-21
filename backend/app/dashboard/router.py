import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import AuditEvent
from app.audit.router import _READ_KINDS as _AUDIT_READ_KINDS
from app.audit.router import list_audit_events
from app.core.db import get_db
from app.dashboard.schemas import (
    ApplicationDashboardRow,
    ApprovalQueueItem,
    EvaluationDashboardRow,
    GovernanceSummaryOut,
    ModelDashboardRow,
    SecurityEventsOut,
)
from app.evaluation.models import EvaluationCategoryResult, EvaluationRun, EvaluationRunStatus
from app.governance.models import (
    Application,
    ApprovalCategory,
    ApprovalDecision,
    GovernanceApproval,
    LifecycleState,
    ResourceType,
)
from app.governance.policy import APPLICATION_APPROVAL_CATEGORIES, CATEGORY_ROLE
from app.identity.models import Identity
from app.identity.security import ResolvedIdentity, get_current_identity, require_role_kind
from app.models.models import Model, ModelRuntimeState, ModelVersion

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/models", response_model=list[ModelDashboardRow])
async def dashboard_models(
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(get_current_identity),
):
    versions_result = await db.execute(select(ModelVersion))
    versions = list(versions_result.scalars().all())

    rows: list[ModelDashboardRow] = []
    for version in versions:
        model = await db.get(Model, version.model_id)
        runtime = await db.get(ModelRuntimeState, version.id)

        approval_result = await db.execute(
            select(GovernanceApproval).where(
                GovernanceApproval.resource_type == ResourceType.model_version.value,
                GovernanceApproval.resource_id == version.id,
                GovernanceApproval.category == ApprovalCategory.ai_governance.value,
            )
        )
        approval = approval_result.scalar_one_or_none()

        latest_run_result = await db.execute(
            select(EvaluationRun)
            .where(
                EvaluationRun.model_version_id == version.id,
                EvaluationRun.status == EvaluationRunStatus.complete.value,
            )
            .order_by(EvaluationRun.completed_at.desc())
            .limit(1)
        )
        latest_run = latest_run_result.scalar_one_or_none()
        evaluation_summary: dict[str, bool] | None = None
        if latest_run is not None:
            cat_result = await db.execute(
                select(EvaluationCategoryResult).where(EvaluationCategoryResult.run_id == latest_run.id)
            )
            evaluation_summary = {r.category: r.passed for r in cat_result.scalars().all()}

        apps_result = await db.execute(select(Application.name).where(Application.model_version_id == version.id))

        rows.append(
            ModelDashboardRow(
                model_id=version.model_id,
                model_name=model.name if model else "?",
                version_id=version.id,
                version_label=version.version_label,
                runtime_status=runtime.runtime_status if runtime else "unknown",
                risk_classification=version.risk_classification,
                ai_governance_decision=approval.decision if approval else None,
                evaluation_summary=evaluation_summary,
                applications=list(apps_result.scalars().all()),
                last_reviewed_at=approval.decided_at if approval else None,
            )
        )
    return rows


@router.get("/applications", response_model=list[ApplicationDashboardRow])
async def dashboard_applications(
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(get_current_identity),
):
    apps_result = await db.execute(select(Application))
    applications = list(apps_result.scalars().all())

    rows: list[ApplicationDashboardRow] = []
    for application in applications:
        owner = await db.get(Identity, application.created_by)
        version = await db.get(ModelVersion, application.model_version_id)
        model = await db.get(Model, version.model_id) if version else None

        approvals_result = await db.execute(
            select(GovernanceApproval).where(
                GovernanceApproval.resource_type == ResourceType.application.value,
                GovernanceApproval.resource_id == application.id,
                GovernanceApproval.decision == ApprovalDecision.approved.value,
            )
        )
        approved_count = len(list(approvals_result.scalars().all()))

        rows.append(
            ApplicationDashboardRow(
                application_id=application.id,
                name=application.name,
                owner=owner.display_name if owner else None,
                model_name=model.name if model else "?",
                model_version_label=version.version_label if version else "?",
                risk_classification=application.risk_classification,
                permitted_data=application.permitted_data,
                human_review_required=application.human_review_required,
                lifecycle_state=application.lifecycle_state,
                approvals_complete=approved_count,
                approvals_required=len(APPLICATION_APPROVAL_CATEGORIES),
            )
        )
    return rows


@router.get("/evaluations", response_model=list[EvaluationDashboardRow])
async def dashboard_evaluations(
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(get_current_identity),
):
    runs_result = await db.execute(select(EvaluationRun).order_by(EvaluationRun.triggered_at.desc()))
    runs = list(runs_result.scalars().all())

    rows: list[EvaluationDashboardRow] = []
    for run in runs:
        version = await db.get(ModelVersion, run.model_version_id)
        model = await db.get(Model, version.model_id) if version else None
        cat_result = await db.execute(
            select(EvaluationCategoryResult).where(EvaluationCategoryResult.run_id == run.id)
        )
        rows.append(
            EvaluationDashboardRow(
                run_id=run.id,
                model_id=version.model_id if version else run.model_version_id,
                model_name=model.name if model else "?",
                model_version_label=version.version_label if version else "?",
                status=run.status,
                triggered_at=run.triggered_at,
                completed_at=run.completed_at,
                category_summary={r.category: r.passed for r in cat_result.scalars().all()},
            )
        )
    return rows


@router.get("/audit-events")
async def dashboard_audit_events(
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role_kind(*_AUDIT_READ_KINDS)),
    actor_identity_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    event_type: str | None = None,
    severity: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
):
    """
    Forwards directly to `audit`'s own list function — same query, same
    Role.kind authorization rule — rather than reimplementing it. See
    dashboard-api.md's Design decision. This route's own `require_role_kind`
    dependency is the actual enforcement point: calling a FastAPI-decorated
    function directly like this bypasses its `Depends()` defaults (they're
    only resolved by FastAPI's routing layer, not by a plain Python call),
    so `_` below is just a pass-through value, not a second check.
    """
    return await list_audit_events(
        db=db,
        _=current,
        actor_identity_id=actor_identity_id,
        resource_type=resource_type,
        resource_id=resource_id,
        event_type=event_type,
        severity=severity,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )


@router.get("/security-events", response_model=SecurityEventsOut)
async def dashboard_security_events(
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(require_role_kind(*_AUDIT_READ_KINDS)),
    limit: int = Query(default=20, le=200),
):
    """
    §26's Security dashboard, mapped to real MVP 0.1 data sources — see
    dashboard-api.md's mapping table. Same Role.kind restriction as
    audit-events, since this is fundamentally audit data.
    """

    async def _events(**filters) -> list[dict]:
        stmt = select(AuditEvent).order_by(AuditEvent.sequence_number.desc()).limit(limit)
        for column, value in filters.items():
            stmt = stmt.where(getattr(AuditEvent, column) == value)
        result = await db.execute(stmt)
        return [
            {
                "sequence_number": e.sequence_number,
                "event_type": e.event_type,
                "occurred_at": e.occurred_at.isoformat(),
                "actor_identity_id": str(e.actor_identity_id) if e.actor_identity_id else None,
                "payload": e.payload,
            }
            for e in result.scalars().all()
        ]

    policy_violations_denied = await _events(event_type="gateway.request_denied")
    policy_violations_rejected = await _events(event_type="application.approval_rejected")
    failed_auth = await _events(event_type="identity.auth_rejected")
    scan_failed = await _events(event_type="model_version.malware_scan_failed")
    hash_mismatch = await _events(event_type="model_version.hash_mismatch_detected")

    inference_result = await db.execute(
        select(AuditEvent)
        .where(AuditEvent.event_type == "gateway.inference_request")
        .order_by(AuditEvent.sequence_number.desc())
        .limit(500)
    )
    inference_events = list(inference_result.scalars().all())
    phi_events = [
        {
            "sequence_number": e.sequence_number,
            "occurred_at": e.occurred_at.isoformat(),
            "payload": e.payload,
        }
        for e in inference_events
        if e.payload.get("phi_accessed") is True
    ][:limit]
    suspicious_prompts = [
        {
            "sequence_number": e.sequence_number,
            "occurred_at": e.occurred_at.isoformat(),
            "payload": e.payload,
        }
        for e in inference_events
        if e.payload.get("prompt_injection_flagged") is True
    ][:limit]

    return SecurityEventsOut(
        policy_violations=(policy_violations_denied + policy_violations_rejected)[:limit],
        phi_events=phi_events,
        failed_authentication=failed_auth,
        suspicious_prompts=suspicious_prompts,
        security_findings=(scan_failed + hash_mismatch)[:limit],
    )


@router.get("/governance-summary", response_model=GovernanceSummaryOut)
async def dashboard_governance_summary(
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(get_current_identity),
):
    apps_result = await db.execute(select(Application.lifecycle_state))
    applications_by_state: dict[str, int] = {}
    for (state,) in apps_result.all():
        applications_by_state[state] = applications_by_state.get(state, 0) + 1

    versions_result = await db.execute(select(ModelVersion.id))
    version_ids = [v for (v,) in versions_result.all()]
    model_versions_by_approval_status = {"approved": 0, "pending": 0, "rejected": 0, "changes_requested": 0}
    for version_id in version_ids:
        approval_result = await db.execute(
            select(GovernanceApproval.decision).where(
                GovernanceApproval.resource_type == ResourceType.model_version.value,
                GovernanceApproval.resource_id == version_id,
                GovernanceApproval.category == ApprovalCategory.ai_governance.value,
            )
        )
        decision = approval_result.scalar_one_or_none()
        key = decision if decision else "pending"
        model_versions_by_approval_status[key] = model_versions_by_approval_status.get(key, 0) + 1

    pending_count = applications_by_state.get(LifecycleState.governance_review.value, 0)

    return GovernanceSummaryOut(
        applications_by_state=applications_by_state,
        model_versions_by_approval_status=model_versions_by_approval_status,
        pending_application_approvals=pending_count,
    )


@router.get("/my-approval-queue", response_model=list[ApprovalQueueItem])
async def my_approval_queue(
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(get_current_identity),
):
    """
    Self-scoped by construction — only ever returns items matching roles
    the caller holds, safe for any authenticated identity to call. Not in
    §26/§41 verbatim; a direct consequence of tracing what "Governance
    status" should mean for a signed-in reviewer. See dashboard-api.md.
    """
    items: list[ApprovalQueueItem] = []

    apps_result = await db.execute(
        select(Application).where(Application.lifecycle_state == LifecycleState.governance_review.value)
    )
    for application in apps_result.scalars().all():
        if current.identity.id == application.created_by:
            continue
        existing_result = await db.execute(
            select(GovernanceApproval.category).where(
                GovernanceApproval.resource_type == ResourceType.application.value,
                GovernanceApproval.resource_id == application.id,
            )
        )
        already_decided = set(existing_result.scalars().all())
        for category in APPLICATION_APPROVAL_CATEGORIES:
            if category in already_decided:
                continue
            if CATEGORY_ROLE[category] not in current.role_names:
                continue
            items.append(
                ApprovalQueueItem(
                    resource_type=ResourceType.application.value,
                    resource_id=application.id,
                    resource_name=application.name,
                    category=category,
                )
            )

    if "AI Governance Officer" in current.role_names:
        versions_result = await db.execute(select(ModelVersion))
        for version in versions_result.scalars().all():
            if current.identity.id == version.imported_by:
                continue
            approval_result = await db.execute(
                select(GovernanceApproval).where(
                    GovernanceApproval.resource_type == ResourceType.model_version.value,
                    GovernanceApproval.resource_id == version.id,
                    GovernanceApproval.category == ApprovalCategory.ai_governance.value,
                )
            )
            if approval_result.scalar_one_or_none() is not None:
                continue
            model = await db.get(Model, version.model_id)
            items.append(
                ApprovalQueueItem(
                    resource_type=ResourceType.model_version.value,
                    resource_id=version.id,
                    resource_name=f"{model.name if model else '?'} ({version.version_label})",
                    category=ApprovalCategory.ai_governance.value,
                )
            )

    return items
