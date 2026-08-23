import asyncio
import hashlib
import os
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import Severity
from app.audit.service import emit as audit_emit
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import Conflict, NotFound
from app.identity.security import ResolvedIdentity, get_current_identity, require_role
from app.models.clamav import ScanUnavailable, scan_bytes
from app.models.models import (
    MalwareScanResult,
    Model,
    ModelRuntimeState,
    ModelVersion,
    RuntimeStatus,
    ollama_model_name,
)
from app.models.ollama_client import OllamaClient, OllamaError
from app.models.schemas import (
    ModelIn,
    ModelOut,
    ModelRuntimeStateOut,
    ModelUpdateIn,
    ModelVersionOut,
)

router = APIRouter(prefix="/api/v1", tags=["models"])

_ollama = OllamaClient(settings.ollama_base_url)


def _gguf_path(model_version_id: uuid.UUID) -> str:
    return os.path.join(settings.model_storage_dir, f"{model_version_id}.gguf")


async def _to_runtime_state_out(db: AsyncSession, state: ModelRuntimeState) -> ModelRuntimeStateOut:
    """
    Closes a gap left open when `governance` didn't exist yet:
    `production_eligible` checks for an approved `ai_governance`
    GovernanceApproval on this version — imported here rather than at
    module load time to avoid a hard import-order dependency, though
    governance.models itself doesn't import back into models, so this
    isn't a true cycle.
    """
    from app.governance.models import (
        ApprovalCategory,
        ApprovalDecision,
        GovernanceApproval,
        ResourceType,
    )

    result = await db.execute(
        select(GovernanceApproval).where(
            GovernanceApproval.resource_type == ResourceType.model_version.value,
            GovernanceApproval.resource_id == state.model_version_id,
            GovernanceApproval.category == ApprovalCategory.ai_governance.value,
            GovernanceApproval.decision == ApprovalDecision.approved.value,
        )
    )
    return ModelRuntimeStateOut(
        model_version_id=state.model_version_id,
        runtime_status=state.runtime_status,
        last_started_at=state.last_started_at,
        last_stopped_at=state.last_stopped_at,
        last_health_check_at=state.last_health_check_at,
        last_hash_reverify_result=state.last_hash_reverify_result,
        memory_used_mb=state.memory_used_mb,
        process_error=state.process_error,
        production_eligible=result.scalar_one_or_none() is not None,
    )


def _write_and_hash_sync(path: str, content: bytes) -> str:
    hasher = hashlib.sha256()
    hasher.update(content)
    with open(path, "wb") as out:
        out.write(content)
    return hasher.hexdigest()


def _compute_sha256_sync(path: str) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1024 * 1024):
            hasher.update(chunk)
    return hasher.hexdigest()


async def _compute_sha256(path: str) -> str:
    # Blocking file I/O off the event loop — this runs on every start (see
    # the fail-closed re-verification below), so it must not stall other
    # concurrent requests while hashing a large artifact.
    return await asyncio.to_thread(_compute_sha256_sync, path)


@router.post("/models", response_model=ModelOut, status_code=201)
async def create_model(
    body: ModelIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role("ML Engineer")),
):
    model = Model(
        id=uuid.uuid4(),
        tenant_id=current.identity.tenant_id,
        name=body.name,
        description=body.description,
    )
    db.add(model)
    await db.commit()
    return model


@router.get("/models", response_model=list[ModelOut])
async def list_models(
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(get_current_identity),
):
    result = await db.execute(select(Model))
    return list(result.scalars().all())


@router.get("/models/{model_id}", response_model=ModelOut)
async def get_model(
    model_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(get_current_identity),
):
    model = await db.get(Model, model_id)
    if model is None:
        raise NotFound(f"model {model_id} not found")
    return model


@router.patch("/models/{model_id}", response_model=ModelOut)
async def update_model(
    model_id: uuid.UUID,
    body: ModelUpdateIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role("ML Engineer")),
):
    """
    Rename / re-describe a `Model`. Same role as creating one — whoever
    can register a Model owns its metadata.

    Audited, unlike `create_model`, and deliberately so: a `Model`'s name
    is the label an auditor sees next to every historical governance
    approval recorded against its versions. Renaming one silently rewrites
    what a past decision *appears* to have been about, so the old value has
    to survive somewhere. `model.updated` is that somewhere. Creation has
    no prior value to lose, which is why it stays unaudited.

    Only `Model`-level metadata is editable. A `ModelVersion` is an
    immutable record of an imported artifact — see `ModelUpdateIn`.
    """
    model = await db.get(Model, model_id)
    if model is None:
        raise NotFound(f"model {model_id} not found")

    updates = body.model_dump(exclude_unset=True)
    changed: dict[str, dict[str, str | None]] = {}
    for field, value in updates.items():
        previous = getattr(model, field)
        if previous == value:
            continue
        changed[field] = {"from": previous, "to": value}
        setattr(model, field, value)

    # Nothing actually differs — don't write a no-op row into an
    # append-only audit log that can never be cleaned up.
    if not changed:
        return model

    await audit_emit(
        db,
        tenant_id=model.tenant_id,
        event_type="model.updated",
        actor_identity_id=current.identity.id,
        resource_type="model",
        resource_id=model_id,
        payload={"updated_by": str(current.identity.id), "changes": changed},
        severity=Severity.info,
    )
    await db.commit()
    return model


