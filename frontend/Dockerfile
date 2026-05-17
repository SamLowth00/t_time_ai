# ─── Build stage ─────────────────────────────────────────────────────────
# Use a full Node image (with all build tools) to install deps and run Vite.
FROM node:20-alpine AS build
WORKDIR /app

# Copy lockfile + package.json FIRST so this layer is only rebuilt when
# dependencies actually change. Source-only changes reuse the install cache.
# `npm ci` is the CI/prod cousin of `npm install` — it installs the EXACT
# versions from package-lock.json (errors if the lock and json disagree),
# never updates the lockfile, and is faster than `install` in fresh environments.
COPY package.json package-lock.json ./
RUN npm ci

# Now the source — cheap layer, changes often.
COPY . .

# Vite reads VITE_* env vars at BUILD TIME and bakes their values into the
# JS bundle. So this value is fixed for the lifetime of this image — if the
# backend URL ever changes, the image must be rebuilt (not just re-run).
# Railway passes env vars to the build automatically; the ARG declares
# explicitly that the build expects it (and gives Dockerfile-readers a hint).
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build       # outputs to /app/dist

# ─── Serve stage ─────────────────────────────────────────────────────────
# Fresh, smaller image just for serving — no node_modules, no source, just
# the compiled `dist/` output and a tiny static-file server.
FROM node:20-alpine
WORKDIR /app

# Install `serve` globally. Tiny package; its sole job is to send files.
# (We pin a major version so we don't get surprises from a future breaking change.)
RUN npm install -g serve@14

# Bring across ONLY the build output. No tsconfig, no source, no dev deps,
# no React in node_modules — those served their purpose in stage 1. The
# final image is whatever-base-image-size + a few hundred KB of static files.
COPY --from=build /app/dist ./dist

# Railway injects $PORT at runtime; 3000 is the local-docker-run default.
ENV PORT=3000
EXPOSE 3000

# -s ── SPA mode: serve index.html for unmatched routes (so react-router-dom
#        works on a hard refresh of /discover).
# -l ── port to listen on.
# `exec` so SIGTERM from Railway reaches `serve` directly, allowing clean
# shutdown rather than the shell catching the signal and dying first.
CMD exec serve -s dist -l $PORT
