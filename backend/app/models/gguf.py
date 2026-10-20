"""
GGUF structural validation — ADR-0006.

A bounded, read-only parse of the header and tensor index. It never reads
tensor data, so it costs the same for a 90 MB file as a 16 GB one. This is
attack surface (it parses an untrusted upload), so every count and length
is capped before anything is allocated, and anything unexpected is a
refusal rather than a best guess.

What it establishes: the file is a well-formed GGUF whose tensors all lie
inside it, aligned, with nothing appended after them. What it does not:
that the weights are benign, or that the chat template is. The template is
returned so a person can look at it.
"""

import hashlib
import os
import struct
from dataclasses import dataclass

MAX_TENSORS = 65_536
MAX_KV = 65_536
MAX_STRING_BYTES = 16 * 1024 * 1024
MAX_ARRAY_LEN = 10_000_000
MAX_DIMS = 4

# ggml type id -> (block size in elements, bytes per block). From ggml's
# type traits. A type not listed here is refused: without its size the
# tensor's extent in the file can't be checked.
GGML_TYPES: dict[int, tuple[int, int]] = {
    0: (1, 4),  # F32
    1: (1, 2),  # F16
    2: (32, 18),  # Q4_0
    3: (32, 20),  # Q4_1
    6: (32, 22),  # Q5_0
    7: (32, 24),  # Q5_1
    8: (32, 34),  # Q8_0
    9: (32, 36),  # Q8_1
    10: (256, 84),  # Q2_K
    11: (256, 110),  # Q3_K
    12: (256, 144),  # Q4_K
    13: (256, 176),  # Q5_K
    14: (256, 210),  # Q6_K
    15: (256, 292),  # Q8_K
    16: (256, 66),  # IQ2_XXS
    17: (256, 74),  # IQ2_XS
    18: (256, 98),  # IQ3_XXS
    19: (256, 50),  # IQ1_S
    20: (32, 18),  # IQ4_NL
    21: (256, 110),  # IQ3_S
    22: (256, 82),  # IQ2_S
    23: (256, 136),  # IQ4_XS
    24: (1, 1),  # I8
    25: (1, 2),  # I16
    26: (1, 4),  # I32
    27: (1, 8),  # I64
    28: (1, 8),  # F64
    29: (256, 56),  # IQ1_M
    30: (1, 2),  # BF16
    34: (256, 54),  # TQ1_0
    35: (256, 66),  # TQ2_0
}

# GGUF metadata value types -> struct format for the fixed-size ones.
_SCALARS = {0: "B", 1: "b", 2: "H", 3: "h", 4: "I", 5: "i", 6: "f", 7: "?", 10: "Q", 11: "q", 12: "d"}
_STRING, _ARRAY = 8, 9


class GGUFInvalid(Exception):
    """The file is not a well-formed GGUF. The message says why."""


@dataclass
class GGUFInfo:
    version: int
    tensor_count: int
    chat_template: str | None

    @property
    def chat_template_sha256(self) -> str | None:
        if self.chat_template is None:
            return None
        return hashlib.sha256(self.chat_template.encode()).hexdigest()


class _Reader:
    def __init__(self, f, size: int):
        self._f = f
        self.size = size

    def take(self, n: int) -> bytes:
        data = self._f.read(n)
        if len(data) != n:
            raise GGUFInvalid("file ends inside the header")
        return data

    def unpack(self, fmt: str):
        return struct.unpack("<" + fmt, self.take(struct.calcsize("<" + fmt)))[0]

    def string(self) -> bytes:
        n = self.unpack("Q")
        if n > MAX_STRING_BYTES:
            raise GGUFInvalid(f"metadata string of {n} bytes exceeds the {MAX_STRING_BYTES} limit")
        return self.take(n)

    def tell(self) -> int:
        return self._f.tell()


def _read_value(r: _Reader, vtype: int, depth: int = 0):
    if vtype in _SCALARS:
        return r.unpack(_SCALARS[vtype])
    if vtype == _STRING:
        return r.string()
    if vtype == _ARRAY:
        if depth >= 2:
            raise GGUFInvalid("metadata arrays nested too deeply")
        item_type = r.unpack("I")
        n = r.unpack("Q")
        if n > MAX_ARRAY_LEN:
            raise GGUFInvalid(f"metadata array of {n} items exceeds the {MAX_ARRAY_LEN} limit")
        if item_type in _SCALARS:
            # Skipped, not materialised: nothing here needs numeric arrays.
            r.take(n * struct.calcsize("<" + _SCALARS[item_type]))
            return None
        for _ in range(n):
            _read_value(r, item_type, depth + 1)
        return None
    raise GGUFInvalid(f"unknown metadata value type {vtype}")


def validate(path: str) -> GGUFInfo:
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        r = _Reader(f, size)
        if r.take(4) != b"GGUF":
            raise GGUFInvalid("not a GGUF file (bad magic)")
        version = r.unpack("I")
        if version not in (2, 3):
            raise GGUFInvalid(f"unsupported GGUF version {version}")
        tensor_count = r.unpack("Q")
        kv_count = r.unpack("Q")
        if not 0 < tensor_count <= MAX_TENSORS:
            raise GGUFInvalid(f"tensor count {tensor_count} out of range")
        if kv_count > MAX_KV:
            raise GGUFInvalid(f"metadata count {kv_count} out of range")

        alignment = 32
        chat_template: str | None = None
        for _ in range(kv_count):
            key = r.string()
            vtype = r.unpack("I")
            value = _read_value(r, vtype)
            if key == b"general.alignment":
                if vtype != 4 or not value or value & (value - 1):
                    raise GGUFInvalid("general.alignment must be a power-of-two uint32")
                alignment = value
            elif key == b"tokenizer.chat_template":
                if vtype != _STRING:
                    raise GGUFInvalid("tokenizer.chat_template is not a string")
                try:
                    chat_template = value.decode("utf-8")
                except UnicodeDecodeError as exc:
                    raise GGUFInvalid("tokenizer.chat_template is not valid UTF-8") from exc

        tensors = []
        for _ in range(tensor_count):
            name = r.string()
            n_dims = r.unpack("I")
            if not 0 < n_dims <= MAX_DIMS:
                raise GGUFInvalid(f"tensor {name[:64]!r} has {n_dims} dimensions")
            dims = [r.unpack("Q") for _ in range(n_dims)]
            ggml_type = r.unpack("I")
            offset = r.unpack("Q")
            if ggml_type not in GGML_TYPES:
                raise GGUFInvalid(f"tensor {name[:64]!r} has unsupported type {ggml_type}")
            block, block_bytes = GGML_TYPES[ggml_type]
            elements = 1
            for d in dims:
                if d == 0:
                    raise GGUFInvalid(f"tensor {name[:64]!r} has a zero dimension")
                elements *= d
            if dims[0] % block:
                raise GGUFInvalid(f"tensor {name[:64]!r} row length is not a multiple of its block size")
            if offset % alignment:
                raise GGUFInvalid(f"tensor {name[:64]!r} data is not aligned")
            tensors.append((offset, elements // block * block_bytes))

        header_end = r.tell()
        data_start = -(-header_end // alignment) * alignment
        data_end = 0
        for offset, nbytes in tensors:
            end = data_start + offset + nbytes
            if end > size:
                raise GGUFInvalid("a tensor's data extends past the end of the file")
            data_end = max(data_end, end)
        if size - data_end > alignment:
            raise GGUFInvalid(f"{size - data_end} unexpected bytes after the last tensor")

    return GGUFInfo(version=version, tensor_count=tensor_count, chat_template=chat_template)
