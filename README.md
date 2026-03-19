# ArbitEx — Cross-DEX Arbitrage Platform

[![CI](https://github.com/zentoshi69/arbitex/actions/workflows/ci.yml/badge.svg)](https://github.com/zentoshi69/arbitex/actions/workflows/ci.yml)

> **OPERATOR USE ONLY** — This system is designed exclusively for lawful,
> market-neutral statistical arbitrage. Read the [Legal Scope](#legal-scope)
> section before deploying.

## Quick Start (Local Dev)

```bash
# 1. Clone and install
pnpm install

# 2. Configure environment (from repo root)
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL, REDIS_URL, JWT_SECRET, OPERATOR_API_KEY, OPERATOR_PASSWORD or OPERATOR_PASSWORD_HASH
# RPC URLs: docker-compose provides defaults; set CHAIN_ID (1=ETH, 43114=Avalanche, etc.) for your active chain
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

### Fast start/stop scripts

After you’ve done the full bootstrap once, you can use:

```bash
# Foreground fast mode (no install/build/migrate)
./scripts/run-arbitex-fast.sh

# Or run it in background as a daemon
./scripts/arbitex.sh start
./scripts/arbitex.sh status
./scripts/arbitex.sh logs
./scripts/arbitex.sh stop
```

### macOS auto-run (LaunchAgent)

This will **start at login**, **restart on crash**, and write logs to files.

```bash
./scripts/launchd-install.sh
```

Uninstall:

```bash
./scripts/launchd-uninstall.sh
```

---

## Production deployment (VPS + Docker + HTTPS)

This repo includes a production Docker Compose stack in `docker-compose.prod.yml`:
- `web` (Next.js dashboard)
- `api` (NestJS + Fastify)
- `worker` (BullMQ worker)
- `postgres`, `redis`
- `caddy` reverse proxy with automatic TLS

### 1) Configure DNS

**Domain:** `bitrunner3001.com`  
**Nameservers:** `ns1.dns-parking.com`, `ns2.dns-parking.com`

At your DNS provider (where the nameservers point), add **A records**:
- `bitrunner3001.com` → your VPS public IP
- `api.bitrunner3001.com` → your VPS public IP

### 2) Create `.env.production`

Copy `.env.production.example` to `.env.production` and fill values (strong secrets, RPC URLs, keystore paths).

### 3) Put keystore files on the VPS

Place your JSON keystores on the VPS and set:
- `EXECUTION_KEYSTORE_FILE`
- `SUPERADMIN_KEYSTORE_FILE`

### 4) Deploy

On the VPS:

```bash
./scripts/deploy-vps.sh
```

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
| `*_RPC_URL` | ✅ for active chain | RPC for `CHAIN_ID` (1=ETH, 43114=Avalanche, etc.). docker-compose has defaults |
| `JWT_SECRET` | ✅ | Min 32 chars, never exposed to browser |
| `OPERATOR_PASSWORD_HASH` or `OPERATOR_PASSWORD` | ✅ | Dashboard login |
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

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for full deployment instructions (Caddy/Nginx, DNS, Hostinger VPS).

Quick steps:

1. `cp .env.prod.example .env.prod` and fill in secrets
2. `docker compose -f docker-compose.prod.yml --env-file .env.prod --profile tools run --rm migrate`
3. `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d`
4. Verify `https://api.bitrunner3001.com/health` returns `{"status":"healthy"}`

For HSM/KMS signing (Phase 2), replace `loadWalletFromKeystore` in
`packages/chain/src/wallet.ts` with your KMS provider adapter.
