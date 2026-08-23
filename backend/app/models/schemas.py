import uuid
from datetime import datetime

from pydantic import BaseModel


class ModelIn(BaseModel):
    name: str
    description: str | None = None


class ModelUpdateIn(BaseModel):
    """Both fields optional — a PATCH applies only what's set. There is no
    version-level analogue on purpose: a `ModelVersion` is an immutable
    record of an imported artifact (hash, scan result, imported_by), and
    `risk_classification`, the one mutable thing about it, is owned by
    `governance`'s own endpoint."""

    name: str | None = None
    description: str | None = None


class ModelOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ModelVersionOut(BaseModel):
    id: uuid.UUID
    model_id: uuid.UUID
    version_label: str
    format: str
    file_hash: str
    file_size_bytes: int
    declared_source: str | None
    declared_license: str | None
    base_model_version_id: uuid.UUID | None
    known_limitations: str | None
    risk_classification: str | None
    malware_scan_result: str
    malware_scanned_at: datetime | None
    imported_by: uuid.UUID
    imported_at: datetime

    model_config = {"from_attributes": True}


class ModelRuntimeStateOut(BaseModel):
    model_version_id: uuid.UUID
    runtime_status: str
    last_started_at: datetime | None
    last_stopped_at: datetime | None
    last_health_check_at: datetime | None
    last_hash_reverify_result: str | None
    memory_used_mb: int | None
    process_error: str | None
    # Closed gap: this was deliberately omitted until `governance` existed
    # to check against. It does now — computed in the router (needs a DB
    # query governance owns), not stored here.
    production_eligible: bool

    model_config = {"from_attributes": True}
