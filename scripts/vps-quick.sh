#!/usr/bin/env bash
# One-command VPS deploy: pull (optional), build, up, health check.
# Run from the repo root, or: bash scripts/vps-quick.sh (auto-cd to repo root).
#
# Usage:
#   ./scripts/vps-quick.sh              # default stack (docker-compose.yml)
#   ./scripts/vps-quick.sh --pull       # git pull first (if .git exists)
#   ./scripts/vps-quick.sh --prod       # docker-compose.prod.yml + .env.production
#   ./scripts/vps-quick.sh --pull --prod --no-cache
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DO_PULL=0
USE_PROD=0
NO_CACHE=""
SKIP_HEALTH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pull) DO_PULL=1 ;;
    --prod) USE_PROD=1 ;;
    --no-cache) NO_CACHE="--no-cache" ;;
    --skip-health) SKIP_HEALTH=1 ;;
    -h|--help)
      sed -n '1,20p' "$0" | tail -n +2
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
  shift || true
done

if [[ ! -f "docker-compose.yml" ]]; then
  echo "No docker-compose.yml here: $ROOT" >&2
  echo "Clone or rsync the project first, then run this script from the repo root." >&2
  exit 1
fi

if [[ "$DO_PULL" -eq 1 ]]; then
  if [[ -d .git ]]; then
    echo ">>> git pull"
    git pull --ff-only
  else
    echo ">>> skip git pull (no .git directory — copy/rsync updates manually)"
  fi
fi

if [[ "$USE_PROD" -eq 1 ]]; then
  if [[ ! -f ".env.production" ]]; then
    echo "Missing .env.production. Copy from .env.production.example and fill secrets." >&2
    exit 1
  fi
  COMPOSE=(docker compose --env-file .env.production -f docker-compose.prod.yml)
  echo ">>> Using docker-compose.prod.yml + .env.production"
else
  if [[ ! -f ".env" ]] && [[ -f ".env.example" ]]; then
    echo ">>> No .env — creating from .env.example (edit RPC/secrets before prod!)"
    cp .env.example .env
  fi
  COMPOSE=(docker compose -f docker-compose.yml)
  echo ">>> Using docker-compose.yml"
fi

if [[ -n "$NO_CACHE" ]]; then
  echo ">>> docker compose build --no-cache api worker web"
  "${COMPOSE[@]}" build --no-cache api worker web
else
  echo ">>> docker compose build api worker web"
  "${COMPOSE[@]}" build api worker web
fi

echo ">>> docker compose up -d"
"${COMPOSE[@]}" up -d

echo ""
echo ">>> Status"
"${COMPOSE[@]}" ps

if [[ "$SKIP_HEALTH" -eq 0 ]]; then
  echo ""
  echo ">>> API health (inside api container)"
  sleep 3
  if "${COMPOSE[@]}" exec -T api node -e \
    "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    2>/dev/null; then
    echo "OK — /health returned 200"
  else
    echo "WARN — health check failed or api still starting. Try:" >&2
    echo "  ${COMPOSE[*]} logs api --tail=80" >&2
    exit 1
  fi
fi

echo ""
echo "Done. Tail logs: ${COMPOSE[*]} logs -f --tail=100"
