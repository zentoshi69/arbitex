#!/usr/bin/env bash
# Run from repo root: ./scripts/setup-github-repo.sh
# Creates initial commit and prints instructions to create GitHub repo and push.
set -e
cd "$(dirname "$0")/.."

if [[ -d .git ]]; then
  echo "Git already initialized."
else
  git init
  echo "Git initialized."
fi

git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit (already clean)."
else
  git commit -m "chore: initial commit — ArbitEx cross-DEX arbitrage platform

- Monorepo: NestJS API, Next.js dashboard, BullMQ worker
- Packages: config, db, chain, dex-adapters, risk/opportunity/execution engines
- CI/CD: GitHub Actions (lint, typecheck, test, build, Docker)
- Dependabot, PR/issue templates, SECURITY.md, CONTRIBUTING.md
- Env loading from monorepo root (.env.local / .env)"
  echo "Initial commit created."
fi

echo ""
echo "=============================================="
echo "Next: create the repo on GitHub and push"
echo "=============================================="
echo ""
echo "Option A — GitHub CLI (install: brew install gh, then gh auth login):"
echo "  gh repo create arbitex --private --source=. --remote=origin --push"
echo ""
echo "Option B — GitHub.com:"
echo "  1. Go to https://github.com/new"
echo "  2. Repository name: arbitex"
echo "  3. Create (do not add README/license)"
echo "  4. Run:"
echo "     git remote add origin https://github.com/YOUR_USERNAME/arbitex.git"
echo "     git branch -M main"
echo "     git push -u origin main"
echo ""
echo "Then in README.md replace USERNAME in the CI badge with your GitHub username."
echo ""
