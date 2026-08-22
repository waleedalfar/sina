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

Keycloak's issuer is **pinned** via `KC_HOSTNAME=http://localhost:8080` in
`docker-compose.yml`, so every token carries `iss =
http://localhost:8080/realms/hospital-platform` regardless of which network
path was used to reach Keycloak (docker-network hostname or the published
host port) — the backend validates against that same pinned value
(`OIDC_ISSUER`). This means tokens can now be obtained either way:

```
# from the host (what the frontend's browser-based OIDC flow does)
curl -s -X POST \
  http://localhost:8080/realms/hospital-platform/protocol/openid-connect/token \
  -d grant_type=password -d client_id=hospital-platform-web \
  -d username=platform-admin -d password=devpassword123

# from inside the docker network (equivalent, still works)
docker compose exec backend curl -s -X POST \
  http://keycloak:8080/realms/hospital-platform/protocol/openid-connect/token \
  -d grant_type=password -d client_id=hospital-platform-web \
  -d username=platform-admin -d password=devpassword123
```

Before this pin, only the docker-network path produced a token the backend
would accept — see `identity.md`'s Revision Log for why this changed (it
was a real blocker for the frontend's browser-based login flow, which has
no docker-network access).

**If you have an existing local environment from before this change**: run
`docker compose exec backend python -m app.seed` once after pulling this
change. Identity lookup is keyed by `(issuer, external_subject)` — pinning
the issuer orphans every previously-provisioned identity (including the
ten seeded test identities), so without a re-seed, logging in will
JIT-provision a fresh identity with zero roles instead of resolving to the
existing seeded one. The seed script is idempotent, so this is safe to run
any number of times.
