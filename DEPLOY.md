# Deployment Checklist — Truemark Global CLMEP

Follow this checklist in order before going live. Tick each item when verified.

---

## 1. Environment Variables (Vercel → Settings → Environment Variables)

Set all variables from `.env.example` for the **Production** environment.
Key variables that are easy to miss:

| Variable | Required | Note |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon pooled URL (PgBouncer). Include `pgbouncer=true&uselibpqcompat=true`. |
| `DIRECT_URL` | ✅ | Neon direct URL. Used by Prisma migrate — do NOT use the pooler URL here. |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 32`. Never reuse across environments. |
| `NEXTAUTH_URL` | ✅ | Full production URL, e.g. `https://clmep.truemarkglobal.com`. |
| `NEXT_PUBLIC_APP_URL` | ✅ | Same as `NEXTAUTH_URL`. Used in emails and Open Badge JWT `issuer.id`. |
| `PAYSTACK_SECRET_KEY` | ✅ | Use `sk_live_` key. |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | ✅ | Use `pk_live_` key. |
| `EMAIL_SERVER_HOST` | ✅ | Recommended: Resend (`smtp.resend.com`). |
| `EMAIL_SERVER_PORT` | ✅ | 465 (TLS) or 587 (STARTTLS). |
| `EMAIL_SERVER_USER` | ✅ | SMTP username (Resend: `resend`). |
| `EMAIL_SERVER_PASSWORD` | ✅ | SMTP password / API key. |
| `EMAIL_FROM` | ✅ | Verified sender domain address. |
| `STORAGE_PROVIDER` | ✅ | Must be `s3` in production. |
| `AWS_ACCESS_KEY_ID` | ✅ | Cloudflare R2 or AWS S3 key. |
| `AWS_SECRET_ACCESS_KEY` | ✅ | Cloudflare R2 or AWS S3 secret. |
| `AWS_REGION` | ✅ | `auto` for Cloudflare R2; region code for AWS S3. |
| `AWS_S3_BUCKET` | ✅ | Bucket name, e.g. `truemark-uploads`. |
| `AWS_S3_ENDPOINT` | ✅ (R2) | `https://<accountid>.r2.cloudflarestorage.com`. Omit for AWS S3. |
| `UPSTASH_REDIS_REST_URL` | ✅ | Create at upstash.com. Required for distributed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | From Upstash dashboard. |
| `INNGEST_EVENT_KEY` | ✅ | From app.inngest.com → your app → Manage. |
| `INNGEST_SIGNING_KEY` | ✅ | From app.inngest.com → your app → Manage. |
| `CERT_SIGNING_PRIVATE_KEY` | ⚠️ | PKCS#8 PEM key for RS256 Open Badge JWT signing. Falls back to HS256 without it — not OB3.0-conformant. |
| `GDPR_DPO_EMAIL` | ⚠️ | DPO email for GDPR Art.33 breach reminders. Optional but recommended for compliance. |
| `NEXT_PUBLIC_SENTRY_DSN` | ⚠️ | Client-side error tracking. |
| `SENTRY_DSN` | ⚠️ | Server-side error tracking. |
| `SENTRY_AUTH_TOKEN` | ⚠️ | Required for source map uploads during build. |
| `SENTRY_ENVIRONMENT` | ⚠️ | Set to `production`. Do not rely on `NODE_ENV`. |

---

## 2. Database

- [ ] Run `npx prisma migrate deploy` against the production database (use `DIRECT_URL`, not the pooler URL).
- [ ] Verify all migrations applied: `npx prisma migrate status`.
- [ ] Confirm Neon connection pooling is enabled (PgBouncer mode, transaction pooling).
- [ ] Confirm Neon `uselibpqcompat=true` is in `DATABASE_URL` (required for Prisma 7 + PgBouncer).
- [ ] Set up Neon autoscaling compute to avoid cold-start timeouts on first request.

---

## 3. Cloudflare R2 CORS

The file upload API (`POST /api/manage/upload`) and SCORM package downloads need CORS configured on the R2 bucket.

Go to R2 Dashboard → your bucket → Settings → CORS and add:

```json
[
  {
    "AllowedOrigins": ["https://clmep.truemarkglobal.com"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace the origin with your production domain.

- [ ] R2 CORS policy applied.
- [ ] Test presigned PUT upload from the production domain (upload a test file via the UI).
- [ ] Confirm uploaded files are served correctly (GET on the R2 public URL).

---

## 4. Inngest

- [ ] Register your Inngest app at **app.inngest.com → Apps → Register** and point it to `https://clmep.truemarkglobal.com/api/inngest`.
- [ ] Confirm all 10 functions appear in the Inngest dashboard:
  - `send-member-welcome`
  - `send-enrolment-confirm`
  - `send-exam-result`
  - `send-email-verification`
  - `send-password-reset`
  - `cert-expiry-warnings`
  - `scan-upload`
  - `appeal-sla-monitor`
  - `orphaned-attempt-cleanup`
  - `breach-dpa-reminder`
