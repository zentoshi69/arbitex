# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/ ./packages/
RUN echo "shamefully-hoist=true" > .npmrc
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
RUN addgroup --system --gid 1001 arbitex && \
    adduser --system --uid 1001 --ingroup arbitex arbitex
WORKDIR /app

# Copy external deps (flat hoisted node_modules)
COPY --from=builder --chown=arbitex:arbitex /app/node_modules ./node_modules
# Copy built workspace packages
COPY --from=builder --chown=arbitex:arbitex /app/packages ./packages
# Copy worker dist
COPY --from=builder --chown=arbitex:arbitex /app/apps/worker/dist ./apps/worker/dist

# Re-link workspace packages so @arbitex/* resolves to packages/*
RUN rm -rf node_modules/@arbitex && mkdir -p node_modules/@arbitex && \
    for pkg in shared-types config db chain dex-adapters risk-engine opportunity-engine execution-engine; do \
      ln -sf ../../packages/$pkg node_modules/@arbitex/$pkg; \
    done

RUN chown -R arbitex:arbitex /app
USER arbitex
ENV NODE_ENV=production

CMD ["node", "apps/worker/dist/index.js"]
