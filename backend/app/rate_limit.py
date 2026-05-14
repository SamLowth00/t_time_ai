import os

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# Storage backend: Redis when REDIS_URL is set (prod, or local-with-container);
# in-memory otherwise (zero-setup local dev). Same code, only the storage string changes.
STORAGE_URI = os.environ.get("REDIS_URL", "memory://")

# Enabled by default — fail safe. Set RATE_LIMIT_ENABLED=false in backend/.env to
# turn limiting off for local dev so rapid iteration doesn't trip 429s. Anything
# other than the literal "false" leaves it on, so prod can never accidentally
# disable it by omitting the var.
RATE_LIMIT_ENABLED = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() != "false"

# In prod behind Railway's proxy, uvicorn must run with --proxy-headers so
# request.client.host is rewritten from X-Forwarded-For. Then get_remote_address
# returns the real client IP. Locally there is no proxy, so it returns 127.0.0.1.
# headers_enabled=True adds X-RateLimit-Limit / -Remaining / -Reset to responses
# and lets the exception carry a Retry-After hint.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=STORAGE_URI,
    headers_enabled=True,
    enabled=RATE_LIMIT_ENABLED,
)


def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    # exc.limit is the specific limit that tripped (e.g. the 5/hour rather than the
    # 20/day). get_expiry() is that limit's window length in seconds — a safe
    # upper-bound value for Retry-After.
    retry_after = exc.limit.limit.get_expiry()
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"},
        headers={"Retry-After": str(retry_after)},
    )
