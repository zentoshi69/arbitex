# Security

## Reporting a vulnerability

**Do not open a public issue** for security vulnerabilities.

Please report security issues by email to the maintainers (see repo description or CODEOWNERS). Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond as soon as possible and will coordinate disclosure.

## Security practices for this repo

- **Secrets**: Never commit `.env`, `.env.local`, private keys, or API keys. Use `.env.example` as a template only.
- **Keystore**: The file `infra/dev-keystore.json` in the repo is a **placeholder**. For production, use a real encrypted keystore outside the repo and never commit it.
- **Dependencies**: Run `pnpm audit` before releases. Fix or document accepted risks.
- **Execution**: In production, set `MOCK_EXECUTION=false` only after verifying wallet, RPC, and risk limits.
- **CORS / API**: Restrict API and WebSocket origins to your dashboard domain in production.

Operators are responsible for compliance and safe operation in their jurisdiction.
