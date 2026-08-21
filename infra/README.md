# Local dev environment

```
cd infra
docker compose up --build
```

Brings up Postgres, a self-hosted Keycloak (ADR-0004), and the backend.

## First run

```
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed
```

## Credentials in this directory are dev-only, synthetic, and safe to commit

`keycloak/realm-export.json` seeds five synthetic test users (`platform-admin`,
`ml-engineer-1`, `app-developer-1`, `clinical-safety-1`, `auditor-1`, all
password `devpassword123`) and a confidential client secret
(`service-dev-secret`). Per `DEVELOPMENT_RULES.md`'s synthetic-data rule,
these have zero relation to any real identity and zero value outside a local
Docker network — they're checked into version control deliberately, the same
way `identity.md` documented seeding test identities as a scripted, versioned
step rather than manual clicking. **Never reuse these values, or this
pattern, for a real deployment** — a real deployment points at a real
enterprise IdP or a hardened Keycloak instance with real secrets management
(ADR-0004).

## Talking to Keycloak from the host vs. from a container

Keycloak's issuer claim is derived from the request's Host header. The
backend validates tokens against `http://keycloak:8080/realms/hospital-platform`
(the docker-network hostname) — so **always obtain test tokens from inside
the docker network**, not by hitting `localhost:8080` from the host, or the
`iss` claim won't match and validation will fail. E.g.:

```
docker compose exec backend curl -s -X POST \
  http://keycloak:8080/realms/hospital-platform/protocol/openid-connect/token \
  -d grant_type=password -d client_id=hospital-platform-web \
  -d username=platform-admin -d password=devpassword123
```
