import hashlib
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import Severity
from app.audit.service import emit as audit_emit
from app.core.config import settings
from app.core.db import get_db
from app.evaluation.models import EvaluationRun
from app.gateway.prompt_security import flag_suspicious
from app.gateway.rate_limit import check_and_increment
from app.gateway.schemas import (
    ChatCompletionChoice,
    ChatCompletionChoiceMessage,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatCompletionUsage,
    ModelListEntry,
    ModelListResponse,
)
from app.governance.models import (
    Application,
    ApplicationPermittedRole,
    ApprovalCategory,
    ApprovalDecision,
    GovernanceApproval,
    LifecycleState,
    ResourceType,
)
from app.identity.security import ResolvedIdentity, get_current_identity
from app.models.models import ModelRuntimeState, ModelVersion, RuntimeStatus, ollama_model_name
from app.models.ollama_client import OllamaClient, OllamaError

router = APIRouter(tags=["gateway"])

_ollama = OllamaClient(settings.ollama_base_url)

# §7's "Authorization" step, expressed against identity.md's Role.kind
# taxonomy: staging traffic is for anyone with an internal role — i.e. any
# role that isn't solely permitted_user (Clinician).
_INTERNAL_KIND = "permitted_user"

_NON_PHI_CATEGORIES = {"de-identified", "administrative", "public"}


def _derive_phi_accessed(permitted_data: list[str]) -> bool:
    return any(cat.lower() not in _NON_PHI_CATEGORIES for cat in permitted_data)


async def _deny(
    db: AsyncSession,
    current: ResolvedIdentity,
    application_id: uuid.UUID | None,
    denied_check: str,
    reason: str,
    status_code: int = 403,
) -> None:
    """Emits `gateway.request_denied` and commits, then the caller raises.
    Only for checklist steps 1-4 (policy denials) — never for rate-limit or
    model-not-running, which are routine/operational, not audited (see
    gateway.md's Audit Events section)."""
    await audit_emit(
        db,
        tenant_id=current.identity.tenant_id,
        event_type="gateway.request_denied",
        actor_identity_id=current.identity.id,
        resource_type="application",
        resource_id=application_id,
        payload={
            "identity_id": str(current.identity.id),
            "application_id": str(application_id) if application_id else None,
            "denied_check": denied_check,
            "reason": reason,
        },
        severity=Severity.security_critical,
    )
    await db.commit()
    raise HTTPException(status_code=status_code, detail=reason)


