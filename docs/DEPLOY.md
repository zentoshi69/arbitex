# ArbitEx — Production deployment (bitrunner3001.com)

## Pre-flight checklist

Before deploying, ensure:

- [ ] **DNS**: `bitrunner3001.com` and `api.bitrunner3001.com` point to your server IP ([docs/DNS_SETUP.md](./DNS_SETUP.md))
- [ ] **Firewall**: Ports 80 and 443 open (and 22 for SSH)
- [ ] **Hostinger VPS**: If using Hostinger, also open ports in hPanel → VPS → Network ([docs/HOSTINGER_SETUP.md](./HOSTINGER_SETUP.md))
- [ ] **Secrets**: `.env.prod` created from `.env.prod.example` with all `CHANGE_ME` values replaced
- [ ] **Login**: `OPERATOR_PASSWORD_HASH` or `OPERATOR_PASSWORD` set (see below)
- [ ] **Keystore**: `KEYSTORE_FILE_PATH` points to a valid encrypted keystore (or use `./infra/dev-keystore.json` for mock execution only)

## Prerequisites

- Docker & Docker Compose
- Domain `bitrunner3001.com` and `api.bitrunner3001.com` pointing to your server (or edit `infra/caddy/Caddyfile` and `infra/nginx/nginx.conf` for a different domain)
- Ports 80 and 443 open

## Required .env.prod values

| Variable | Required | Notes |
|----------|----------|-------|
| `POSTGRES_PASSWORD` | ✅ | Strong password for Postgres |
| `REDIS_PASSWORD` | ✅ | Strong password for Redis |
| `DATABASE_URL` | ✅ | `postgresql://arbitex:YOUR_POSTGRES_PASSWORD@postgres:5432/arbitex` |
| `REDIS_URL` | ✅ | `redis://:YOUR_REDIS_PASSWORD@redis:6379` |
| `JWT_SECRET` | ✅ | Min 32 random characters |
| `OPERATOR_API_KEY` | ✅ | Min 32 characters for API auth |
| `OPERATOR_PASSWORD_HASH` or `OPERATOR_PASSWORD` | ✅ | Dashboard login (see below) |

**RPC URLs**: `docker-compose.prod.yml` provides defaults for ETH, BSC, Polygon, Arbitrum, Base, and Avalanche. Override in `.env.prod` if using your own QuickNode/Alchemy URLs. Set `CHAIN_ID` to match your active chain (1=ETH, 43114=Avalanche, etc.).

## Option A: Caddy (recommended — auto TLS)

Caddy provisions Let's Encrypt certificates automatically.

```bash
# 1. Configure env
cp .env.prod.example .env.prod
cp .env.secrets.example .env.secrets
# Edit .env.prod — domains, ACME_EMAIL
# Edit .env.secrets — all secrets: DB, Redis, JWT, RPC URLs, keystore paths & passphrases

# 2. Create keystores (for production; skip if MOCK_EXECUTION=true)
pnpm install
pnpm run keystore:create execution   # Creates infra/secrets/execution-keystore.json
pnpm run keystore:create superadmin # Creates infra/secrets/superadmin-keystore.json
# Set EXECUTION_KEYSTORE_FILE, SUPERADMIN_KEYSTORE_FILE, and *_PASS in .env.secrets

# 3. Run migrations
docker compose -f docker-compose.prod.yml --env-file .env.prod --env-file .env.secrets --profile tools run --rm migrate

# 4. Start stack (loads both env files; .env.secrets overrides)
docker compose -f docker-compose.prod.yml --env-file .env.prod --env-file .env.secrets up -d

# 5. Verify
curl -s https://bitrunner3001.com | head -5
curl -s https://api.bitrunner3001.com/health | jq
```

## Option B: Nginx (manual TLS)

If you prefer Nginx, run it on the host and proxy to the app ports.

1. Start stack with Nginx override (disables Caddy, exposes api/web to localhost):
   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.prod-nginx.yml --env-file .env.prod up -d
   ```

2. Get certs:
   ```bash
   certbot certonly --standalone -d bitrunner3001.com -d api.bitrunner3001.com
   ```

3. Copy `infra/nginx/nginx.conf` to `/etc/nginx/sites-available/arbitex`, adjust upstream ports if needed, enable, reload nginx.

## Generate bcrypt hash for login

```bash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" "YourSecurePassword"
```

Set the output as `OPERATOR_PASSWORD_HASH` in `.env.prod`. Alternatively, set `OPERATOR_PASSWORD` (plain text) for dev/testing only — not recommended for production.

## URLs

| Service   | URL                              |
|----------|----------------------------------|
| Dashboard| https://bitrunner3001.com        |
| API      | https://api.bitrunner3001.com    |
| Health   | https://api.bitrunner3001.com/health |
| Metrics  | https://api.bitrunner3001.com/metrics |

## Troubleshooting

- **"couldn't find env file"**: Ensure `.env.prod` exists and you pass `--env-file .env.prod`.
- **Worker fails to start**: Check that the RPC URL for your `CHAIN_ID` is set (compose provides defaults; override in `.env.prod` if needed).
- **Caddy certificate errors**: Ensure DNS propagates and ports 80/443 are open. Check `docker compose logs caddy`.
- **Login not configured**: Set either `OPERATOR_PASSWORD_HASH` (bcrypt) or `OPERATOR_PASSWORD` (plain text).
