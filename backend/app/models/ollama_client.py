"""
Thin client for the local Ollama runtime (ADR-0001). MVP 0.1 treats Ollama
as a single shared runtime process — "starting" a ModelVersion means
registering it with Ollama (from the GGUF file already on the shared
volume) and confirming it actually loads with a minimal generate call;
"stopping" means telling Ollama not to keep it resident in memory. This is
deliberately not per-version container orchestration — see models.md's
explicit deferral of GPU scheduling/multi-instance serving to Phase 2+.
"""

import asyncio
import os

import httpx


class OllamaError(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


# Per-operation timeouts, not whole-request ones. The read timeouts are
# long because each is a single wait on Ollama doing real work: verifying a
# multi-GB blob's digest after upload, or loading one into memory for the
# first time (ADR-0006).
_CREATE_TIMEOUT = httpx.Timeout(180, read=900)
_HEALTHCHECK_TIMEOUT = httpx.Timeout(60, read=600)


async def _file_chunks(path: str, chunk_size: int = 1024 * 1024):
    """Streams from disk so a 16 GiB artifact never sits in memory."""
    with open(path, "rb") as f:
        while chunk := await asyncio.to_thread(f.read, chunk_size):
            yield chunk


class OllamaClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    async def create_model(self, name: str, gguf_path: str, sha256_digest: str) -> None:
        """
        Ollama's modern /api/create no longer accepts a raw filesystem path
        (verified empirically against a live v0.32 instance — its own docs
        confirm this: GGUF import requires pushing the file as a
        content-addressed blob first, then referencing it by digest in
        `files`). Reuses the sha256 this module already computed at
        import/start-time re-verification rather than letting Ollama
        recompute its own.
        """
        async with httpx.AsyncClient(timeout=_CREATE_TIMEOUT) as client:
            # Check existence first (Ollama's own documented pattern) —
            # re-PUTting an already-known digest hit an empty-response
            # connection reset against a live v0.32 server during testing
            # (the server appears to short-circuit and close the connection
            # before the client finishes streaming the body). Skipping the
            # redundant push avoids that race entirely rather than papering
            # over it with a retry.
            try:
                head = await client.head(f"{self.base_url}/api/blobs/sha256:{sha256_digest}")
            except httpx.HTTPError as exc:
                raise OllamaError(f"could not reach Ollama (blob check): {exc}") from exc

            if head.status_code != 200:
                try:
                    r = await client.post(
                        f"{self.base_url}/api/blobs/sha256:{sha256_digest}",
                        content=_file_chunks(gguf_path),
                        # Explicit, so httpx sends a sized body rather than
                        # chunked transfer encoding.
                        headers={"Content-Length": str(os.path.getsize(gguf_path))},
                    )
                except httpx.HTTPError as exc:
                    raise OllamaError(f"could not reach Ollama (blob push): {exc}") from exc
                if r.status_code not in (200, 201):
                    raise OllamaError(f"Ollama blob push failed ({r.status_code}): {r.text}")

            try:
                r = await client.post(
                    f"{self.base_url}/api/create",
                    json={
                        "model": name,
                        "files": {"model.gguf": f"sha256:{sha256_digest}"},
                        "stream": False,
                    },
                )
            except httpx.HTTPError as exc:
                raise OllamaError(f"could not reach Ollama (create): {exc}") from exc
        if r.status_code != 200:
            raise OllamaError(f"Ollama /api/create failed ({r.status_code}): {r.text}")

    async def generate_healthcheck(self, name: str) -> None:
        """Confirms the model actually loads and can produce output —
        not just that /api/create returned 200."""
        async with httpx.AsyncClient(timeout=_HEALTHCHECK_TIMEOUT) as client:
            try:
                r = await client.post(
                    f"{self.base_url}/api/generate",
                    json={"model": name, "prompt": "Hello", "stream": False, "options": {"num_predict": 4}},
                )
            except httpx.HTTPError as exc:
                raise OllamaError(f"could not reach Ollama: {exc}") from exc
        if r.status_code != 200:
            raise OllamaError(f"Ollama /api/generate failed ({r.status_code}): {r.text}")

    async def unload(self, name: str) -> None:
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                await client.post(
                    f"{self.base_url}/api/generate",
                    json={"model": name, "prompt": "", "stream": False, "keep_alive": 0},
                )
            except httpx.HTTPError as exc:
                raise OllamaError(f"could not reach Ollama: {exc}") from exc

    async def chat(
        self, name: str, messages: list[dict], max_tokens: int | None = None
    ) -> dict:
        """Used by `gateway` for actual inference requests — see
        gateway.md's Model Routing step. Non-streaming only for MVP 0.1."""
        options = {"num_predict": max_tokens} if max_tokens else {}
        async with httpx.AsyncClient(timeout=120) as client:
            try:
                r = await client.post(
                    f"{self.base_url}/api/chat",
                    json={"model": name, "messages": messages, "stream": False, "options": options},
                )
            except httpx.HTTPError as exc:
                raise OllamaError(f"could not reach Ollama (chat): {exc}") from exc
        if r.status_code != 200:
            raise OllamaError(f"Ollama /api/chat failed ({r.status_code}): {r.text}")
        return r.json()
