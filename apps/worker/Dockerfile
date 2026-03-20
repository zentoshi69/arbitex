# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/ ./packages/
RUN pnpm install --filter @arbitex/worker...

FROM deps AS builder
COPY . .
RUN pnpm -r --filter @arbitex/shared-types build
RUN pnpm --filter @arbitex/config build
RUN pnpm --filter @arbitex/db generate
RUN pnpm --filter @arbitex/db build || true
RUN pnpm --filter @arbitex/chain build
RUN pnpm --filter @arbitex/dex-adapters build || true
RUN pnpm --filter @arbitex/risk-engine build || true
RUN pnpm --filter @arbitex/opportunity-engine build || true
RUN pnpm --filter @arbitex/execution-engine build || true
RUN pnpm --filter @arbitex/worker build || true

FROM node:20-alpine AS runner
# Never run as root
RUN addgroup --system --gid 1001 arbitex && \
    adduser --system --uid 1001 --ingroup arbitex arbitex
WORKDIR /app

COPY --from=builder --chown=arbitex:arbitex /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=arbitex:arbitex /app/node_modules ./node_modules
COPY --from=builder --chown=arbitex:arbitex /app/packages ./packages

USER arbitex
ENV NODE_ENV=production

CMD ["node", "apps/worker/dist/index.js"]
