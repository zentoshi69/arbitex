#!/usr/bin/env bash
# Run ArbitEx locally — execute from repo root: ./scripts/run-arbitex.sh
set -e
cd "$(dirname "$0")/.."

# Load nvm if present (so node/npm/pnpm are in PATH)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"

# Use Node 20 if .nvmrc exists and nvm is available
if command -v nvm &>/dev/null && [[ -f .nvmrc ]]; then
  nvm use 2>/dev/null || true
fi

# Bump file descriptor limit (macOS defaults are too low for many watch processes)
ulimit -n 10000 2>/dev/null || true

# Strongly prefer Node 20.x for this monorepo
if command -v node &>/dev/null; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$NODE_MAJOR" != "20" ]]; then
    echo "⚠️  Detected Node $(node -v). Recommended: Node 20.x (see .nvmrc)."
    echo "   If you have nvm: run 'nvm install 20 && nvm use 20' then rerun this script."
  fi
fi

# Ensure pnpm is available (Node 16+ has corepack; or install via npm)
if ! command -v pnpm &>/dev/null; then
  echo "→ pnpm not found, enabling or installing..."
  # Prefer a user-local install directory to avoid sudo prompts.
  export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
  export PATH="$PNPM_HOME:$HOME/.local/bin:$PATH"
  mkdir -p "$PNPM_HOME" "$HOME/.local/bin"

  if command -v corepack &>/dev/null; then
    # Install shims into a user-writable directory (avoids /usr/local/bin permissions).
    corepack enable --install-directory "$HOME/.local/bin" pnpm || true
    corepack prepare pnpm@latest --activate || true
  elif command -v npm &>/dev/null; then
    npm install -g pnpm --prefix "$HOME/.local"
  else
    echo "Please install Node.js (https://nodejs.org) then run this script again."
    exit 1
  fi

  if ! command -v pnpm &>/dev/null; then
    echo "pnpm still not available."
    echo "Fix options:"
    echo "  - brew install pnpm"
    echo "  - or run: sudo corepack enable pnpm"
    echo "  - or run: sudo npm install -g pnpm"
    exit 1
  fi
fi

echo "→ pnpm install"
pnpm install

if [[ ! -f .env.local ]]; then
  echo "→ Creating .env.local from .env.example"
  cp .env.example .env.local
  echo "  Edit .env.local if you need your own RPC key, then run this script again."
fi

# Export env vars for subprocesses (Prisma CLI reads from process env)
set -a
if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  source .env.local
elif [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi
set +a

echo "→ Starting Postgres + Redis (Docker)"
docker compose up -d postgres redis

echo "→ Waiting for Postgres..."
sleep 3
until docker compose exec -T postgres pg_isready -U arbitex 2>/dev/null; do sleep 1; done

echo "→ Database migrations"
pnpm db:migrate

echo "→ Building workspace packages (one-time)"
# Avoid `next build` here (it can exceed macOS file limits and isn't needed for dev).
pnpm -r --filter "./packages/**" build

echo "→ Starting API, Web, Worker (lite dev)"
echo "  Dashboard: http://localhost:3000 — API: http://localhost:3001"
echo "  (This mode avoids starting watch-mode in every package to prevent macOS ENFILE errors.)"

# Free common dev ports if something stale is running (best-effort)
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
