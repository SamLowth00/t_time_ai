# Base image must match the playwright version pinned in poetry.lock (1.58.0).
# A mismatch silently breaks the Chrome DevTools Protocol at runtime — page loads
# look fine until you try to drive them and selectors return None. Bump in lockstep.
# This image already ships Chromium + every system lib it needs.
FROM mcr.microsoft.com/playwright/python:v1.58.0-jammy

WORKDIR /app

# Install Poetry. No virtualenv inside the container — the container itself is
# the isolation boundary, so a venv would just add an activation step for nothing.
RUN pip install --no-cache-dir poetry==1.8.3 \
 && poetry config virtualenvs.create false

# Copy dep files FIRST, install, THEN copy source. Standard Docker layer-cache trick:
# the (slow) `poetry install` layer is only rebuilt when pyproject.toml or poetry.lock
# actually change. Editing app/ code → only the cheap last layer rebuilds.
COPY pyproject.toml poetry.lock ./
RUN poetry install --no-interaction --no-ansi --no-root

COPY app ./app

# Railway injects $PORT at runtime; 8000 is just the local-docker-run default.
ENV PORT=8000
EXPOSE 8000

# --workers 1 ───── jobs live in this process's memory (JOBS dict, asyncio queues,
#                   the semaphore). Multiple workers each have their own copy →
#                   SSE subscribers would land on the wrong worker and 404.
# --proxy-headers ──┬─ tells uvicorn to trust X-Forwarded-For and rewrite
# --forwarded-     ─┘  request.client.host from it. Without these flags the rate
#   allow-ips="*"      limiter sees Railway's proxy IP for every request and
#                      every user collapses into one bucket.
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --proxy-headers --forwarded-allow-ips="*"
