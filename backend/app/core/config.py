from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central config. See ADR-0001/0004 for why these values look the way
    they do (self-hosted Postgres, self-hosted OIDC via Keycloak, no
    external SaaS dependency).
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Runtime connection — the restricted `app_runtime` role (no UPDATE/DELETE
    # on audit_event; see audit.md's two-layer tamper-evidence design and the
    # migration that creates this role).
    database_url: str = (
        "postgresql+asyncpg://app_runtime:app_runtime_dev_password@postgres:5432/hospital_platform"
    )
    # Migrations run as the Postgres superuser — creating/granting the
    # app_runtime role and revoking its privileges on audit_event both
    # require elevated privileges the runtime role must never have.
    migrations_database_url: str = "postgresql+asyncpg://postgres:postgres@postgres:5432/hospital_platform"
    app_runtime_password: str = "app_runtime_dev_password"

    # OIDC — per ADR-0004, the backend is a relying party only. It never
    # sees a password. issuer/jwks come from Keycloak regardless of
    # whether Keycloak holds its own users or federates a real IdP later.
    # `oidc_issuer` must match Keycloak's pinned KC_HOSTNAME (see
    # docker-compose.yml), not necessarily the hostname used to reach it —
    # `oidc_jwks_url` is a separate, internal-only fetch path and can stay
    # on the docker-network hostname.
    oidc_issuer: str = "http://localhost:8080/realms/hospital-platform"
    oidc_jwks_url: str = "http://keycloak:8080/realms/hospital-platform/protocol/openid-connect/certs"
    oidc_audience: str = "hospital-platform-backend"

    # frontend module — comma-separated allowed browser origins for CORS.
    # The frontend is a browser SPA talking to this API cross-origin (it
    # authenticates directly against Keycloak, not through this backend),
    # so this is required, not optional, once a frontend exists.
    cors_allowed_origins: str = "http://localhost:3000"

    # Default single tenant for MVP 0.1 — see core-entities.md.
    default_tenant_id: str = "00000000-0000-0000-0000-000000000000"

    # models module — see models.md.
    clamav_host: str = "clamav"
    clamav_port: int = 3310
    ollama_base_url: str = "http://ollama:11434"
    model_storage_dir: str = "/models"

    # gateway module — see gateway.md and ADR-0005.
    redis_url: str = "redis://redis:6379/0"
    rate_limit_requests: int = 60
    rate_limit_window_seconds: int = 60
    gateway_max_prompt_chars: int = 20000
    gateway_max_output_chars: int = 20000


settings = Settings()
