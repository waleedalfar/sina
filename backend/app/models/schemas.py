import uuid
from datetime import datetime

from pydantic import BaseModel


class ModelIn(BaseModel):
    name: str
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
    # production_eligible is intentionally NOT included yet — it's a
    # computed check against governance.GovernanceApproval, which doesn't
    # exist in code yet (governance is the next module in the build order).
    # Adding a hardcoded placeholder here would be misleading; omitted
    # until governance.md's write path actually exists to check against.

    model_config = {"from_attributes": True}
