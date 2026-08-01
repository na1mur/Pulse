# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
COPY packages/validation/package.json packages/validation/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/eslint-config/package.json packages/eslint-config/

RUN pnpm install --frozen-lockfile --filter api...

COPY apps/api apps/api
COPY packages packages

RUN pnpm --filter api build

# Production stage
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
COPY packages/validation/package.json packages/validation/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/eslint-config/package.json packages/eslint-config/

RUN pnpm install --frozen-lockfile --prod --filter api...

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/packages packages

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["node", "dist/index.js"]