@router.post("/models/{model_id}/versions", response_model=ModelVersionOut, status_code=201)
async def import_model_version(
    model_id: uuid.UUID,
    file: UploadFile = File(...),
    version_label: str | None = Form(default=None),
    declared_source: str | None = Form(default=None),
    declared_license: str | None = Form(default=None),
    base_model_version_id: uuid.UUID | None = Form(default=None),
    known_limitations: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role("ML Engineer")),
):
    """
    Streams the upload to the shared model-storage volume, hashing as it
    goes, then runs the ClamAV scan (models.md's malware-scan design
    decision: hard block, no override) before the ModelVersion row is
    created with its final scan result — never left half-imported.
    """
    model = await db.get(Model, model_id)
    if model is None:
        raise NotFound(f"model {model_id} not found")

    if base_model_version_id is not None:
        base = await db.get(ModelVersion, base_model_version_id)
        if base is None:
            raise NotFound(f"base_model_version_id {base_model_version_id} not found")

    if version_label is None:
        count_result = await db.execute(select(ModelVersion).where(ModelVersion.model_id == model_id))
        version_label = f"v{len(list(count_result.scalars().all())) + 1}"

    version_id = uuid.uuid4()
    dest_path = _gguf_path(version_id)
    os.makedirs(settings.model_storage_dir, exist_ok=True)

    # UploadFile.read() is the one genuinely async I/O call here (Starlette
    # spools it, doesn't block the loop); everything after is CPU/disk work
    # done in a thread so it doesn't stall other requests. Buffers the whole
    # file in memory — acceptable for MVP 0.1's "basic" scope with small
    # local artifacts, not appropriate as-is for large multi-GB models.
    content = await file.read()
    size = len(content)
    file_hash = await asyncio.to_thread(_write_and_hash_sync, dest_path, content)

    try:
        is_clean, scan_response = await scan_bytes(settings.clamav_host, settings.clamav_port, content)
    except ScanUnavailable as exc:
        os.remove(dest_path)
        raise HTTPException(status_code=502, detail=f"malware scan unavailable, import refused: {exc}") from exc

    scan_result = MalwareScanResult.clean.value if is_clean else MalwareScanResult.positive.value

    version = ModelVersion(
        id=version_id,
        tenant_id=current.identity.tenant_id,
        model_id=model_id,
        version_label=version_label,
        file_hash=file_hash,
        file_size_bytes=size,
        declared_source=declared_source,
        declared_license=declared_license,
        base_model_version_id=base_model_version_id,
        known_limitations=known_limitations,
        malware_scan_result=scan_result,
        malware_scanned_at=datetime.now(UTC),
        hash_verified_at_import=datetime.now(UTC),
        imported_by=current.identity.id,
    )
    db.add(version)
    await db.flush()

    runtime_state = ModelRuntimeState(model_version_id=version_id, runtime_status=RuntimeStatus.stopped.value)
    db.add(runtime_state)

    if is_clean:
        await audit_emit(
            db,
            tenant_id=current.identity.tenant_id,
            event_type="model_version.imported",
            actor_identity_id=current.identity.id,
            resource_type="model_version",
            resource_id=version_id,
            payload={"file_hash": file_hash, "imported_by": str(current.identity.id)},
        )
        await db.commit()
        return version

    await audit_emit(
        db,
        tenant_id=current.identity.tenant_id,
        event_type="model_version.malware_scan_failed",
        actor_identity_id=current.identity.id,
        resource_type="model_version",
        resource_id=version_id,
        payload={"imported_by": str(current.identity.id), "clamd_response": scan_response},
        severity=Severity.security_critical,
    )
    await db.commit()
    # The row is kept (see models.py's docstring) but the import itself is
    # reported as failed — no override path, per models.md.
    raise HTTPException(
        status_code=422,
        detail=f"malware scan flagged this file, import blocked: {scan_response}",
    )


@router.get("/models/{model_id}/versions/{version_id}", response_model=ModelVersionOut)
async def get_model_version(
    model_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(get_current_identity),
):
    version = await db.get(ModelVersion, version_id)
    if version is None or version.model_id != model_id:
        raise NotFound(f"model version {version_id} not found under model {model_id}")
    return version


