"""
Shared exception types every module raises for policy/state failures.
This is the "shape of the interface" system-overview.md describes:
a check that can DENY a request with a reason, kept consistent now so the
Phase 2+ versioned policy engine can replace what's behind it without a
breaking rework of callers.
"""


class AuthenticationFailed(Exception):
    """Maps to 401. Raised for missing/invalid/expired tokens or a
    deactivated identity — distinct from PolicyDenied (403), which is for
    an authenticated identity that isn't allowed to do a specific thing."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


class PolicyDenied(Exception):
    """Maps to 403. Raised for authorization/policy failures — wrong role,
    suspended resource, unapproved model, etc."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


class Conflict(Exception):
    """Maps to 409. Raised for structural conflicts — e.g. a role grant
    that violates the separation-of-duties matrix, a duplicate sign-off."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


class NotFound(Exception):
    """Maps to 404."""

    def __init__(self, reason: str = "not found"):
        self.reason = reason
        super().__init__(reason)
