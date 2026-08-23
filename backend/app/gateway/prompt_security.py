"""
Blocked, not just logged — see gateway.md's Design decision (amended
2026-08-23, closing the handoff to `evaluation` that doc's original
Revision Log left open). The underlying filter is still the same small,
bypassable keyword list it always was — `evaluation`'s prompt_injection
category exists now to validate detection quality over time, but nothing
here got smarter. Blocking on it is a deliberate product decision to
accept the known false-positive risk on legitimate clinical language,
not a claim that the risk went away.
"""

_SUSPICIOUS_PATTERNS = (
    "ignore previous instructions",
    "ignore all previous instructions",
    "disregard previous instructions",
    "disregard prior instructions",
    "you are now",
    "reveal your instructions",
    "reveal your system prompt",
    "what is your system prompt",
)


def flag_suspicious(text: str) -> bool:
    return detect_suspicious(text) is not None


def detect_suspicious(text: str) -> str | None:
    """Returns the matched pattern (real audit detail — which phrase
    triggered it), or None if nothing matched."""
    lowered = text.lower()
    for pattern in _SUSPICIOUS_PATTERNS:
        if pattern in lowered:
            return pattern
    return None
