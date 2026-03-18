# ArbitEx — Troubleshooting Guide

This guide helps you fix deployment issues step by step.

---

## Issue 1: Prisma migration fails (OpenSSL / schema engine)

### Symptoms
```
prisma:warn Prisma failed to detect the libssl/openssl version to use...
Error: Could not parse schema engine response: SyntaxError: Unexpected token 'E', "Error load"... is not valid JSON
```

### Cause
Prisma's schema engine binary doesn't work correctly on Alpine Linux or minimal Node images due to OpenSSL detection issues.

### Solution (already applied in code)

Two fixes were made:

1. **`packages/db/prisma/schema.prisma`** — Added `binaryTargets = ["native", "debian-openssl-3.0.x"]` so Prisma uses the correct engine for Debian.
2. **`infra/Dockerfile.migrate`** — Changed base image from `node:20-alpine` to `node:20-bookworm` (full Debian) so OpenSSL 3.x is available.

### Steps to run on your VPS

```bash
# 1. Go to project directory
cd /root/arbitex

# 2. Pull latest code (if you use git)
git pull origin main

# 3. Rebuild the migrate image (no cache = fresh build)
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile tools build --no-cache migrate

# 4. Run migrations
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile tools run --rm migrate
```

If step 4 succeeds, you'll see output like:
```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "arbitex"...
X migrations applied.
```

---

## Issue 2: Git push rejected (non-fast-forward)

### Symptoms
```
! [rejected] main -> main (non-fast-forward)
error: failed to push some refs to 'https://github.com/zentoshi69/arbitex.git'
hint: Updates were rejected because a pushed branch tip is behind its remote counterpart.
```

### Cause
Your local `main` branch has different commits than `origin/main`. Someone (or you from another machine) pushed to GitHub, so your local branch is behind.

### Solution options

**Option A: Pull and merge, then push (recommended)**
```bash
cd /root/arbitex
git fetch origin
git checkout main
git pull origin main
# Resolve any merge conflicts if prompted
git push origin main
```

**Option B: Force push (⚠️ overwrites remote — use only if you're sure)**
```bash
git push origin main --force
```
This discards whatever is on GitHub and replaces it with your local `main`. Only use if you don't need the remote changes.

---

## Issue 3: Full stack not running (only Postgres up)

### Symptoms
- `docker compose ps` shows only `arbitex-postgres-1`
- No `api`, `web`, `caddy`, `redis`, or `worker` containers

### Cause
The stack was never fully started, or the build failed before other services could start.

### Solution

```bash
cd /root/arbitex

# 1. Ensure migrations ran successfully first (see Issue 1)
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile tools run --rm migrate

# 2. Start the full stack (builds images if needed)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 3. Check status
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

All services should show `Up` or `Up (healthy)`.

---

## Issue 4: .env.prod not configured

### Symptoms
- Containers fail to start
- "couldn't find env file" or validation errors

### Required values in `.env.prod`

| Variable | Example / Notes |
|----------|-----------------|
| `POSTGRES_PASSWORD` | Strong password (e.g. `MyStr0ngP@ss123`) |
| `REDIS_PASSWORD` | Strong password |
| `DATABASE_URL` | `postgresql://arbitex:YOUR_POSTGRES_PASSWORD@postgres:5432/arbitex` |
| `REDIS_URL` | `redis://:YOUR_REDIS_PASSWORD@redis:6379` |
| `JWT_SECRET` | At least 32 random characters |
| `OPERATOR_API_KEY` | At least 32 characters |
| `OPERATOR_PASSWORD_HASH` or `OPERATOR_PASSWORD` | For dashboard login |

### Generate bcrypt hash for login
```bash
node -e "console.log(require('bcryptjs').hashSync('YourPassword', 12))"
```
Put the output in `OPERATOR_PASSWORD_HASH` in `.env.prod`.

---

## Complete deployment checklist

Run these in order on your VPS:

```bash
cd /root/arbitex

# 1. Ensure .env.prod exists and is filled in
cat .env.prod | grep -E "POSTGRES_PASSWORD|REDIS_PASSWORD|JWT_SECRET|OPERATOR" | head -5
# (Should NOT show CHANGE_ME or empty values)

# 2. Run migrations
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile tools build --no-cache migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile tools run --rm migrate

# 3. Start full stack
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 4. Verify
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl -s https://api.bitrunner3001.com/health | jq
```

---

## If something still fails

**Migrations fail:**
- Check `infra/Dockerfile.migrate` uses `FROM node:20-bookworm`
- Check `packages/db/prisma/schema.prisma` has `binaryTargets = ["native", "debian-openssl-3.0.x"]`
- Run with `--no-cache` to force a clean build

**API/Worker fail to start:**
- Check logs: `docker compose -f docker-compose.prod.yml --env-file .env.prod logs api`
- Ensure RPC URL for your `CHAIN_ID` is set (compose has defaults for ETH, BSC, Polygon, Arbitrum, Base, Avalanche)

**Site not reachable:**
- DNS: `dig +short bitrunner3001.com` and `dig +short api.bitrunner3001.com` should return your server IP
- Firewall: Ports 80 and 443 must be open (UFW + Hostinger hPanel if applicable)
