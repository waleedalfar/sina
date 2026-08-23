"""
The two hand-rolled infrastructure clients, and the seed script.

Both clients sit on the fail-closed path: a malware scanner that cannot be
reached must never read as "clean", and an inference backend that errors
must surface as an error rather than an empty completion. Those are exactly
the branches that never run in a healthy environment, so they are the ones
worth testing deliberately.
"""

import asyncio
import uuid

import httpx
import pytest

from app.models.clamav import ScanUnavailable, scan_bytes
from app.models.ollama_client import OllamaClient, OllamaError


# --- ClamAV INSTREAM client -------------------------------------------


class _FakeWriter:
    def __init__(self):
        self.written = b""
        self.closed = False

    def write(self, data):
        self.written += data

    async def drain(self):
        return None

    def close(self):
        self.closed = True

    async def wait_closed(self):
        return None


class _FakeReader:
    def __init__(self, response: bytes):
        self._response = response

    async def read(self, n):
        return self._response


def _fake_connection(response: bytes, writer=None):
    async def _open(host, port):
        return _FakeReader(response), writer or _FakeWriter()

    return _open


@pytest.mark.parametrize(
    "response,expected_clean",
    [
        (b"stream: OK\x00", True),
        (b"stream: Eicar-Test-Signature FOUND\x00", False),
        # Defensive: a response that both ends in OK and mentions FOUND must
        # not be read as clean.
        (b"stream: Something FOUND but also OK", False),
    ],
)
async def test_scan_result_parsing(monkeypatch, response, expected_clean):
    monkeypatch.setattr(asyncio, "open_connection", _fake_connection(response))
    is_clean, text = await scan_bytes("clamav", 3310, b"payload")
    assert is_clean is expected_clean, text


async def test_unreachable_clamd_raises_rather_than_returning_clean(monkeypatch):
    """The single most dangerous failure mode in this module: treating
    'could not scan' as 'nothing found'."""

    async def _refuse(host, port):
        raise OSError("connection refused")

    monkeypatch.setattr(asyncio, "open_connection", _refuse)
    with pytest.raises(ScanUnavailable):
        await scan_bytes("clamav", 3310, b"payload")


async def test_an_empty_clamd_response_is_not_treated_as_clean(monkeypatch):
    monkeypatch.setattr(asyncio, "open_connection", _fake_connection(b"\x00  \x00"))
    with pytest.raises(ScanUnavailable):
        await scan_bytes("clamav", 3310, b"payload")


async def test_the_stream_is_chunked_and_terminated(monkeypatch):
    """A missing zero-length terminator leaves clamd waiting forever."""
    writer = _FakeWriter()
    monkeypatch.setattr(asyncio, "open_connection", _fake_connection(b"stream: OK\x00", writer))
    await scan_bytes("clamav", 3310, b"x" * 20000, chunk_size=8192)

    assert writer.written.startswith(b"zINSTREAM\x00")
    assert writer.written.endswith((0).to_bytes(4, "big"))
    assert writer.closed, "the connection was left open"


# --- Ollama client ----------------------------------------------------


def _client_with(handler):
    """An OllamaClient whose HTTP calls are served by `handler`."""
    client = OllamaClient("http://ollama:11434")
    transport = httpx.MockTransport(handler)
    client._transport = transport  # noqa: SLF001 — test seam
    return client, transport


async def test_chat_surfaces_a_transport_failure_as_ollama_error(monkeypatch):
    async def _boom(*a, **kw):
        raise httpx.ConnectError("no route to host")

    monkeypatch.setattr(httpx.AsyncClient, "post", _boom)
    client = OllamaClient("http://ollama:11434")
    with pytest.raises(OllamaError) as exc:
        await client.chat("m", [{"role": "user", "content": "hi"}], 10)
    assert "could not reach" in str(exc.value).lower()


async def test_chat_surfaces_a_non_200_as_ollama_error(monkeypatch):
    class _Resp:
        status_code = 500
        text = "internal error"

        def json(self):
            return {}

    async def _post(*a, **kw):
        return _Resp()

    monkeypatch.setattr(httpx.AsyncClient, "post", _post)
    client = OllamaClient("http://ollama:11434")
    with pytest.raises(OllamaError) as exc:
        await client.chat("m", [{"role": "user", "content": "hi"}], 10)
    assert "500" in str(exc.value)


async def test_healthcheck_failure_is_an_ollama_error(monkeypatch):
    async def _boom(*a, **kw):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx.AsyncClient, "post", _boom)
    client = OllamaClient("http://ollama:11434")
    with pytest.raises(OllamaError):
        await client.generate_healthcheck("m")


# --- Seed script ------------------------------------------------------


async def test_seed_is_idempotent(db, tenant):
    """It is documented as safe to re-run, and the docs tell operators to do
    exactly that after an issuer change. If a second run duplicated roles or
    identities that advice would be actively harmful."""
    from sqlalchemy import func, select

    from app.identity.models import Identity, Role
    from app.seed import seed as seed_main

    await seed_main()
    roles_after_first = (await db.execute(select(func.count()).select_from(Role))).scalar()
    identities_after_first = (await db.execute(select(func.count()).select_from(Identity))).scalar()

    await seed_main()
    roles_after_second = (await db.execute(select(func.count()).select_from(Role))).scalar()
    identities_after_second = (await db.execute(select(func.count()).select_from(Identity))).scalar()

    assert roles_after_second == roles_after_first, "re-seeding duplicated roles"
    assert identities_after_second == identities_after_first, "re-seeding duplicated identities"


async def test_seed_respects_the_separation_of_duties_matrix(db):
    """A previous session found the seed script granting role combinations
    its own conflict matrix forbids. Asserted here so it cannot recur."""
    from sqlalchemy import select

    from app.identity.models import Identity, Role, RoleAssignment
    from app.identity.roles import find_conflicting_kind
    from app.seed import seed as seed_main

    await seed_main()

    rows = (
        await db.execute(
            select(RoleAssignment.identity_id, Role.kind)
            .join(Role, Role.id == RoleAssignment.role_id)
            .where(RoleAssignment.revoked_at.is_(None))
        )
    ).all()

    held: dict[uuid.UUID, set[str]] = {}
    for identity_id, kind in rows:
        held.setdefault(identity_id, set()).add(kind)

    for identity_id, kinds in held.items():
        for kind in kinds:
            others = kinds - {kind}
            conflict = find_conflicting_kind(kind, others)
            assert conflict is None, f"seeded identity {identity_id} holds {kind} with {conflict}"