@router.post("/v1/chat/completions", response_model=ChatCompletionResponse)
async def chat_completions(
    body: ChatCompletionRequest,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(get_current_identity),
    x_application_id: uuid.UUID = Header(..., alias="X-Application-Id"),
):
    if body.stream:
        raise HTTPException(status_code=422, detail="streaming responses are not supported in MVP 0.1")

    # --- Checklist step 1: Application exists and is in a servable state ---
    application = await db.get(Application, x_application_id)
    if application is None or application.lifecycle_state not in (
        LifecycleState.staging.value,
        LifecycleState.production.value,
    ):
        state = application.lifecycle_state if application else "unknown"
        await _deny(
            db, current, x_application_id, "application_state",
            f"application is not servable (state={state!r}) — must be staging or production",
        )

    # --- Checklist steps 2/3: role, scoped to lifecycle state ---
    if application.lifecycle_state == LifecycleState.staging.value:
        if not (current.role_kinds - {_INTERNAL_KIND}):
            await _deny(
                db, current, x_application_id, "role",
                "staging traffic requires an internal role (not solely Clinician)",
            )
    else:
        permitted_result = await db.execute(
            select(ApplicationPermittedRole.role_id).where(
                ApplicationPermittedRole.application_id == x_application_id
            )
        )
        permitted_role_ids = {row for row in permitted_result.scalars().all()}
        held_role_ids = {r.id for r in current.roles}
        if not (held_role_ids & permitted_role_ids):
            await _deny(
                db, current, x_application_id, "role",
                "caller does not hold a role permitted to use this application in production",
            )

    # --- Checklist step 4: bound Model Version has ai_governance approval ---
    # Defense in depth — governance's own state machine already gates
    # Application approval on this, but this module doesn't trust that
    # having been correctly enforced upstream. See gateway.md.
    model_approval_result = await db.execute(
        select(GovernanceApproval).where(
            GovernanceApproval.resource_type == ResourceType.model_version.value,
            GovernanceApproval.resource_id == application.model_version_id,
            GovernanceApproval.category == ApprovalCategory.ai_governance.value,
            GovernanceApproval.decision == ApprovalDecision.approved.value,
        )
    )
    if model_approval_result.scalar_one_or_none() is None:
        await _deny(
            db, current, x_application_id, "model_governance_approval",
            "the bound model version has no approved ai_governance decision",
        )

    version = await db.get(ModelVersion, application.model_version_id)

    # --- Checklist step 5: model actually running — no lazy autostart ---
    runtime = await db.get(ModelRuntimeState, application.model_version_id)
    if runtime is None or runtime.runtime_status != RuntimeStatus.running.value:
        raise HTTPException(status_code=503, detail="model is not currently running")

    # --- Checklist step 6: rate limit ---
    if not await check_and_increment(current.identity.id, x_application_id):
        raise HTTPException(status_code=429, detail="rate limit exceeded")

    # --- Checklist step 7: basic request-size limit ---
    prompt_text = "\n".join(m.content for m in body.messages)
    if len(prompt_text) > settings.gateway_max_prompt_chars:
        raise HTTPException(status_code=413, detail="prompt exceeds maximum length")

    prompt_injection_flagged = any(flag_suspicious(m.content) for m in body.messages)

    model_name = ollama_model_name(application.model_version_id)
    try:
        result = await _ollama.chat(
            model_name, [{"role": m.role, "content": m.content} for m in body.messages], body.max_tokens
        )
    except OllamaError as exc:
        raise HTTPException(status_code=502, detail=f"inference failed: {exc.reason}") from exc

    response_content = result.get("message", {}).get("content", "")
    if len(response_content) > settings.gateway_max_output_chars:
        response_content = response_content[: settings.gateway_max_output_chars]

    eval_result = await db.execute(
        select(EvaluationRun.id)
        .where(EvaluationRun.model_version_id == version.id, EvaluationRun.status == "complete")
        .order_by(EvaluationRun.completed_at.desc())
        .limit(1)
    )
    evaluation_version = eval_result.scalar_one_or_none()

    prompt_tokens = result.get("prompt_eval_count", 0)
    completion_tokens = result.get("eval_count", 0)

    await audit_emit(
        db,
        tenant_id=current.identity.tenant_id,
        event_type="gateway.inference_request",
        actor_identity_id=current.identity.id,
        resource_type="application",
        resource_id=x_application_id,
        payload={
            "application": str(x_application_id),
            "model": str(version.id),
            "model_hash": version.file_hash,
            "policy_version": "mvp-0.1-static-rules",
            "phi_accessed": _derive_phi_accessed(application.permitted_data),
            "data_sources": application.permitted_data,
            "retrieved_documents": [],
            "prompt_hash": hashlib.sha256(prompt_text.encode()).hexdigest(),
            "response_hash": hashlib.sha256(response_content.encode()).hexdigest(),
            "human_review_required": application.human_review_required,
            "evaluation_version": str(evaluation_version) if evaluation_version else None,
            "prompt_injection_flagged": prompt_injection_flagged,
        },
    )
    await db.commit()

    return ChatCompletionResponse(
        model=str(x_application_id),
        choices=[
            ChatCompletionChoice(message=ChatCompletionChoiceMessage(role="assistant", content=response_content))
        ],
        usage=ChatCompletionUsage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
        ),
    )


@router.get("/v1/models", response_model=ModelListResponse)
async def list_models(
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(get_current_identity),
):
    """
    Returns only Applications the caller can actually invoke — not every
    registered Model — so a caller with no access to an Application can't
    learn it exists. `id` is the Application id, since that's what
    `X-Application-Id` expects for an actual inference call.
    """
    result = await db.execute(
        select(Application).where(
            Application.lifecycle_state.in_([LifecycleState.staging.value, LifecycleState.production.value])
        )
    )
    applications = list(result.scalars().all())

    has_internal_role = bool(current.role_kinds - {_INTERNAL_KIND})
    held_role_ids = {r.id for r in current.roles}

    visible: list[ModelListEntry] = []
    for application in applications:
        if application.lifecycle_state == LifecycleState.staging.value:
            if has_internal_role:
                visible.append(ModelListEntry(id=str(application.id)))
        else:
            permitted_result = await db.execute(
                select(ApplicationPermittedRole.role_id).where(
                    ApplicationPermittedRole.application_id == application.id
                )
            )
            permitted_role_ids = set(permitted_result.scalars().all())
            if held_role_ids & permitted_role_ids:
                visible.append(ModelListEntry(id=str(application.id)))

    return ModelListResponse(data=visible)
