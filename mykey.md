# AJKMart — Environment Variables Reference

Copy the block below into your `.env` file (or CodeSandbox Secrets panel).
Values marked **⚠️ REPLACE** need a real account/API key.
Everything else is pre-generated and ready to use.

---

## How to use in CodeSandbox
1. Open your sandbox → **Settings → Environment Variables**
2. Add each key/value pair from the `.env` block below
3. Replace every `⚠️ REPLACE` value with your own key
4. Restart the sandbox

---

## Critical — must be set before the server starts

```
DATABASE_URL="postgresql://postgres:your_password@db.your-project.supabase.co:5432/postgres?sslmode=require"
```
> ⚠️ REPLACE — Get a free PostgreSQL URL from [Neon](https://neon.tech) or [Supabase](https://supabase.com).
> Format: `postgresql://user:pass@host:5432/dbname?sslmode=require`

---

## Full `.env` — copy-paste ready

```env
# ─── Node / Runtime ───────────────────────────────────────────────────────────
NODE_ENV="development"
PORT="5000"

# ─── Database (⚠️ REPLACE with your own PostgreSQL URL) ──────────────────────
DATABASE_URL="postgresql://postgres:StrongPass123!@db.abcxyz.supabase.co:5432/postgres?sslmode=require"

# ─── URLs ─────────────────────────────────────────────────────────────────────
# For CodeSandbox: replace <sandbox-id> with your actual sandbox ID
APP_BASE_URL="https://5000-<sandbox-id>.csb.app"
CLIENT_URL="https://5000-<sandbox-id>.csb.app"
FRONTEND_URL="https://5000-<sandbox-id>.csb.app"
ALLOWED_ORIGINS="https://5000-<sandbox-id>.csb.app,http://localhost:5000"
VITE_API_BASE_URL="https://5000-<sandbox-id>.csb.app"
VITE_API_PROXY_TARGET="http://127.0.0.1:5000"

# ─── JWT & Auth Secrets (pre-generated — safe to use as-is) ──────────────────
JWT_SECRET="110aeb50494c0c687ffbf5a07822f69a0d8c2a61a3b8e09a76093227cfa68895"
JWT_ISSUER="ajkmart"
VENDOR_JWT_SECRET="d66b564390dcfbb7629da1a30725fca3cf41aa6dcd3b57c82724f54b126748a7"
RIDER_JWT_SECRET="90504643052f80ed8ec215211b83bb11e382c5d60241e06277462860ef51d9a2"

# ─── Admin JWT & CSRF Secrets (pre-generated) ─────────────────────────────────
ADMIN_ACCESS_TOKEN_SECRET="2b8504cf07a5832f3a1d4d2775236d1df3a1c12927e07887e66c2c28290fdfb9"
ADMIN_REFRESH_TOKEN_SECRET="d67cf58e3b632175cd23d536536596f6185e1299b4ebad88e3aa68cf6703bb9e"
ADMIN_REFRESH_SECRET="8cec69f935a2a6ba8febffa980c0584fbc7ec6018ce92594fcec27180c209f5d"
ADMIN_JWT_SECRET="3be268c836f85cd39c7749e8aa64887fca9a9fb86227b7c84db8e7d33391bdd5"
ADMIN_SECRET="7a3f1e9d2b6c4a8f0e5d3c7b1a9f2e4d6c8b0a3f5e7d9c1b4a6e8f0d2c4b6a8"
ADMIN_CSRF_SECRET="cb8530d1d59343ea955aa457391e1d4bb095015ea6a2f0644ce08b28900ce8e7"

# ─── Encryption & HMAC (pre-generated) ────────────────────────────────────────
ENCRYPTION_MASTER_KEY="9cad390bddc9257c0dfb824b5919914f807d991bcaddb21b1ac71529a1c1cf09"
ERROR_REPORT_HMAC_SECRET="f5a9dec47f9fddad1b348f650463b81bb4262a6ca0ffd0c0698e1305b397eb1d"
HMAC_OTP_SECRET="a652d8efb93e4f02b5cbfa216aee79daa92cee414c03e169de2360909bc3c537"
TOKEN_HASH_SECRET="63221ca6c907f02a881f576d4b19838643629530b15ffe54cfe690b4e31fec0a"
SENTRY_WEBHOOK_SECRET="52769468f3c23e88bf06a5d880c9f9cda6e0a8bbec96e39444e32adf6a145508"

# ─── Admin Seed Account ────────────────────────────────────────────────────────
ADMIN_SEED_NAME="Super Admin"
ADMIN_SEED_USERNAME="superadmin"
ADMIN_SEED_EMAIL="admin@ajkmart.com"
ADMIN_SEED_PASSWORD="AJKMart@Admin2024!"
ADMIN_PASSWORD_RESET_TOKEN_TTL_MIN="60"

# ─── Web Push / VAPID (pre-generated keypair) ─────────────────────────────────
VAPID_PUBLIC_KEY="BNJSNyiqM1WBUUyUxCPHKQGgvrnVkMxm-pBx-6MlEbxseD-oOzMxgDHxif_hY6mIAN9m2vQ1q7D6Nn9ZA6wXs6k"
VAPID_PRIVATE_KEY="6S9svkhNs3HQ__1LQsv-p1hF0LMplKygMGKwPst_Y2o"
VAPID_CONTACT_EMAIL="admin@ajkmart.com"

# ─── Google Maps (⚠️ REPLACE) ─────────────────────────────────────────────────
# Get from: https://console.cloud.google.com → APIs & Services → Credentials
GOOGLE_MAPS_API_KEY="AIzaSyD_REPLACE_WITH_YOUR_GOOGLE_MAPS_API_KEY_HERE"

# ─── Gemini AI (⚠️ REPLACE) ───────────────────────────────────────────────────
# Get from: https://aistudio.google.com/app/apikey
GEMINI_API_KEY="AIzaSyA_REPLACE_WITH_YOUR_GEMINI_API_KEY_HERE_123"

# ─── Twilio SMS (⚠️ REPLACE — or leave blank to use console OTP in dev) ───────
# Get from: https://console.twilio.com
# Leave blank to skip SMS and see OTPs in server logs during development
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_PHONE_NUMBER="+12025551234"

# ─── Firebase (⚠️ REPLACE — or leave blank if not using Google/Facebook login) ─
# Get from: https://console.firebase.google.com → Project Settings → Service Accounts
# Paste the full service account JSON as a single-line string:
FIREBASE_SERVICE_ACCOUNT_JSON=""
# Legacy fields (alternative format — only needed if FIREBASE_SERVICE_ACCOUNT_JSON is blank):
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nREPLACE_WITH_YOUR_FIREBASE_PRIVATE_KEY\n-----END RSA PRIVATE KEY-----\n"

# ─── Object Storage / S3-compatible (⚠️ REPLACE — or leave blank to use local disk) ─
# Works with AWS S3, Cloudflare R2, DigitalOcean Spaces, Backblaze B2, etc.
STORAGE_ENDPOINT=""
STORAGE_REGION="us-east-1"
STORAGE_BUCKET_NAME="ajkmart-uploads"
STORAGE_ACCESS_KEY="AKIAIOSFODNN7EXAMPLE"
STORAGE_SECRET_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
STORAGE_BUCKET_URL=""

# ─── Optional — Redis cache (leave blank to use in-memory fallback) ───────────
# Get a free Redis URL from: https://upstash.com
REDIS_URL=""

# ─── Optional — Sentry error tracking ─────────────────────────────────────────
SENTRY_DSN=""

# ─── Dev helpers ──────────────────────────────────────────────────────────────
# Set to "true" only in development — makes OTP codes appear in API responses
ALLOW_DEV_OTP="true"
```

---

## Quick start checklist

| # | What | Status |
|---|------|--------|
| 1 | `DATABASE_URL` — PostgreSQL connection string | **⚠️ Must replace** |
| 2 | `GOOGLE_MAPS_API_KEY` — for map & location features | Recommended |
| 3 | `GEMINI_API_KEY` — for AI features | Recommended |
| 4 | `TWILIO_*` — for real SMS OTP delivery | Optional (dev works without it) |
| 5 | `FIREBASE_*` — for Google/Facebook social login | Optional |
| 6 | `STORAGE_*` — for file/image uploads | Optional (falls back to local disk) |
| 7 | All secrets (`*_SECRET`, `*_KEY`) | Pre-generated — ready to use |

---

## Notes

- **`NODE_ENV`** — use `"development"` in CodeSandbox so the server skips production-fatal checks and shows OTPs in logs.
- **OTP in dev** — with `ALLOW_DEV_OTP="true"` and `NODE_ENV="development"`, the 6-digit OTP is returned in the `/api/auth/verify-otp` response body — no real SMS needed.
- **Uploads without S3** — if `STORAGE_ACCESS_KEY` is blank, uploaded files save to the local `uploads/` folder on disk. Perfectly fine for local development.
- **Maps without API key** — the map will fall back to OpenStreetMap tiles for free with no key required.
- **Admin login** — after running database migrations, seed the admin with `pnpm --filter @workspace/api-server run seed`. Then log in at `/admin` with email `admin@ajkmart.com` / password `AJKMart@Admin2024!`.
- **These secrets are sample values** — rotate them before going to production.
