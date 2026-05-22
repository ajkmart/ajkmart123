# Threat Model

## Project Overview

AJKMart is a multi-service super-app for the AJK region, with a Node.js/Express API server (`artifacts/api-server`) serving customer, rider, vendor, and admin clients backed by PostgreSQL. Production security work should focus mainly on the API server and shared auth/database libraries, not mock or local-only tooling.

Production assumptions for this repo:
- `NODE_ENV=production` in deployed environments.
- Replit terminates TLS for deployed traffic.
- Mockup sandbox and local dev fallbacks are not production unless code paths remain reachable when deployed.

## Assets

- **User accounts and sessions** — customer, rider, vendor, and admin credentials, JWTs, refresh tokens, CSRF tokens, OTPs, TOTP secrets, magic-link tokens. Compromise allows impersonation and privilege escalation.
- **Admin control plane** — admin accounts, master admin secret, RBAC permissions, platform settings, OTP bypass controls, whitelist entries, webhook configuration, payout and wallet controls. Compromise gives full platform control.
- **PII and sensitive business data** — phone numbers, emails, addresses, CNIC/KYC documents, prescriptions, ride/order history, wallet balances, audit logs, and exported user data.
- **Payments and wallet state** — balances, deposits, withdrawals, rider commissions, refunds, manual payment verification state. Integrity failures can directly cause fraud or financial loss.
- **Secrets and third-party credentials** — DB URL, JWT secrets, admin secrets, SMS/email provider keys, S3 credentials, webhook secrets, Firebase, Redis, Sentry, AI keys.
- **Uploaded media and documents** — avatars, rider/vendor documents, prescriptions, audio/video uploads, admin content uploads. These can expose PII or become malware/storage abuse vectors.

## Trust Boundaries

- **Client to API boundary** — mobile apps, PWAs, admin SPA, and public web clients are untrusted. All auth, role checks, pricing, and ownership decisions must be enforced server-side.
- **Public to authenticated boundary** — public routes like auth, maps, public vendor/catalog content, webhooks, and legal/deep-link surfaces must be separated from user-authenticated flows.
- **User to admin boundary** — `/api/admin*` and admin-only business actions are a hard privilege boundary. Breaks here are high impact.
- **API to database boundary** — the API has broad DB access; injection or authorization mistakes can expose or corrupt the full dataset.
- **API to external service boundary** — SMS, WhatsApp, email, maps/geocoding, payment providers, Firebase, Sentry, Slack/webhooks, AI, and S3/object storage all consume server-side secrets and can become SSRF or secret-leak pivots.
- **Deployment config to runtime boundary** — files like `.replit` are in scope when project docs say their values can feed the live process environment. Committed secrets, bootstrap passwords, or production flags in these files are production vulnerabilities, not dev-only noise.
- **Production to dev-only boundary** — local-disk uploads, dev placeholder secrets, seed routes, console OTP delivery, and mock fallbacks are only acceptable when truly unreachable in production.

## Scan Anchors

- **Primary production entry point:** `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/index.ts`.
- **Highest-risk areas:** `artifacts/api-server/src/routes/auth/index.ts`, `artifacts/api-server/src/routes/admin-auth-v2.ts`, `artifacts/api-server/src/routes/admin/system/auth.ts`, `artifacts/api-server/src/routes/admin/*.ts`, `artifacts/api-server/src/routes/uploads.ts`, `artifacts/api-server/src/routes/maps.ts`, wallet/order/ride routes, and shared auth middleware/services.
- **Public surfaces:** `/api/auth/*`, public product/vendor/maps/legal/deep-link routes, webhook endpoints, error-report ingestion, selected uploads, and any admin pre-auth login/reset endpoints.
- **Authenticated user surfaces:** `/api/users`, `/api/orders`, `/api/wallet`, `/api/rides`, `/api/cart`, `/api/notifications`, `/api/addresses`, `/api/kyc`, `/api/wishlist`, etc.
- **Admin surfaces:** `/api/admin/*` including both `admin-auth-v2` and legacy `admin/system/auth` flows.
- **Usually dev-only / lower priority:** `/api/seed`, mock vault fallbacks, test files, archived routes, and frontend-only code unless it directly exposes production secrets or auth bypass.

## Threat Categories

### Spoofing

AJKMart supports many sign-in methods: phone OTP, email OTP, username/password, magic links, OAuth, TOTP, and separate admin auth. The biggest spoofing risk is any fallback, bypass, or seed path that lets an attacker impersonate a user or admin without the intended factor. The system must require strong, production-safe secrets for all privileged auth paths and ensure emergency login shortcuts are not left reachable with guessable or default credentials.

### Tampering

Clients can submit orders, rides, wallet actions, KYC data, uploads, and platform configuration changes. The API must validate all user-controlled fields, calculate sensitive business values server-side, and ensure only authorized actors can change protected records. Admin-only changes to OTP bypasses, secrets, payment state, and platform settings are especially sensitive.

### Repudiation

Admin actions, wallet mutations, auth events, data exports, and security-sensitive configuration changes need trustworthy audit logs with actor, time, and origin details. Without that, abusive payouts, secret rotations, bypass activation, or account takeovers are hard to investigate.

### Information Disclosure

The platform stores substantial PII and operational data. The API must prevent user-to-user data leakage, admin-only data exposure, secret leakage in logs or responses, and public disclosure of uploaded documents or map/provider credentials. Any public error or debug surface must avoid exposing stack traces, tokens, or database details.

### Denial of Service

The public auth, maps, upload, webhook, and search-like endpoints can be abused for resource exhaustion. The platform needs strong rate limits, bounded uploads, and outbound request timeouts so attackers cannot cheaply burn SMS/email spend, exhaust DB capacity, or tie up server workers.

### Elevation of Privilege

This repo has multiple privilege levels and many route files, so broken function-level authorization and IDOR are core risks. Admin routes must never be reachable with user tokens, user resources must always be scoped server-side, and auth shortcuts must not turn weak secrets or misconfiguration into full admin takeover. This category is the highest priority for repeated scans.
