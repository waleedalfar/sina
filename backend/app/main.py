from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.audit.router import router as audit_router
from app.core.exceptions import AuthenticationFailed, Conflict, NotFound, PolicyDenied
from app.identity.router import router as identity_router

app = FastAPI(title="Hospital Platform Backend", version="0.1.0")


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


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
