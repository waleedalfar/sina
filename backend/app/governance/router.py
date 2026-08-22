import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import Severity
from app.audit.service import emit as audit_emit
from app.core.db import get_db
from app.core.exceptions import Conflict, NotFound, PolicyDenied
from app.evaluation.models import EvaluationRun, EvaluationRunStatus
from app.governance.models import (
    Application,
    ApplicationPermittedRole,
    ApprovalCategory,
    ApprovalDecision,
    GovernanceApproval,
    LifecycleState,
    ResourceType,
    RiskQuestionnaireResponse,
)
from app.governance.policy import (
    APPLICATION_APPROVAL_CATEGORIES,
    CATEGORY_ROLE,
    MANUAL_TRANSITIONS,
    NON_TERMINAL_STATES,
    RETIRE_ROLES,
    SUSPEND_ROLES,
)
from app.governance.risk import compute_suggested_classification
from app.governance.schemas import (
    ApplicationDetailOut,
    ApplicationIn,
    ApplicationOut,
    ApplicationUpdateIn,
    ApprovalIn,
    GovernanceApprovalOut,
    ModelVersionApprovalIn,
    RiskClassificationIn,
    RiskQuestionnaireIn,
    RiskQuestionnaireOut,
    SuspendIn,
    TransitionIn,
)
from app.identity.security import ResolvedIdentity, get_current_identity, require_role
from app.models.models import ModelVersion

router = APIRouter(prefix="/api/v1", tags=["governance"])


# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------


@router.post("/applications", response_model=ApplicationOut, status_code=201)
async def create_application(
    body: ApplicationIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role("Application Developer")),
):
    version = await db.get(ModelVersion, body.model_version_id)
    if version is None:
        raise NotFound(f"model version {body.model_version_id} not found")

    application = Application(
        id=uuid.uuid4(),
        tenant_id=current.identity.tenant_id,
        name=body.name,
        purpose=body.purpose,
        model_version_id=body.model_version_id,
        permitted_data=body.permitted_data,
        restricted_data=body.restricted_data,
        human_review_required=body.human_review_required,
        autonomous_action_allowed=body.autonomous_action_allowed,
        external_network_allowed=body.external_network_allowed,
        lifecycle_state=LifecycleState.draft.value,
        created_by=current.identity.id,
    )
    db.add(application)
    await db.flush()

    for role_id in body.permitted_role_ids:
        db.add(ApplicationPermittedRole(application_id=application.id, role_id=role_id))

    await audit_emit(
        db,
        tenant_id=current.identity.tenant_id,
        event_type="application.created",
        actor_identity_id=current.identity.id,
        resource_type="application",
        resource_id=application.id,
        payload={"created_by": str(current.identity.id)},
    )
    await db.commit()
    return application


@router.get("/applications", response_model=list[ApplicationOut])
async def list_applications(
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(get_current_identity),
):
    result = await db.execute(select(Application))
    return list(result.scalars().all())


async def _get_application_or_404(db: AsyncSession, application_id: uuid.UUID) -> Application:
    application = await db.get(Application, application_id)
    if application is None:
        raise NotFound(f"application {application_id} not found")
    return application


@router.get("/applications/{application_id}", response_model=ApplicationDetailOut)
async def get_application(
    application_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(get_current_identity),
):
    application = await _get_application_or_404(db, application_id)
    questionnaire = await db.get(RiskQuestionnaireResponse, application_id)
    approvals_result = await db.execute(
        select(GovernanceApproval).where(
            GovernanceApproval.resource_type == ResourceType.application.value,
            GovernanceApproval.resource_id == application_id,
        )
    )
    roles_result = await db.execute(
        select(ApplicationPermittedRole).where(ApplicationPermittedRole.application_id == application_id)
    )
    return ApplicationDetailOut(
        **ApplicationOut.model_validate(application).model_dump(),
        risk_questionnaire=(
            RiskQuestionnaireOut.model_validate(questionnaire) if questionnaire is not None else None
        ),
        approvals=[GovernanceApprovalOut.model_validate(a) for a in approvals_result.scalars().all()],
        permitted_role_ids=[r.role_id for r in roles_result.scalars().all()],
    )


