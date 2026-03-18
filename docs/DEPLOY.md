# ArbitEx — Production deployment (bitrunnar3001.com)

## Prerequisites

- Docker & Docker Compose
- Domain `bitrunnar3001.com` and `api.bitrunnar3001.com` pointing to your server
- Ports 80 and 443 open

## Option A: Caddy (recommended — auto TLS)

Caddy provisions Let's Encrypt certificates automatically.

```bash
# 1. Configure env
cp .env.prod.example .env.prod
# Edit .env.prod — set all CHANGE_ME values, OPERATOR_PASSWORD_HASH, etc.

# 2. Run migrations
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile tools run --rm migrate

# 3. Start stack
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 4. Verify
curl -s https://bitrunnar3001.com | head -5
curl -s https://api.bitrunnar3001.com/health | jq
```

## Option B: Nginx (manual TLS)

If you prefer Nginx, run it on the host and proxy to the app ports.

1. Start stack with Nginx override (disables Caddy, exposes api/web to localhost):
   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.prod-nginx.yml --env-file .env.prod up -d
   ```

2. Get certs:
   ```bash
   certbot certonly --standalone -d bitrunnar3001.com -d api.bitrunnar3001.com
   ```

4. Copy `infra/nginx/nginx.conf` to `/etc/nginx/sites-available/arbitex`, adjust upstream ports if needed, enable, reload nginx.

## Generate bcrypt hash for login

```bash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" "YourSecurePassword"
```

Set the output as `OPERATOR_PASSWORD_HASH` in `.env.prod`.

## URLs

| Service   | URL                              |
|----------|----------------------------------|
| Dashboard| https://bitrunnar3001.com        |
| API      | https://api.bitrunnar3001.com    |
| Health   | https://api.bitrunnar3001.com/health |
| Metrics  | https://api.bitrunnar3001.com/metrics |
