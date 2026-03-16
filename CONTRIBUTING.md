# Contributing to ArbitEx

Thanks for your interest. This doc covers how to get the repo running and how we work.

## Prerequisites

- **Node.js** ≥ 20 (use `.nvmrc`: `nvm use`)
- **pnpm** ≥ 9
- **Docker** (for Postgres + Redis locally)

## Setup

```bash
pnpm install
cp .env.example .env.local   # edit with your RPC URL and secrets
docker compose up -d postgres redis
pnpm db:migrate
pnpm dev
```

## Commands

| Command | Description |
|--------|-------------|
| `pnpm dev` | Run API, web, worker in dev |
| `pnpm test` | Run all unit tests |
| `pnpm test:e2e` | E2E (stack must be running) |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | TypeScript check |
| `pnpm build` | Build all packages and apps |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:studio` | Open Prisma Studio |

## Workflow

1. Branch from `main` or `develop`.
2. Make changes; keep commits focused.
3. Ensure `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.
4. Open a PR with the template filled. CI must be green.
5. No force-push to shared branches after review.

## Code style

- TypeScript strict mode.
- Prettier for formatting (run `pnpm format`).
- ESLint for linting. Fix before pushing.
- Prefer `workspace:*` for internal deps; pin major for external.

## Security

- Never commit `.env`, `.env.local`, or real keystores.
- Don’t add secrets in `NEXT_PUBLIC_*` or in frontend code.
- For security issues, see [SECURITY.md](.github/SECURITY.md).

## Legal

This project is for lawful, market-neutral statistical arbitrage only. See the [Legal Scope](README.md#legal-scope) in the README.