@router.patch("/applications/{application_id}", response_model=ApplicationOut)
async def update_application(
    application_id: uuid.UUID,
    body: ApplicationUpdateIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(get_current_identity),
):
    application = await _get_application_or_404(db, application_id)
    if current.identity.id != application.created_by:
        raise PolicyDenied("only the application's creator may edit it")
    if application.lifecycle_state not in (LifecycleState.draft.value, LifecycleState.development.value):
        raise Conflict("an application can only be edited while in draft or development")

    updates = body.model_dump(exclude_unset=True, exclude={"permitted_role_ids"})
    for field, value in updates.items():
        setattr(application, field, value)

    if body.permitted_role_ids is not None:
        existing = await db.execute(
            select(ApplicationPermittedRole).where(ApplicationPermittedRole.application_id == application_id)
        )
        for row in existing.scalars().all():
            await db.delete(row)
        for role_id in body.permitted_role_ids:
            db.add(ApplicationPermittedRole(application_id=application_id, role_id=role_id))

    await db.commit()
    return application


# ---------------------------------------------------------------------------
# Risk classification
# ---------------------------------------------------------------------------


@router.post("/applications/{application_id}/risk-questionnaire", response_model=RiskQuestionnaireOut)
async def submit_risk_questionnaire(
    application_id: uuid.UUID,
    body: RiskQuestionnaireIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(
        require_role("Application Developer", *CATEGORY_ROLE.values())
    ),
):
    application = await _get_application_or_404(db, application_id)
    suggested = compute_suggested_classification(body.model_dump())

    response = await db.get(RiskQuestionnaireResponse, application_id)
    if response is None:
        response = RiskQuestionnaireResponse(application_id=application_id, **body.model_dump())
        db.add(response)
    else:
        for field, value in body.model_dump().items():
            setattr(response, field, value)
    response.suggested_classification = suggested
    response.completed_by = current.identity.id
    response.completed_at = datetime.now(UTC)

    await audit_emit(
        db,
        tenant_id=application.tenant_id,
        event_type="application.risk_questionnaire_submitted",
        actor_identity_id=current.identity.id,
        resource_type="application",
        resource_id=application_id,
        payload={"suggested_classification": suggested, "completed_by": str(current.identity.id)},
    )
    await db.commit()
    return response


@router.patch("/applications/{application_id}/risk-classification", response_model=ApplicationOut)
async def set_application_risk_classification(
    application_id: uuid.UUID,
    body: RiskClassificationIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role("AI Governance Officer", "Platform Administrator")),
):
    application = await _get_application_or_404(db, application_id)
    application.risk_classification = body.risk_classification
    await audit_emit(
        db,
        tenant_id=application.tenant_id,
        event_type="application.risk_classified",
        actor_identity_id=current.identity.id,
        resource_type="application",
        resource_id=application_id,
        payload={"risk_classification": body.risk_classification, "classified_by": str(current.identity.id)},
    )
    await db.commit()
    return application


@router.patch("/model-versions/{version_id}/risk-classification")
async def set_model_version_risk_classification(
    version_id: uuid.UUID,
    body: RiskClassificationIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role("AI Governance Officer", "Platform Administrator")),
):
    version = await db.get(ModelVersion, version_id)
    if version is None:
        raise NotFound(f"model version {version_id} not found")
    version.risk_classification = body.risk_classification
    await audit_emit(
        db,
        tenant_id=version.tenant_id,
        event_type="model_version.risk_classified",
        actor_identity_id=current.identity.id,
        resource_type="model_version",
        resource_id=version_id,
        payload={"risk_classification": body.risk_classification, "classified_by": str(current.identity.id)},
    )
    await db.commit()
    return {"model_version_id": str(version_id), "risk_classification": version.risk_classification}


# ---------------------------------------------------------------------------
# Lifecycle transitions
# ---------------------------------------------------------------------------


