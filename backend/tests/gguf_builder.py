"""
Builds small, genuinely valid GGUF files for tests, plus deliberately broken
variants. Real model files are gigabytes; the validator's job is structural,
so a few-hundred-byte file with the same structure exercises the same code.
"""

import struct

F32, Q8_0 = 0, 8


def _string(b: bytes) -> bytes:
    return struct.pack("<Q", len(b)) + b


def build_gguf(
    chat_template: str | None = "{{ messages }}",
    tensors: list[tuple[str, list[int], int]] | None = None,
    alignment: int = 32,
    trailing: bytes = b"",
    truncate: int = 0,
    magic: bytes = b"GGUF",
    misalign: bool = False,
) -> bytes:
    tensors = tensors if tensors is not None else [("w", [32, 2], F32), ("q", [64], Q8_0)]
    sizes = {F32: (1, 4), Q8_0: (32, 34)}

    kv = [
        _string(b"general.architecture") + struct.pack("<I", 8) + _string(b"test"),
        _string(b"general.alignment") + struct.pack("<I", 4) + struct.pack("<I", alignment),
        # A string array, as tokenizer vocabularies are, so that path runs.
        _string(b"tokenizer.ggml.tokens") + struct.pack("<IIQ", 9, 8, 2) + _string(b"a") + _string(b"b"),
    ]
    if chat_template is not None:
        kv.append(_string(b"tokenizer.chat_template") + struct.pack("<I", 8) + _string(chat_template.encode()))

    infos, data, offset = [], b"", 0
    for name, dims, ggml_type in tensors:
        block, block_bytes = sizes.get(ggml_type, (1, 4))
        n = 1
        for d in dims:
            n *= d
        nbytes = n // block * block_bytes
        off = offset + (1 if misalign else 0)
        infos.append(
            _string(name.encode())
            + struct.pack("<I", len(dims))
            + b"".join(struct.pack("<Q", d) for d in dims)
            + struct.pack("<IQ", ggml_type, off)
        )
        data += b"\x00" * (off - len(data)) + b"\x01" * nbytes
        offset = -(-(off + nbytes) // alignment) * alignment

    header = magic + struct.pack("<IQQ", 3, len(tensors), len(kv)) + b"".join(kv) + b"".join(infos)
    header += b"\x00" * (-len(header) % alignment)
    blob = header + data + trailing
    return blob[: len(blob) - truncate] if truncate else blob
