# ArbitEx on Hostinger VPS

Quick setup for deploying ArbitEx on a Hostinger VPS. See [DEPLOY.md](./DEPLOY.md) for full deployment docs.

## Step 1: Create .env.prod (fixes "couldn't find env file")

```bash
cd /root/arbitex
cp .env.prod.example .env.prod
nano .env.prod   # or: vi .env.prod
```

Edit these (replace CHANGE_ME with real values):

- `POSTGRES_PASSWORD` = pick a strong password (e.g. `MyStr0ngP@ss123`)
- `REDIS_PASSWORD` = pick a strong password
- `DATABASE_URL` = `postgresql://arbitex:YOUR_POSTGRES_PASSWORD@postgres:5432/arbitex`
- `REDIS_URL` = `redis://:YOUR_REDIS_PASSWORD@redis:6379`
- `JWT_SECRET` = at least 32 random characters
- `OPERATOR_API_KEY` = at least 32 characters

**Login password** — use ONE of:
- `OPERATOR_PASSWORD_HASH` = bcrypt hash (recommended). Generate with:
  ```bash
  node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" "YourSecurePassword"
  ```
- `OPERATOR_PASSWORD` = plain text (dev only, not recommended for production)

RPC URLs have defaults in docker-compose; override in `.env.prod` if using your own QuickNode/Alchemy URLs.

Save and exit (Ctrl+X, then Y, then Enter in nano).

---

## Step 2: Open firewall ports (Hostinger VPS)

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp   # keep SSH open!
sudo ufw enable
sudo ufw status
```

---

## Step 3: Run migrations and start the stack

```bash
cd /root/arbitex

# Run database migrations
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile tools run --rm migrate

# Start everything
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

---

## Step 4: If Hostinger firewall blocks you

Hostinger has a **network firewall** in their panel. If ports still don't work:

1. Log in to [hPanel](https://hpanel.hostinger.com)
2. Go to **VPS** → your server → **Network** or **Firewall**
3. Add rules to allow **port 80** and **port 443** (incoming)
4. Or use **Reset firewall configuration** if something is wrong

---

## Step 5: Verify

```bash
# Check containers are running
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# Check Caddy got a certificate
docker compose -f docker-compose.prod.yml --env-file .env.prod logs caddy | tail -20
```

Then open in browser:

- https://bitrunner3001.com
- https://api.bitrunner3001.com/health