- [ ] Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in Vercel env vars.
- [ ] Send a test event from the Inngest dashboard and confirm the function runs.
- [ ] Enable **retries** (already configured at 3 in each function — verify in dashboard).

---

## 5. Sentry

- [ ] Create a Next.js project at sentry.io.
- [ ] Set `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
- [ ] Set `SENTRY_ENVIRONMENT=production` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`.
- [ ] Verify source maps upload during build (`sentry-cli sourcemaps explain` after first deploy).
- [ ] Set up alert rules in Sentry for: error rate > 5/min, new issue types, performance regressions.
- [ ] Confirm onFailure Sentry captures are firing for Inngest function failures (trigger a test failure).

---

## 6. Vercel Configuration

- [ ] Framework preset: **Next.js** (auto-detected).
- [ ] Node.js version: **22.x** (required for Prisma 7 native bindings).
- [ ] Root directory: set if the Next.js project is in a monorepo subfolder (`truemark-clmep/`).
- [ ] Build command: `npx prisma generate && next build` (ensures Prisma client is generated).
- [ ] Install command: `npm ci` (not `npm install` — lockfile must be respected in CI).
- [ ] Confirm `NEXTAUTH_URL` matches the Vercel production domain exactly (including `https://`).
- [ ] Add the Vercel deployment URL as an OAuth redirect URI in Google and Microsoft Entra (if OAuth is enabled).
- [ ] Enable **Vercel Speed Insights** or similar for Core Web Vitals monitoring.
- [ ] Set **max duration** for long-running routes (PDF generation, SCORM extraction):
  - `/api/certificates/[id]/download` → 30s
  - `/api/scorm/packages` → 60s
  - `/api/manage/upload` → 60s
  These can be set via `export const maxDuration = 60` in the route file (already present in upload routes) or via `vercel.json`.

---

## 7. Smoke Tests (run after first production deploy)

Run each test manually or via automated smoke-test script:

### Auth
- [ ] Register a new user via email/password → verify welcome email received.
- [ ] Log in → confirm session persists across page refresh.
- [ ] Trigger password reset → confirm email received and reset works.

### Certificates
- [ ] Issue a test certificate via manage/decisions → confirm OpenBadge JWT is stored.
- [ ] Download the certificate PDF → confirm it opens, shows holder name, scheme, QR code.
- [ ] Verify the certificate via `/verify/{cert-number}` → confirm status, holder, expiry.

### SCORM
- [ ] Upload a valid SCORM 1.2 package → confirm 201, manifest parsed, `imsmanifest.xml` present.
- [ ] Upload a non-ZIP file → confirm 400 rejection.
- [ ] Upload a zip-slip ZIP (entry with `../../` path) → confirm 400 rejection.

### CPD
- [ ] Submit a CPD record as CANDIDATE → confirm status=pending.
- [ ] Approve it as CERTIFICATION_OFFICER → confirm status=approved.
- [ ] Submit CPD without consent → confirm 403.

### Appeals
- [ ] Submit an appeal as CANDIDATE → confirm APL-{ref} created, status=SUBMITTED.
- [ ] Move to UNDER_REVIEW as CERTIFICATION_OFFICER → confirm 200.
- [ ] Attempt invalid transition (SUBMITTED→RESOLVED) → confirm 422.

### GDPR
- [ ] Report a breach as SUPER_ADMIN → confirm dpaDeadline ~72h from now.
- [ ] Mark reportedToAuthority=true → confirm authorityReportedAt set.
- [ ] Confirm in-app SYSTEM_ALERT notification created for admins.

### Rate Limits
- [ ] Trigger 6 change-password attempts → confirm 429 on the 6th.
- [ ] Confirm `Retry-After` header is present in 429 responses.

### Inngest
- [ ] Trigger `certExpiryWarnings` manually from the Inngest dashboard → confirm emails sent.
- [ ] Trigger `breach-dpa-reminder` with a 48-hour-old unreported breach → confirm email + notification.

---

## 8. Post-Launch

- [ ] Monitor Sentry for the first 48 hours — resolve any new issue types immediately.
- [ ] Check Inngest function run history — confirm no persistent failures.
- [ ] Verify Neon connection count stays within plan limits under load.
- [ ] Confirm GDPR privacy policy and cookie notice are live at `/privacy` and `/cookies`.
- [ ] Set up weekly Neon DB backup export to a separate S3/R2 bucket.
- [ ] Schedule a penetration test within 30 days of launch (ISO 17024 Cl.6.2 — information security).