def _check_manual_transition_allowed(application: Application, to_state: str, current: ResolvedIdentity) -> None:
    from_state = application.lifecycle_state

    if to_state == LifecycleState.retired.value:
        if from_state not in NON_TERMINAL_STATES:
            raise Conflict(f"cannot retire from terminal state {from_state!r}")
        if not (current.role_names & RETIRE_ROLES):
            raise PolicyDenied(f"retiring an application requires one of: {', '.join(RETIRE_ROLES)}")
        return

    edges = MANUAL_TRANSITIONS.get(from_state)
    if edges is None or to_state not in edges:
        raise Conflict(
            f"no manual transition from {from_state!r} to {to_state!r} — see governance.md's state machine"
        )

    allowed_roles = edges[to_state]
    if allowed_roles is None:
        if current.identity.id != application.created_by:
            raise PolicyDenied("only the application's creator may perform this transition")
    elif not (current.role_names & allowed_roles):
        raise PolicyDenied(f"requires one of roles: {', '.join(allowed_roles)}")


async def _has_complete_evaluation_run(db: AsyncSession, model_version_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(EvaluationRun)
        .where(
            EvaluationRun.model_version_id == model_version_id,
            EvaluationRun.status == EvaluationRunStatus.complete.value,
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


@router.post("/applications/{application_id}/transition", response_model=ApplicationOut)
async def transition_application(
    application_id: uuid.UUID,
    body: TransitionIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(get_current_identity),
):
    application = await _get_application_or_404(db, application_id)
    _check_manual_transition_allowed(application, body.to_state, current)

    if (
        application.lifecycle_state == LifecycleState.evaluation.value
        and body.to_state == LifecycleState.governance_review.value
        and not await _has_complete_evaluation_run(db, application.model_version_id)
    ):
        raise Conflict(
            "the bound Model Version has no completed evaluation run yet — "
            "cannot enter Governance Review (governance.md's lifecycle gate)"
        )

    from_state = application.lifecycle_state
    application.lifecycle_state = body.to_state

    if body.to_state == LifecycleState.governance_review.value:
        # Re-entry into governance_review (from evaluation, or from
        # suspended) starts a new review cycle. Supersede the prior cycle's
        # approval rows so the distinct-signer/duplicate-category checks in
        # record_application_approval don't see stale decisions from a
        # cycle that's over — see governance.md's "review-round semantics".
        await db.execute(
            update(GovernanceApproval)
            .where(
                GovernanceApproval.resource_type == ResourceType.application.value,
                GovernanceApproval.resource_id == application_id,
                GovernanceApproval.superseded_at.is_(None),
            )
            .values(superseded_at=datetime.now(UTC))
        )

    await audit_emit(
        db,
        tenant_id=application.tenant_id,
        event_type="application.lifecycle_transitioned",
        actor_identity_id=current.identity.id,
        resource_type="application",
        resource_id=application_id,
        payload={"from_state": from_state, "to_state": body.to_state, "triggered_by": str(current.identity.id)},
    )
    await db.commit()
    return application


@router.post("/applications/{application_id}/suspend", response_model=ApplicationOut)
async def suspend_application(
    application_id: uuid.UUID,
    body: SuspendIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role(*SUSPEND_ROLES)),
):
    application = await _get_application_or_404(db, application_id)
    if application.lifecycle_state not in (LifecycleState.staging.value, LifecycleState.production.value):
        raise Conflict("can only suspend an application currently in staging or production")

    from_state = application.lifecycle_state
    application.lifecycle_state = LifecycleState.suspended.value
    await audit_emit(
        db,
        tenant_id=application.tenant_id,
        event_type="application.emergency_suspended",
        actor_identity_id=current.identity.id,
        resource_type="application",
        resource_id=application_id,
        payload={"from_state": from_state, "triggered_by": str(current.identity.id), "reason": body.reason},
        severity=Severity.security_critical,
    )
    await db.commit()
    return application


# ---------------------------------------------------------------------------
# Governance approvals
# ---------------------------------------------------------------------------


@router.post("/applications/{application_id}/approvals", response_model=GovernanceApprovalOut, status_code=201)
async def record_application_approval(
    application_id: uuid.UUID,
    body: ApprovalIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(get_current_identity),
):
    application = await _get_application_or_404(db, application_id)

    if body.category not in APPLICATION_APPROVAL_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"invalid category: {body.category}")
    if body.decision not in (
        ApprovalDecision.approved.value,
        ApprovalDecision.rejected.value,
        ApprovalDecision.changes_requested.value,
    ):
        raise HTTPException(status_code=422, detail=f"invalid decision: {body.decision}")

    required_role = CATEGORY_ROLE[body.category]
    if required_role not in current.role_names:
        raise PolicyDenied(f"recording a {body.category} decision requires {required_role}")

    if application.lifecycle_state != LifecycleState.governance_review.value:
        raise Conflict("approvals may only be recorded while the application is in governance_review")

    existing_result = await db.execute(
        select(GovernanceApproval).where(
            GovernanceApproval.resource_type == ResourceType.application.value,
            GovernanceApproval.resource_id == application_id,
            GovernanceApproval.superseded_at.is_(None),
        )
    )
    existing_rows = list(existing_result.scalars().all())

    # No-self-approval — checked even though the global role conflict
    # matrix (identity.md) already makes it structurally hard, because role
    # history isn't retroactive. See governance.md's Design decision.
    if current.identity.id == application.created_by:
        await audit_emit(
            db,
            tenant_id=application.tenant_id,
            event_type="application.approval_rejected",
            actor_identity_id=current.identity.id,
            resource_type="application",
            resource_id=application_id,
            payload={"attempted_by": str(current.identity.id), "reason": "no-self-approval"},
            severity=Severity.security_critical,
        )
        await db.commit()
        raise Conflict("the application's creator cannot record an approval decision on it")

    # Distinct signers per resource.
    conflicting = next((row for row in existing_rows if row.decided_by == current.identity.id), None)
    if conflicting is not None:
        await audit_emit(
            db,
            tenant_id=application.tenant_id,
            event_type="application.approval_rejected",
            actor_identity_id=current.identity.id,
            resource_type="application",
            resource_id=application_id,
            payload={
                "attempted_by": str(current.identity.id),
                "reason": f"identity already signed category {conflicting.category!r} for this resource",
            },
            severity=Severity.security_critical,
        )
        await db.commit()
        raise Conflict(
            f"identity already recorded the {conflicting.category!r} decision on this application — "
            "distinct signers required per category"
        )

    if any(row.category == body.category for row in existing_rows):
        raise Conflict(f"a {body.category!r} decision has already been recorded for this application")

    approval = GovernanceApproval(
        id=uuid.uuid4(),
        tenant_id=application.tenant_id,
        resource_type=ResourceType.application.value,
        resource_id=application_id,
        category=body.category,
        decision=body.decision,
        decided_by=current.identity.id,
        comment=body.comment,
    )
    db.add(approval)
    await audit_emit(
        db,
        tenant_id=application.tenant_id,
        event_type="application.approval_recorded",
        actor_identity_id=current.identity.id,
        resource_type="application",
        resource_id=application_id,
        payload={"category": body.category, "decision": body.decision, "decided_by": str(current.identity.id)},
    )

    # System-triggered transitions — see governance.md: no manual path
    # reaches governance_review -> approved or -> development.
    if body.decision in (ApprovalDecision.rejected.value, ApprovalDecision.changes_requested.value):
        from_state = application.lifecycle_state
        application.lifecycle_state = LifecycleState.development.value
        await audit_emit(
            db,
            tenant_id=application.tenant_id,
            event_type="application.lifecycle_transitioned",
            actor_identity_id=current.identity.id,
            resource_type="application",
            resource_id=application_id,
            payload={
                "from_state": from_state,
                "to_state": LifecycleState.development.value,
                "triggered_by": str(current.identity.id),
                "automatic": True,
                "reason": f"{body.category} decision was {body.decision}",
            },
        )
    elif body.decision == ApprovalDecision.approved.value:
        all_rows = [*existing_rows, approval]
        approved_categories = {r.category for r in all_rows if r.decision == ApprovalDecision.approved.value}
        if set(APPLICATION_APPROVAL_CATEGORIES) <= approved_categories:
            model_approval_result = await db.execute(
                select(GovernanceApproval).where(
                    GovernanceApproval.resource_type == ResourceType.model_version.value,
                    GovernanceApproval.resource_id == application.model_version_id,
                    GovernanceApproval.category == ApprovalCategory.ai_governance.value,
                    GovernanceApproval.decision == ApprovalDecision.approved.value,
                )
            )
            if model_approval_result.scalar_one_or_none() is not None:
                from_state = application.lifecycle_state
                application.lifecycle_state = LifecycleState.approved.value
                await audit_emit(
                    db,
                    tenant_id=application.tenant_id,
                    event_type="application.lifecycle_transitioned",
                    actor_identity_id=current.identity.id,
                    resource_type="application",
                    resource_id=application_id,
                    payload={
                        "from_state": from_state,
                        "to_state": LifecycleState.approved.value,
                        "triggered_by": str(current.identity.id),
                        "automatic": True,
                        "reason": "all 5 application categories and the bound model version are approved",
                    },
                )

    await db.commit()
    return approval