@router.post("/model-versions/{version_id}/start", response_model=ModelRuntimeStateOut)
async def start_model_version(
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role("ML Engineer", "Platform Administrator")),
):
    version = await db.get(ModelVersion, version_id)
    if version is None:
        raise NotFound(f"model version {version_id} not found")

    if version.malware_scan_result != MalwareScanResult.clean.value:
        raise Conflict(f"model version {version_id} did not pass malware scan and cannot be started")

    state = await db.get(ModelRuntimeState, version_id)
    if state is None:
        state = ModelRuntimeState(model_version_id=version_id)
        db.add(state)

    # Fail-closed re-verification, every start — see models.md.
    path = _gguf_path(version_id)
    try:
        actual_hash = await _compute_sha256(path)
    except FileNotFoundError:
        # The artifact was removed after import. Treated exactly like a
        # hash mismatch rather than allowed to surface as an unhandled 500:
        # both mean "the bytes that were approved are not the bytes here",
        # and an operator needs to be told which model is unusable, not
        # handed an opaque server error.
        actual_hash = None
    if actual_hash is None or actual_hash != version.file_hash:
        state.last_hash_reverify_result = "fail"
        state.runtime_status = RuntimeStatus.error.value
        state.process_error = (
            "artifact file missing at start-time re-verification"
            if actual_hash is None
            else "hash mismatch at start-time re-verification"
        )
        await audit_emit(
            db,
            tenant_id=version.tenant_id,
            event_type="model_version.hash_mismatch_detected",
            actor_identity_id=current.identity.id,
            resource_type="model_version",
            resource_id=version_id,
            payload={"expected_hash": version.file_hash, "actual_hash": actual_hash},
            severity=Severity.security_critical,
        )
        await db.commit()
        if actual_hash is None:
            raise Conflict(
                f"artifact file for model version {version_id} is missing — "
                "refusing to start (fail-closed)"
            )
        raise Conflict(f"hash mismatch for model version {version_id} — refusing to start (fail-closed)")

    state.last_hash_reverify_result = "pass"
    state.runtime_status = RuntimeStatus.starting.value
    await db.commit()

    model_name = ollama_model_name(version_id)
    try:
        await _ollama.create_model(model_name, path, actual_hash)
        await _ollama.generate_healthcheck(model_name)
    except OllamaError as exc:
        state.runtime_status = RuntimeStatus.error.value
        state.process_error = exc.reason
        await audit_emit(
            db,
            tenant_id=version.tenant_id,
            event_type="model_version.start_failed",
            actor_identity_id=current.identity.id,
            resource_type="model_version",
            resource_id=version_id,
            payload={"reason": exc.reason},
        )
        await db.commit()
        raise HTTPException(status_code=502, detail=f"model failed to start: {exc.reason}") from exc

    state.runtime_status = RuntimeStatus.running.value
    state.last_started_at = datetime.now(UTC)
    state.last_health_check_at = datetime.now(UTC)
    state.process_error = None
    await audit_emit(
        db,
        tenant_id=version.tenant_id,
        event_type="model_version.started",
        actor_identity_id=current.identity.id,
        resource_type="model_version",
        resource_id=version_id,
        payload={},
    )
    await db.commit()
    return await _to_runtime_state_out(db, state)


@router.post("/model-versions/{version_id}/stop", response_model=ModelRuntimeStateOut)
async def stop_model_version(
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role("ML Engineer", "Platform Administrator")),
):
    version = await db.get(ModelVersion, version_id)
    if version is None:
        raise NotFound(f"model version {version_id} not found")

    state = await db.get(ModelRuntimeState, version_id)
    if state is None or state.runtime_status == RuntimeStatus.stopped.value:
        if state is None:
            state = ModelRuntimeState(model_version_id=version_id)
            db.add(state)
            await db.commit()
        return await _to_runtime_state_out(db, state)  # idempotent no-op

    model_name = ollama_model_name(version_id)
    try:
        await _ollama.unload(model_name)
    except OllamaError:
        pass  # unload is best-effort; state below reflects our intent regardless

    state.runtime_status = RuntimeStatus.stopped.value
    state.last_stopped_at = datetime.now(UTC)
    await audit_emit(
        db,
        tenant_id=version.tenant_id,
        event_type="model_version.stopped",
        actor_identity_id=current.identity.id,
        resource_type="model_version",
        resource_id=version_id,
        payload={},
    )
    await db.commit()
    return await _to_runtime_state_out(db, state)


@router.get("/model-versions/{version_id}/runtime-state", response_model=ModelRuntimeStateOut)
async def get_runtime_state(
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(get_current_identity),
):
    state = await db.get(ModelRuntimeState, version_id)
    if state is None:
        raise NotFound(f"no runtime state for model version {version_id}")
    return await _to_runtime_state_out(db, state)
