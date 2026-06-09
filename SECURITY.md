# Security

## Reporting a vulnerability

If you discover a security issue in this project, please report it privately to **nclawson4@gmail.com**. Do not open a public issue.

## Operating model

This project is a public-source demo. The deployed instance runs in two modes:

1. **Demo mode** — gated by a shared passcode. Visitors use the operator's API keys, subject to a hard daily spend cap and per-IP rate limiting.
2. **BYOK mode** — visitors supply their own Gemini and Anthropic keys. Keys are held in browser `sessionStorage` only and sent to the server per-request. They are never persisted server-side and never written to logs.

## What is not stored

- Visitor-supplied API keys (BYOK)
- Demo passcode submissions
- Raw model prompts (only token counts + costs are logged)

## Secret hygiene

- `.env*` files are gitignored except for `.env.example`.
- All production secrets live in Vercel project environment variables.
- Pre-commit secret scanning (via [gitleaks](https://github.com/gitleaks/gitleaks)) runs in CI and locally.
- API responses never echo secrets back.

## Abuse protection

- [Vercel BotID](https://vercel.com/docs/botid) verification on all paid-API endpoints.
- Per-IP sliding-window rate limit (10 requests / 60 seconds default) via Upstash Redis.
- Daily spend cap on demo mode disables paid calls when exceeded.
