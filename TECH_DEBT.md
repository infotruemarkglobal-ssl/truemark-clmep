# Technical Debt

Items tracked here are known gaps that do not block current operation but carry risk or cost if left unaddressed.

---

## 1. NextAuth v5 beta — pin and upgrade path

**Current:** `next-auth@^5.0.0-beta.30`

The `^` range will pick up future beta releases automatically. Breaking changes between beta versions are common and have happened before (e.g. `getCachedSession` was renamed; `session.user` shape changed). The session JWT in this project carries a minimal payload (`id`, `role`, `mfaEnabled`, `mfaVerified`, `mustChangePassword`) — any change to that contract breaks auth silently.

**Action required:**
- Pin to an exact version: `"next-auth": "5.0.0-beta.30"` until NextAuth v5 reaches a stable release.
- When upgrading, audit `src/lib/auth.ts` and every `session.user.*` access site before shipping.
- Track the NextAuth v5 stable release: https://github.com/nextauthjs/next-auth/releases

---

## 2. Next.js 16.2.3 — known issues

**Current:** `next@16.2.3`

Next.js 16 introduced breaking changes from v15 that affect this codebase:
- `searchParams` in page components is now a `Promise<{}>` (awaited in all pages here ✓)
- `params` in route handlers is now a `Promise<{}>` (awaited in all routes here ✓)
- Turbopack is used in dev (`next dev --turbopack`) but not in production builds — verify that any dev-only behaviour does not mask build errors.

**Action required:**
- Review Next.js release notes with each patch upgrade before merging.
- Confirm `next build` passes in CI before every deployment (do not rely on `next dev` alone).

---

## 3. ClamAV not configured — production risk

**Current:** `CLAMAV_HOST` is unset in all deployed environments.

When `STORAGE_PROVIDER=s3` and `CLAMAV_HOST` is not set:
- File uploads are **hard-blocked** at the application layer (added in the upload scan Inngest function).
- All `SUPER_ADMIN` users receive an in-app `SYSTEM_ALERT` notification.
- A `FILE_SCAN_BLOCKED` audit log entry is written for every blocked upload.

This means **no file uploads are possible in production** until a scanner is provisioned.

**Action required (choose one):**
- Self-host: deploy ClamAV + clamd as a sidecar container and set `CLAMAV_HOST` + `CLAMAV_PORT`.
- Cloud option: route uploads through a cloud AV scanning service and adapt `src/inngest/functions/uploadScan.ts` accordingly.
- Until resolved, instruct operators that document uploads (org CAC, lesson content, etc.) will not work in production.

---

## 4. Stripe installed but not integrated

**Current:** `stripe@^22.0.1` is in `package.json`. No Stripe API routes exist.

The `Purchase` model has a `stripePaymentId` column reserved for a future integration. The active payment provider is **Paystack**.

**Action required:**
- See `docs/STRIPE.md` for the integration plan.
- Until Stripe is wired up, remove `stripePaymentId` from any UI display that would confuse operators into thinking Stripe charges exist.

---

## 5. REST GET /api/exams/[id] missing

**Current:** `src/app/api/exams/[id]/route.ts` exports only `POST` (start an attempt).

Exam paper details (title, duration, instructions, question count) are fetched **server-side only** inside the exam page server component. There is no REST endpoint for a client to retrieve exam paper metadata.

**Impact:** If the exam page ever needs to refetch metadata client-side (e.g. after a reconnect or in a future SPA flow), there is no endpoint to call.

**Action required:**
- Add `GET /api/exams/[id]` returning safe exam metadata (no answers, no correct options) when the calling user is enrolled and the paper is active.
- Gate the response: strip `isCorrect` from all options before returning.

---

## 6. TEST_DATABASE_URL not configured

**Current:** `TEST_DATABASE_URL` and `TEST_DIRECT_URL` are present in `.env.example` but **commented out**. No CI environment sets them.

Without these, the test suite (`jest`) falls back to `DATABASE_URL`, which points to the production or development database. Running `npm run test:ci` against production data is a data-integrity risk.

**Action required:**
- Create a dedicated Neon CI branch (Neon console → Branches → Create branch).
- Set `TEST_DATABASE_URL` and `TEST_DIRECT_URL` as secrets in the CI environment (GitHub Actions, Vercel, etc.).
- Uncomment the variables in `.env.example` and fill in the CI branch connection strings.
- Verify that `prisma.config.ts` uses `TEST_DIRECT_URL` for `prisma migrate deploy` in the test environment.
