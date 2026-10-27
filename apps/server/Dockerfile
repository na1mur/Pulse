# syntax=docker/dockerfile:1
#
# The Pulse server image (OPS-01, T1.3). The build context is the repository root:
#   docker build -f apps/server/Dockerfile -t pulse-server .
# infra/docker-compose.yml does exactly that. Documentation: docs/operations/deployment.md.
#
# Node: keep NODE_VERSION equal to .node-version (scripts/deploy-smoke.test.mjs checks it).
# pnpm: installed by Corepack from the `packageManager` field of package.json, so the version is
# written in one place only.

ARG NODE_VERSION=24.15.0

# ---- build: install, compile, and cut a production-only copy of the server ----------------------
FROM node:${NODE_VERSION}-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
RUN corepack enable
WORKDIR /repo

# Manifests first: this layer (and the install below) is reused until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/contract/package.json packages/contract/package.json
RUN --mount=type=cache,id=pulse-pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store --filter "@pulse/server..."

COPY tsconfig.base.json ./
COPY packages/contract packages/contract
COPY apps/server apps/server
# The server imports the contract through its built `dist`; `nest build` also copies the SQL
# migrations next to the compiled code (nest-cli.json assets).
RUN pnpm --filter @pulse/contract run build \
    && pnpm --filter @pulse/server run build
# Production dependencies only, with the workspace contract copied in as a real package. `--legacy`:
# the workspace does not use injected workspace packages (pnpm 10+ refuses a plain deploy otherwise).
RUN --mount=type=cache,id=pulse-pnpm-store,target=/pnpm-store \
    pnpm --filter @pulse/server deploy --legacy --prod --store-dir /pnpm-store /out

# ---- runtime ------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
# Only what runs: the compiled server and its production dependencies (the deploy folder also
# holds sources and configs). Owned by root, so the server cannot change its own code.
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
# `node` (uid 1000) comes with the base image and has no write access to /app.
USER node
EXPOSE 3000
# /health runs a database query, so a server that lost its database reports unhealthy (503).
# Node's own fetch instead of curl or wget: nothing extra to install, and a real exit code.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