@router.post("/model-versions/{version_id}/approvals", response_model=GovernanceApprovalOut, status_code=201)
async def record_model_version_approval(
    version_id: uuid.UUID,
    body: ModelVersionApprovalIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role("AI Governance Officer")),
):
    version = await db.get(ModelVersion, version_id)
    if version is None:
        raise NotFound(f"model version {version_id} not found")

    if body.decision not in (
        ApprovalDecision.approved.value,
        ApprovalDecision.rejected.value,
        ApprovalDecision.changes_requested.value,
    ):
        raise HTTPException(status_code=422, detail=f"invalid decision: {body.decision}")

    run = await db.get(EvaluationRun, body.evidence_evaluation_run_id)
    if run is None:
        raise NotFound(f"evaluation run {body.evidence_evaluation_run_id} not found")
    if run.model_version_id != version_id:
        raise Conflict("the referenced evaluation run does not belong to this model version")

    if current.identity.id == version.imported_by:
        await audit_emit(
            db,
            tenant_id=version.tenant_id,
            event_type="application.approval_rejected",
            actor_identity_id=current.identity.id,
            resource_type="model_version",
            resource_id=version_id,
            payload={"attempted_by": str(current.identity.id), "reason": "no-self-approval"},
            severity=Severity.security_critical,
        )
        await db.commit()
        raise Conflict("the model version's importer cannot record its ai_governance approval")

    existing_result = await db.execute(
        select(GovernanceApproval).where(
            GovernanceApproval.resource_type == ResourceType.model_version.value,
            GovernanceApproval.resource_id == version_id,
            GovernanceApproval.category == ApprovalCategory.ai_governance.value,
        )
    )
    if existing_result.scalar_one_or_none() is not None:
        raise Conflict("an ai_governance decision has already been recorded for this model version")

    approval = GovernanceApproval(
        id=uuid.uuid4(),
        tenant_id=version.tenant_id,
        resource_type=ResourceType.model_version.value,
        resource_id=version_id,
        category=ApprovalCategory.ai_governance.value,
        decision=body.decision,
        decided_by=current.identity.id,
        comment=body.comment,
        evidence_evaluation_run_id=body.evidence_evaluation_run_id,
    )
    db.add(approval)
    await audit_emit(
        db,
        tenant_id=version.tenant_id,
        event_type="application.approval_recorded",
        actor_identity_id=current.identity.id,
        resource_type="model_version",
        resource_id=version_id,
        payload={
            "category": "ai_governance",
            "decision": body.decision,
            "decided_by": str(current.identity.id),
            "evidence_evaluation_run_id": str(body.evidence_evaluation_run_id),
        },
    )
    await db.commit()
    return approval
