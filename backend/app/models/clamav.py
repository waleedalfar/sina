"""
Minimal async client for clamd's INSTREAM protocol — hand-rolled rather
than pulling in a third-party clamd client library, since the protocol is
a handful of lines and this avoids a dependency of uncertain maintenance
status for something this small. See models.md's malware-scan design
decision (hard block, no override).
"""

import asyncio
import contextlib
from collections.abc import AsyncIterator


class ScanUnavailable(Exception):
    """Raised when clamd can't be reached at all — distinct from a
    completed scan finding malware. Import should fail loudly here, not
    silently treat 'couldn't scan' as 'clean'."""


async def scan_bytes(host: str, port: int, data: bytes, chunk_size: int = 8192) -> tuple[bool, str]:
    """Returns (is_clean, raw_response_text)."""

    async def chunks():
        for i in range(0, len(data), chunk_size):
            yield data[i : i + chunk_size]

    return await _scan(host, port, chunks())


async def scan_file(host: str, port: int, path: str, chunk_size: int = 1024 * 1024) -> tuple[bool, str]:
    """Streams a file from disk: memory use is one chunk, whatever the
    file's size (ADR-0006)."""

    async def chunks():
        with open(path, "rb") as f:
            while chunk := await asyncio.to_thread(f.read, chunk_size):
                yield chunk

    return await _scan(host, port, chunks())


async def _scan(host: str, port: int, chunks: AsyncIterator[bytes]) -> tuple[bool, str]:
    try:
        reader, writer = await asyncio.open_connection(host, port)
    except OSError as exc:
        raise ScanUnavailable(f"could not connect to clamd at {host}:{port}: {exc}") from exc

    try:
        writer.write(b"zINSTREAM\0")
        async for chunk in chunks:
            writer.write(len(chunk).to_bytes(4, "big") + chunk)
            # Drain per chunk. Draining once at the end let the transport
            # buffer the entire file in memory before sending any of it.
            await writer.drain()
        writer.write((0).to_bytes(4, "big"))
        await writer.drain()
        response = await reader.read(4096)
    except OSError as exc:
        # clamd drops the connection mid-stream when a limit such as
        # StreamMaxLength is hit. No verdict was reached, so this is
        # "couldn't scan", never "clean".
        raise ScanUnavailable(f"clamd closed the connection mid-scan: {exc}") from exc
    finally:
        writer.close()
        with contextlib.suppress(OSError):
            await writer.wait_closed()

    text = response.decode(errors="replace").strip("\x00").strip()
    if not text:
        raise ScanUnavailable(f"empty response from clamd at {host}:{port}")
    is_clean = text.endswith("OK") and "FOUND" not in text
    return is_clean, text
