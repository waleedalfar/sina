"""
Redis-backed fixed-window rate limiting — ADR-0005. Ephemeral by design,
never a durable Postgres entity (see gateway.md's Entities section).
"""

import uuid

import redis.asyncio as redis

from app.core.config import settings

_client = redis.from_url(settings.redis_url)


async def check_and_increment(identity_id: uuid.UUID, application_id: uuid.UUID) -> bool:
    """Returns True if the request is allowed, False if the caller has
    exceeded the window limit for this (identity, application) pair."""
    key = f"ratelimit:{identity_id}:{application_id}"
    count = await _client.incr(key)
    if count == 1:
        await _client.expire(key, settings.rate_limit_window_seconds)
    return count <= settings.rate_limit_requests
