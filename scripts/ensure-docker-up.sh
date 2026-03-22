#!/usr/bin/env bash
# Run from cron every 5–15 min to ensure compose stack is running (optional).
# Usage: scripts/ensure-docker-up.sh [/path/to/project]
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"
if command -v docker >/dev/null 2>&1; then
  docker compose up -d
else
  echo "docker not found" >&2
  exit 1
fi
