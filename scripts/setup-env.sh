#!/usr/bin/env bash
# Setup environment files - ensure .env.prod is in the correct location
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# if env file was created in /root by mistake, move it here
if [ -f /root/.env.prod ] && [ ! -f "$ROOT/.env.prod" ]; then
  echo "→ Moving .env.prod from /root to $ROOT"
  mv /root/.env.prod "$ROOT/.env.prod"
  echo "✅ .env.prod moved successfully"
fi

# Verify the file exists
if [ -f "$ROOT/.env.prod" ]; then
  echo "✅ .env.prod is in the correct location: $ROOT/.env.prod"
  ls -la "$ROOT/.env.prod"
else
  echo "⚠️  Warning: .env.prod not found in $ROOT"
  exit 1
fi
