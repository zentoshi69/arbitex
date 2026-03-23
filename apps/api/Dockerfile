# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN echo "shamefully-hoist=true" > .npmrc && \
    pnpm install --filter @arbitex/api... && \
    pnpm store prune

FROM deps AS builder
COPY . .
RUN pnpm --filter @arbitex/shared-types build && \
    pnpm --filter @arbitex/config build && \
    pnpm --filter @arbitex/db generate && \
    pnpm --filter @arbitex/db build && \
    pnpm --filter @arbitex/chain build && \
    pnpm --filter @arbitex/dex-adapters build && \
    pnpm --filter @arbitex/risk-engine build && \
    pnpm --filter @arbitex/accumulation-engine build && \
    pnpm --filter @arbitex/conversion-engine build && \
    pnpm --filter @arbitex/api build

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl && \
    addgroup --system --gid 1001 arbitex && \
    adduser --system --uid 1001 --ingroup arbitex arbitex
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist

RUN rm -rf node_modules/@arbitex && mkdir -p node_modules/@arbitex && \
    for pkg in shared-types config db chain dex-adapters risk-engine accumulation-engine conversion-engine; do \
      ln -sf ../../packages/$pkg node_modules/@arbitex/$pkg; \
    done && \
    chown -R arbitex:arbitex /app

USER arbitex
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/api/dist/bootstrap.js"]
