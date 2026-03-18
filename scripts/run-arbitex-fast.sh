#!/usr/bin/env bash
# Faster dev runner (no install/build/migrate). Intended for rapid restart loops.
set -euo pipefail
cd "$(dirname "$0")/.."

# Load nvm if present
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
if command -v nvm &>/dev/null && [[ -f .nvmrc ]]; then
  nvm use 2>/dev/null || true
fi

ulimit -n 10000 2>/dev/null || true

# Export env vars for subprocesses
set -a
if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  source .env.local
elif [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi
set +a

echo "→ Starting Postgres + Redis (Docker) (if not already running)"
docker compose up -d postgres redis

echo "→ Starting API, Web, Worker (fast dev)"
echo "  Dashboard: http://localhost:3000 — API: http://localhost:3001"

# Best-effort free ports
for p in 3000 3001; do
  if command -v lsof &>/dev/null; then
    PIDS="$(lsof -ti tcp:$p 2>/dev/null || true)"
    if [[ -n "$PIDS" ]]; then
      echo "→ Port $p is in use; stopping stale process(es): $PIDS"
      kill -9 $PIDS 2>/dev/null || true
    fi
  fi
done

pnpm --parallel \
  --filter @arbitex/api \
  --filter @arbitex/web \
  --filter @arbitex/worker \
  dev

