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

# Allowance for the multipart envelope around the artifact itself.
_MULTIPART_OVERHEAD = 1024 * 1024


@app.middleware("http")
async def _refuse_oversized_model_upload(request: Request, call_next):
    """ADR-0006's ceiling, applied before the body is read. Starlette parses
    the whole multipart body before the handler runs, so the handler's own
    check comes after the bytes are already on disk; this stops a declared
    oversize upload at the door. Registered before CORS on purpose: the
    middleware added last is outermost, and CORS has to wrap this response
    for a browser to see the 413 rather than a network error. A chunked
    upload has no Content-Length and is caught by the handler instead."""
    if request.method == "POST" and request.url.path.startswith("/api/v1/models/") and request.url.path.endswith(
        "/versions"
    ):
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > settings.model_max_upload_bytes + _MULTIPART_OVERHEAD:
            return JSONResponse(
                status_code=413,
                content={"detail": f"artifact exceeds the {settings.model_max_upload_bytes}-byte import ceiling"},
            )
    return await call_next(request)


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
