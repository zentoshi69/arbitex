# ArbitEx — Cross-DEX Arbitrage Platform

[![CI](https://github.com/USERNAME/arbitex/actions/workflows/ci.yml/badge.svg)](https://github.com/USERNAME/arbitex/actions/workflows/ci.yml)

> **OPERATOR USE ONLY** — This system is designed exclusively for lawful,
> market-neutral statistical arbitrage. Read the [Legal Scope](#legal-scope)
> section before deploying.

## Quick Start (Local Dev)

```bash
# 1. Clone and install
pnpm install

# 2. Configure environment (from repo root)
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL, REDIS_URL, ETHEREUM_RPC_URL, JWT_SECRET, OPERATOR_API_KEY
# API and worker load .env.local automatically when run from root

# 3. Start infrastructure
docker compose up -d postgres redis

# 4. Run database migrations
pnpm db:migrate

# 5. Start all apps in dev mode
pnpm dev

# OR start individually:
pnpm --filter @arbitex/api dev       # API on :3001
pnpm --filter @arbitex/web dev       # Dashboard on :3000
pnpm --filter @arbitex/worker dev    # Worker
```

Dashboard: http://localhost:3000
API: http://localhost:3001
Prometheus: http://localhost:9090

---

## Monorepo Structure

```
arbitex/
├── apps/
│   ├── api/          NestJS REST + WebSocket API
│   ├── web/          Next.js 14 operator dashboard
│   └── worker/       BullMQ job processor
├── packages/
│   ├── config/       Zod-validated env config
│   ├── db/           Prisma schema + client
│   ├── chain/        viem clients, wallet, nonce manager
│   ├── dex-adapters/ Adapter interface + Uniswap V3 + Mock
│   ├── risk-engine/  Rule evaluator, kill switches
│   ├── opportunity-engine/  Pool indexer, spread calculator
│   ├── execution-engine/    TX lifecycle + simulator
│   └── shared-types/ Zod schemas, enums, error codes
├── infra/
│   ├── prometheus.yml
│   └── dev-keystore.json (placeholder)
├── docker-compose.yml
├── .env.example
└── vitest.config.ts
```

---

## Architecture

```
[DEX Adapters] → pool data → [Opportunity Engine]
                                      ↓
                            [Route Simulator] ← viem eth_call
                                      ↓
                             [Risk Engine] ← Redis state
                                      ↓
                          [Execution Engine] → [Flashbots Relay]
                                      ↓
                              [PostgreSQL + Redis]
                                      ↓
                      [NestJS API] ← REST + WebSocket
                                      ↓
                      [Next.js Dashboard] ← React + Recharts
```

**Opportunity lifecycle:**
`DETECTED → QUOTED → SIMULATED → APPROVED → SUBMITTED → LANDED/FAILED`

---

## Configuration

All environment variables are validated at startup via Zod.
Missing required variables cause an immediate descriptive error.

See `.env.example` for the full list. Critical variables:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `ETHEREUM_RPC_URL` | ✅ | Dedicated node recommended |
| `JWT_SECRET` | ✅ | Min 32 chars, never exposed to browser |
| `EXECUTION_WALLET_KEYSTORE_PATH` | worker only | Path to encrypted keystore |
| `FLASHBOTS_AUTH_KEY` | worker only | Private key for Flashbots auth |

**Security rules:**
- `NEXT_PUBLIC_*` variables: non-sensitive URLs only — **never keys**
- Private keys: keystore file + password only, loaded at runtime in worker
- No `.env` files in Docker images

---

## Running Tests

```bash
# All unit tests
pnpm test

# Specific package
pnpm --filter @arbitex/risk-engine test

# With coverage
pnpm test -- --coverage

# E2E (requires running stack)
pnpm test:e2e
```

---

## Risk Engine

The risk engine evaluates these rules on every opportunity before execution:

1. **KILL_SWITCH** — Global + per-chain halt flags (Redis)
2. **MAX_TRADE_SIZE** — USD ceiling per trade
3. **MIN_NET_PROFIT** — Absolute minimum net profit gate
4. **MAX_GAS_PRICE** — Gas price Gwei ceiling
5. **TOKEN_FLAGS** — FEE_ON_TRANSFER, HONEYPOT, PAUSED, BLACKLISTED
6. **TOKEN_COOLDOWN** — Post-anomaly cooldown period
7. **POOL_LIQUIDITY** — Minimum pool TVL
8. **FAILED_TX_RATE** — Auto-triggers global kill at threshold
9. **TOKEN_EXPOSURE** — Max simultaneous exposure per token

All rules are evaluated for every opportunity (non-short-circuit)
for full observability. Rejection reasons are stored in the DB.

---

## Security Checklist

- [ ] Replace `dev-keystore.json` with real encrypted keystore (never commit to git)
- [ ] Set `MOCK_EXECUTION=false` in production
- [ ] Configure `FLASHBOTS_AUTH_KEY` for private mempool submission
- [ ] Set `JWT_SECRET` to 256-bit random value
- [ ] Restrict CORS to dashboard origin only
- [ ] Run `pnpm audit` before every production deploy
- [ ] Docker containers run as non-root user (already configured)
- [ ] Never set `NEXT_PUBLIC_` variables to secrets

---

## Legal Scope

This platform is designed exclusively for **lawful, market-neutral
statistical arbitrage** — detecting price discrepancies across venues
and executing when net profit is clearly positive after all costs.

**Prohibited uses:**
- Sandwich attacks or any user-targeting MEV
- Spoofing or wash trading
- Manipulative liquidity extraction
- Any strategy that exploits counterparties unfairly

Operators assume full regulatory responsibility in their jurisdiction.

---

## Production Deployment

1. Build images: `docker compose build`
2. Set all production env vars (use AWS Secrets Manager / Vault)
3. Run migrations: `pnpm db:migrate`
4. Deploy with: `docker compose up -d`
5. Verify `/health` returns `{"status":"healthy"}`
6. Monitor Prometheus at `:9090`

For HSM/KMS signing (Phase 2), replace `loadWalletFromKeystore` in
`packages/chain/src/wallet.ts` with your KMS provider adapter.
