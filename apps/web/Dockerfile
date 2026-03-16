# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN pnpm install --frozen-lockfile --filter @arbitex/web...

FROM deps AS builder
COPY . .
RUN pnpm --filter @arbitex/shared-types build
RUN pnpm --filter @arbitex/web build

FROM node:20-alpine AS runner
RUN addgroup --system --gid 1001 arbitex && \
    adduser --system --uid 1001 --ingroup arbitex arbitex
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=arbitex:arbitex /app/apps/web/.next/standalone ./
COPY --from=builder --chown=arbitex:arbitex /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=arbitex:arbitex /app/apps/web/public ./apps/web/public

USER arbitex
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
