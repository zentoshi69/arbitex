#!/usr/bin/env bash
# ============================================================================
# ArbitEx VPS Bootstrap — paste this ENTIRE block into your VPS terminal.
# It handles: git conflicts, missing .env, missing keystore, docker build+start.
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
systemctl enable docker
systemctl start docker
echo ">>> Docker OK"

# ── 2. Get/update the code ───────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  echo ">>> Repo exists at $INSTALL_DIR — force-updating to latest..."
  cd "$INSTALL_DIR"
  git fetch origin 2>/dev/null || {
    echo ">>> git fetch failed — trying with token..."
    echo ">>> Enter your GitHub Personal Access Token (or press Enter to skip):"
    read -r TOKEN
    if [ -n "$TOKEN" ]; then
      git remote set-url origin "https://zentoshi69:${TOKEN}@github.com/zentoshi69/arbitex.git"
      git fetch origin
    else
      echo "ERROR: Cannot fetch from GitHub without token (private repo)." >&2
      exit 1
    fi
  }
  git reset --hard origin/main
  git clean -fd
elif [ -d "$INSTALL_DIR" ]; then
  echo ">>> $INSTALL_DIR exists but is not a git repo — backing up and re-cloning..."
  mv "$INSTALL_DIR" "${INSTALL_DIR}.bak.$(date +%s)"
  git clone "$REPO_URL" "$INSTALL_DIR" || {
    echo ">>> Clone failed (private repo?) — Enter your GitHub PAT:"
    read -r TOKEN
    git clone "https://zentoshi69:${TOKEN}@github.com/zentoshi69/arbitex.git" "$INSTALL_DIR"
  }
  cd "$INSTALL_DIR"
else
  echo ">>> Cloning repo..."
  git clone "$REPO_URL" "$INSTALL_DIR" || {
    echo ">>> Clone failed (private repo?) — Enter your GitHub PAT:"
    read -r TOKEN
    git clone "https://zentoshi69:${TOKEN}@github.com/zentoshi69/arbitex.git" "$INSTALL_DIR"
  }
  cd "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
echo ">>> Code is at: $(pwd) — $(git log --oneline -1)"

# ── 3. Environment file ─────────────────────────────────────────────────────
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo ">>> Created .env from .env.example"
  else
    echo ">>> WARNING: No .env.example found — creating minimal .env"
    cat > .env <<'ENVEOF'
CHAIN_ID=43114
AVALANCHE_RPC_URL=https://avalanche.drpc.org
AVALANCHE_WSS_URL=wss://avalanche.drpc.org
MOCK_EXECUTION=true
OPERATOR_PASSWORD=arbitex2026
ENVEOF
  fi
  echo ""
  echo ">>> IMPORTANT: Edit .env later with your real RPC URLs and secrets:"
  echo ">>>   nano $INSTALL_DIR/.env"
  echo ""
else
  echo ">>> .env already exists — keeping it"
fi

# ── 4. Keystore (needed by worker container) ─────────────────────────────────
mkdir -p infra
if [ ! -f infra/dev-keystore.json ]; then
  echo '{}' > infra/dev-keystore.json
  echo ">>> Created dummy keystore (MOCK_EXECUTION=true)"
fi

# ── 5. Free disk space if tight ──────────────────────────────────────────────
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_PCT" -gt 85 ]; then
  echo ">>> Disk ${DISK_PCT}% full — pruning old Docker images..."
  docker system prune -af --volumes 2>/dev/null || true
fi

# ── 6. Build and start ──────────────────────────────────────────────────────
echo ""
echo ">>> Building containers (first time takes 5-10 min)..."
docker compose build api worker web

echo ""
echo ">>> Starting all services..."
docker compose up -d

echo ""
echo ">>> Waiting for services to start (30s)..."
sleep 30

echo ""
echo "============================================"
echo "  STATUS"
echo "============================================"
docker compose ps

echo ""
echo ">>> Checking API health..."
if docker compose exec -T api node -e \
  "fetch('http://127.0.0.1:3001/health').then(r=>r.json()).then(j=>{console.log(JSON.stringify(j,null,2));process.exit(j.status==='down'?1:0)}).catch(e=>{console.error(e.message);process.exit(1)})" \
  2>/dev/null; then
  echo ">>> API is UP"
else
  echo ">>> API not ready yet — check logs:"
  echo ">>>   docker compose logs api --tail=50"
fi

echo ""
echo ">>> Worker logs (last 20 lines):"
docker compose logs worker --tail=20 2>/dev/null || echo "(worker not started yet)"

echo ""
echo "============================================"
echo "  DONE"
echo "============================================"
echo ""
echo "Dashboard: http://$(hostname -I | awk '{print $1}'):80"
echo "API:       http://$(hostname -I | awk '{print $1}'):3001/health"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your real RPC/secrets: nano $INSTALL_DIR/.env"
echo "  2. Restart after editing: cd $INSTALL_DIR && docker compose up -d"
echo "  3. Check logs: docker compose logs -f --tail=100"
echo ""
