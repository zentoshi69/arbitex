#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f ".env.production" ]]; then
  echo "Missing .env.production in repo root."
  echo "Copy .env.production.example -> .env.production and fill values."
  exit 1
fi

mkdir -p /opt/arbitex/secrets >/dev/null 2>&1 || true

echo "Building and starting ArbitEx (prod compose)…"
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

echo ""
echo "Status:"
docker compose --env-file .env.production -f docker-compose.prod.yml ps

echo ""
echo "Tail logs (ctrl+c to stop):"
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=200

