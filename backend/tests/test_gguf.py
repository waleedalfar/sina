"""
GGUF structural validation (ADR-0006). The validator parses untrusted
uploads, so each refusal it promises is pinned here. It was also checked
against real SmolLM2 Q4_0 and Qwen2.5 Q4_K_M / Q8_0 files during live
verification; these synthetic files cover the malformed cases real ones
never exercise.
"""

import hashlib
import struct

import pytest

from app.models.gguf import GGUFInvalid, validate
from tests.gguf_builder import F32, build_gguf


def _write(tmp_path, data: bytes):
    p = tmp_path / "m.gguf"
    p.write_bytes(data)
    return str(p)


def test_a_well_formed_file_passes_and_yields_its_template(tmp_path):
    info = validate(_write(tmp_path, build_gguf(chat_template="{{ hi }}")))
    assert info.version == 3
    assert info.tensor_count == 2
    assert info.chat_template == "{{ hi }}"
    assert info.chat_template_sha256 == hashlib.sha256(b"{{ hi }}").hexdigest()


def test_a_file_without_a_template_has_none(tmp_path):
    info = validate(_write(tmp_path, build_gguf(chat_template=None)))
    assert info.chat_template is None and info.chat_template_sha256 is None


@pytest.mark.parametrize(
    "data,reason",
    [
        (b"not a model at all", "bad magic"),
        (build_gguf(magic=b"GGML"), "bad magic"),
        (build_gguf(truncate=8), "past the end"),
        (build_gguf(trailing=b"\x00" * 64), "after the last tensor"),
        (build_gguf(misalign=True), "not aligned"),
        (build_gguf(tensors=[("x", [4], 99)]), "unsupported type"),
        (build_gguf(tensors=[]), "tensor count"),
        (build_gguf(tensors=[("x", [0], F32)]), "zero dimension"),
        (build_gguf(alignment=24), "power-of-two"),
        (b"GGUF" + struct.pack("<I", 3), "ends inside the header"),
    ],
)
def test_malformed_files_are_refused_with_a_reason(tmp_path, data, reason):
    with pytest.raises(GGUFInvalid, match=reason):
        validate(_write(tmp_path, data))


def test_an_oversized_length_is_refused_before_anything_is_allocated(tmp_path):
    """A declared 2^63-byte string must be refused on its length, not read."""
    data = b"GGUF" + struct.pack("<IQQ", 3, 1, 1) + struct.pack("<Q", 2**63)
    with pytest.raises(GGUFInvalid, match="exceeds"):
        validate(_write(tmp_path, data))


def test_an_unsupported_version_is_refused(tmp_path):
    data = bytearray(build_gguf())
    data[4:8] = struct.pack("<I", 99)
    with pytest.raises(GGUFInvalid, match="version"):
        validate(_write(tmp_path, bytes(data)))
