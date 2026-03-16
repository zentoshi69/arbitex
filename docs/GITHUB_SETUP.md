# GitHub repo setup

This project is ready to be pushed to GitHub. Follow either path below.

## Prerequisites

- Git installed (`xcode-select --install` on macOS if needed)
- GitHub account (you said you gave access)

## 1. Create initial commit (if not done)

From the repo root (CODE X):

```bash
cd "/Users/antoineantoniadistdu/Documents/CODE X"
chmod +x scripts/setup-github-repo.sh
./scripts/setup-github-repo.sh
```

Or by hand:

```bash
git init
git add -A
git commit -m "chore: initial commit — ArbitEx cross-DEX arbitrage platform"
```

## 2. Create the repo on GitHub

### Option A — GitHub CLI (recommended)

```bash
brew install gh   # if needed
gh auth login    # follow prompts
gh repo create arbitex --private --source=. --remote=origin --push
```

Use `--public` instead of `--private` if you want a public repo.

### Option B — GitHub website

1. Open [https://github.com/new](https://github.com/new).
2. **Repository name:** `arbitex`.
3. **Visibility:** Private (or Public).
4. Do **not** add a README, .gitignore, or license (they already exist).
5. Click **Create repository**.
6. In your terminal:

```bash
git remote add origin https://github.com/YOUR_USERNAME/arbitex.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

## 3. After first push

1. In **README.md**, replace `USERNAME` in the CI badge URL with your GitHub username:
   - From: `https://github.com/USERNAME/arbitex/actions/...`
   - To: `https://github.com/YourUsername/arbitex/actions/...`
2. Optionally enable **Branch protection** for `main`: require PR reviews and CI to pass.
3. **Secrets:** never put `.env` or real keys in the repo; use GitHub Actions secrets or a vault for deployment.

## What’s already in the repo

- **CI:** `.github/workflows/ci.yml` — lint, typecheck, test (with Postgres + Redis), build, Docker build.
- **Dependabot:** `.github/dependabot.yml` — weekly npm, Docker, and Actions updates.
- **Templates:** PR template, bug/feature issue templates.
- **Security:** `.github/SECURITY.md` for vulnerability reporting.
- **Contributing:** `CONTRIBUTING.md` for setup and workflow.
- **Editor:** `.editorconfig`, `.nvmrc` for consistent dev setup.
