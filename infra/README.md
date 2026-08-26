# Local dev environment

```
cd infra
docker compose up -d --build
```

Brings up Postgres, a self-hosted Keycloak, ClamAV, Ollama, Redis, the
backend and the frontend. Backend on `localhost:8000` (`/docs` for Swagger),
frontend on `localhost:3000`. Postgres, Redis, Ollama and ClamAV are not
published to the host; reach them with `docker compose exec`.

## First run

```
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed
```

## Credentials in this directory are dev-only, synthetic, and safe to commit

`keycloak/realm-export.json` seeds nine synthetic test users, all with
password `devpassword123`, and a confidential client secret
(`service-dev-secret`).

| Username | Role granted by `app.seed` |
|---|---|
| `platform-admin` | Platform Administrator |
| `ml-engineer-1` | ML Engineer |
| `app-developer-1` | Application Developer |
| `clinical-safety-1` | Clinical Safety Reviewer |
| `privacy-officer-1` | Privacy Officer |
| `security-admin-1` | Security Administrator |
| `ai-governance-officer-1` | AI Governance Officer |
| `compliance-officer-1` | Compliance Officer |
| `auditor-1` | Auditor |

Five of those are sign-off roles, so a full five-signer approval cycle can
be run end to end without granting anyone a second role. The tenth role,
`Clinician`, is the permitted-user role and has no seeded user: nothing in
the console is driven by one.

Per this project's synthetic-data rule,
these have zero relation to any real identity and zero value outside a local
Docker network. They're checked into version control deliberately, the same
way `identity.md` documented seeding test identities as a scripted, versioned
step rather than manual clicking. **Never reuse these values, or this
pattern, for a real deployment.** A real deployment points at a real
enterprise IdP or a hardened Keycloak instance with real secrets management
(ADR-0004).

## Talking to Keycloak from the host vs. from a container

Keycloak's issuer is **pinned** via `KC_HOSTNAME=http://localhost:8080` in
`docker-compose.yml`, so every token carries `iss =
http://localhost:8080/realms/hospital-platform` regardless of which network
path was used to reach Keycloak (docker-network hostname or the published
host port), and the backend validates against that same pinned value
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
would accept. See `identity.md`'s Revision Log for why this changed: it was
a real blocker for the frontend's browser-based login flow, which has no
docker-network access.

**If you have an existing local environment from before this change**: run
`docker compose exec backend python -m app.seed` once after pulling this
change. Identity lookup is keyed by `(issuer, external_subject)`, so pinning
the issuer orphans every previously-provisioned identity (including the
nine seeded test identities), so without a re-seed, logging in will
JIT-provision a fresh identity with zero roles instead of resolving to the
existing seeded one. The seed script is idempotent, so this is safe to run
any number of times.
