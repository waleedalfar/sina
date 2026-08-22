from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.audit.router import router as audit_router
from app.core.config import settings
from app.core.exceptions import AuthenticationFailed, Conflict, NotFound, PolicyDenied
from app.dashboard.router import router as dashboard_router
from app.evaluation.router import router as evaluation_router
from app.gateway.router import router as gateway_router
from app.governance.router import router as governance_router
from app.identity.router import router as identity_router
from app.models.router import router as models_router

app = FastAPI(title="Hospital Platform Backend", version="0.1.0")

# The frontend is a browser SPA that authenticates directly against
# Keycloak (never routing tokens through this backend) and then calls this
# API cross-origin — see frontend.md. Bearer-token auth means credentials
# aren't needed on these requests, so this stays a plain origin allowlist.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_allowed_origins.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AuthenticationFailed)
async def _auth_failed_handler(request: Request, exc: AuthenticationFailed):
    return JSONResponse(status_code=401, content={"detail": exc.reason})


@app.exception_handler(PolicyDenied)
async def _policy_denied_handler(request: Request, exc: PolicyDenied):
    return JSONResponse(status_code=403, content={"detail": exc.reason})


@app.exception_handler(NotFound)
async def _not_found_handler(request: Request, exc: NotFound):
    return JSONResponse(status_code=404, content={"detail": exc.reason})


@app.exception_handler(Conflict)
async def _conflict_handler(request: Request, exc: Conflict):
    return JSONResponse(status_code=409, content={"detail": exc.reason})


app.include_router(identity_router)
app.include_router(audit_router)
app.include_router(models_router)
app.include_router(governance_router)
app.include_router(gateway_router)
app.include_router(evaluation_router)
app.include_router(dashboard_router)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
