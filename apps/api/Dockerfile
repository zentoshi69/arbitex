# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN pnpm install --filter @arbitex/api...

# ── Builder ───────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN pnpm --filter @arbitex/shared-types build
RUN pnpm --filter @arbitex/config build
RUN pnpm --filter @arbitex/db generate
RUN pnpm --filter @arbitex/db build || true
RUN pnpm --filter @arbitex/chain build
RUN pnpm --filter @arbitex/risk-engine build || true
RUN pnpm --filter @arbitex/api build || true

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN addgroup --system --gid 1001 arbitex && \
    adduser --system --uid 1001 --ingroup arbitex arbitex
WORKDIR /app

COPY --from=builder --chown=arbitex:arbitex /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=arbitex:arbitex /app/node_modules ./node_modules
COPY --from=builder --chown=arbitex:arbitex /app/packages ./packages

USER arbitex
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "apps/api/dist/bootstrap.js"]
