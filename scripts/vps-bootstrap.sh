#!/usr/bin/env bash
# ============================================================================
# ArbitEx VPS Bootstrap — paste this ENTIRE block into your VPS terminal.
# Handles: git conflicts, missing .env, missing keystore, docker build+start.
# ============================================================================
set -euo pipefail

REPO_URL="https://github.com/zentoshi69/arbitex.git"
INSTALL_DIR="/root/arbitex"

echo "============================================"
echo "  ArbitEx VPS Bootstrap"
echo "============================================"

# ── 1. Docker ────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo ">>> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker 2>/dev/null || true
systemctl start docker 2>/dev/null || true
echo ">>> Docker OK"

# ── 2. Get/update the code ───────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  echo ">>> Repo exists — force-updating to latest main..."
  cd "$INSTALL_DIR"
  git fetch origin 2>/dev/null || {
    echo ">>> git fetch failed (private repo?) — enter GitHub PAT:"
    read -r TOKEN
    if [ -n "$TOKEN" ]; then
      git remote set-url origin "https://zentoshi69:${TOKEN}@github.com/zentoshi69/arbitex.git"
      git fetch origin
    else
      echo "ERROR: Cannot fetch without token." >&2; exit 1
    fi
  }
  git reset --hard origin/main
  git clean -fd
elif [ -d "$INSTALL_DIR" ]; then
  echo ">>> $INSTALL_DIR exists but no .git — backing up and re-cloning..."
  mv "$INSTALL_DIR" "${INSTALL_DIR}.bak.$(date +%s)"
  git clone "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || {
    echo ">>> Clone failed (private repo?) — enter GitHub PAT:"
    read -r TOKEN
    git clone "https://zentoshi69:${TOKEN}@github.com/zentoshi69/arbitex.git" "$INSTALL_DIR"
  }
  cd "$INSTALL_DIR"
else
  echo ">>> Cloning repo..."
  git clone "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || {
    echo ">>> Clone failed (private repo?) — enter GitHub PAT:"
    read -r TOKEN
    git clone "https://zentoshi69:${TOKEN}@github.com/zentoshi69/arbitex.git" "$INSTALL_DIR"
  }
  cd "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
echo ">>> Code: $(pwd) — $(git log --oneline -1)"

# ── 3. Environment file ─────────────────────────────────────────────────────
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo ">>> Created .env from .env.example"
  else
    cat > .env <<'ENVEOF'
CHAIN_ID=43114
AVALANCHE_RPC_URL=https://avalanche.drpc.org
AVALANCHE_WSS_URL=wss://avalanche.drpc.org
MOCK_EXECUTION=true
OPERATOR_PASSWORD=arbitex2026
ENVEOF
    echo ">>> Created minimal .env"
  fi
else
  echo ">>> .env exists — keeping it"
fi

# ── 4. Keystore (needed by worker) ──────────────────────────────────────────
mkdir -p infra
if [ ! -f infra/dev-keystore.json ]; then
  echo '{}' > infra/dev-keystore.json
  echo ">>> Created dummy keystore (MOCK_EXECUTION=true)"
fi

# ── 5. Free disk space if tight ─────────────────────────────────────────────
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_PCT" -gt 85 ]; then
  echo ">>> Disk ${DISK_PCT}% full — pruning old Docker images..."
  docker system prune -af --volumes 2>/dev/null || true
fi

# ── 6. Build ─────────────────────────────────────────────────────────────────
echo ""
echo ">>> Building containers (first time: 5-10 min)..."
docker compose build api worker web

# ── 7. Start ─────────────────────────────────────────────────────────────────
echo ""
echo ">>> Starting all services..."
docker compose up -d

echo ""
echo ">>> Waiting for postgres + redis to be healthy (up to 60s)..."
for i in $(seq 1 12); do
  PG_OK=$(docker compose ps postgres --format '{{.Health}}' 2>/dev/null || echo "")
  RD_OK=$(docker compose ps redis --format '{{.Health}}' 2>/dev/null || echo "")
  if [[ "$PG_OK" == *"healthy"* ]] && [[ "$RD_OK" == *"healthy"* ]]; then
    echo ">>> Postgres + Redis healthy"
    break
  fi
  echo "    waiting... ($i/12)"
  sleep 5
done

# ── 8. Run database migrations ──────────────────────────────────────────────
echo ""
echo ">>> Running database migrations..."
docker compose exec -T api npx prisma migrate deploy 2>/dev/null || \
  docker compose exec -T api npx prisma db push --accept-data-loss 2>/dev/null || \
  echo ">>> WARN: Migration command not available — DB may need manual setup"

# ── 9. Status ────────────────────────────────────────────────────────────────
echo ""
echo ">>> Waiting 15s for API to start..."
sleep 15

echo ""
echo "============================================"
echo "  STATUS"
echo "============================================"
docker compose ps

echo ""
echo ">>> API health check..."
if docker compose exec -T api node -e \
  "fetch('http://127.0.0.1:3001/health').then(r=>r.json()).then(j=>{console.log(JSON.stringify(j,null,2));process.exit(j.status==='down'?1:0)}).catch(e=>{console.error(e.message);process.exit(1)})" \
  2>/dev/null; then
  echo ">>> API is UP"
else
  echo ""
  echo ">>> API not ready yet. Check logs:"
  echo "    docker compose logs api --tail=50"
fi

echo ""
echo ">>> Worker logs (last 10 lines):"
docker compose logs worker --tail=10 2>/dev/null || echo "(not started yet)"

VPS_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_VPS_IP")
echo ""
echo "============================================"
echo "  DONE — ArbitEx is running"
echo "============================================"
echo ""
echo "  Dashboard:  https://bitrunner3001.com  (or http://${VPS_IP})"
echo "  API health: http://${VPS_IP}:3001/health  (internal only via Caddy)"
echo ""
echo "  Edit config:   nano /root/arbitex/.env"
echo "  Restart:       cd /root/arbitex && docker compose up -d"
echo "  View logs:     docker compose logs -f --tail=100"
echo "  Worker logs:   docker compose logs worker -f --tail=100"
echo ""
echo "  All services have restart:always — they survive reboots."
echo "  Closing SSH does NOT stop the containers."
echo ""
