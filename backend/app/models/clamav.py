"""
Minimal async client for clamd's INSTREAM protocol — hand-rolled rather
than pulling in a third-party clamd client library, since the protocol is
a handful of lines and this avoids a dependency of uncertain maintenance
status for something this small. See models.md's malware-scan design
decision (hard block, no override).
"""

import asyncio


class ScanUnavailable(Exception):
    """Raised when clamd can't be reached at all — distinct from a
    completed scan finding malware. Import should fail loudly here, not
    silently treat 'couldn't scan' as 'clean'."""


async def scan_bytes(host: str, port: int, data: bytes, chunk_size: int = 8192) -> tuple[bool, str]:
    """Returns (is_clean, raw_response_text)."""
    try:
        reader, writer = await asyncio.open_connection(host, port)
    except OSError as exc:
        raise ScanUnavailable(f"could not connect to clamd at {host}:{port}: {exc}") from exc

    try:
        writer.write(b"zINSTREAM\0")
        for i in range(0, len(data), chunk_size):
            chunk = data[i : i + chunk_size]
            writer.write(len(chunk).to_bytes(4, "big") + chunk)
        writer.write((0).to_bytes(4, "big"))
        await writer.drain()
        response = await reader.read(4096)
    finally:
        writer.close()
        await writer.wait_closed()

    text = response.decode(errors="replace").strip("\x00").strip()
    if not text:
        raise ScanUnavailable(f"empty response from clamd at {host}:{port}")
    is_clean = text.endswith("OK") and "FOUND" not in text
    return is_clean, text
