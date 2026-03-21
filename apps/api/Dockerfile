# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN echo "shamefully-hoist=true" > .npmrc
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
RUN apk add --no-cache openssl
RUN addgroup --system --gid 1001 arbitex && \
    adduser --system --uid 1001 --ingroup arbitex arbitex
WORKDIR /app

# Copy external deps (flat hoisted node_modules)
COPY --from=builder /app/node_modules ./node_modules
# Copy built workspace packages
COPY --from=builder /app/packages ./packages
# Copy API dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Re-link workspace packages so @arbitex/* resolves to packages/*
RUN rm -rf node_modules/@arbitex && mkdir -p node_modules/@arbitex && \
    for pkg in shared-types config db chain risk-engine; do \
      ln -sf ../../packages/$pkg node_modules/@arbitex/$pkg; \
    done

RUN chown -R arbitex:arbitex /app
USER arbitex
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "apps/api/dist/bootstrap.js"]
