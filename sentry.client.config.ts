import * as Sentry from "@sentry/nextjs";

// ── PII scrubbing helpers ────────────────────────────────────────────────────
//
// GDPR Art. 5(1)(c) — data minimisation. Sentry must not receive personal
// data beyond what is required to diagnose the error. The rules below strip:
//   • Email addresses (regex)
//   • Full certificate numbers (TGC-YYYYMMDD-NNNN pattern)
//   • Paystack references (CLMEP-…-… pattern)
//   • Any value under a PII-adjacent key (password, token, secret, etc.)
//
// Applied in beforeSend so nothing reaches the Sentry servers.

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const CERT_NUMBER_RE = /TGC-\d{8}-[A-Z0-9]{4,}/gi;
const PAYSTACK_REF_RE = /CLMEP-[A-Za-z0-9]+-[A-Za-z0-9]+-\d+/g;

const PII_KEYS = new Set([
  "password", "passwordhash", "token", "secret", "authorization",
  "email", "name", "firstname", "lastname", "username",
  "card_number", "cvv", "pan", "ssn", "dob",
]);

function redactString(s: string): string {
  return s
    .replace(EMAIL_RE, "[email]")
    .replace(CERT_NUMBER_RE, "[cert-number]")
    .replace(PAYSTACK_REF_RE, "[payment-ref]");
}

function scrubObject(obj: unknown, depth = 0): unknown {
  if (depth > 6 || obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return redactString(obj);
  if (Array.isArray(obj)) return obj.map((v) => scrubObject(v, depth + 1));
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = PII_KEYS.has(key.toLowerCase())
        ? "[scrubbed]"
        : scrubObject(value, depth + 1);
    }
    return result;
  }
  return obj;
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",

  // ── Environment ──────────────────────────────────────────────────────────
  // SENTRY_ENVIRONMENT separates production from staging/preview so that
  // production alert rules are not triggered by staging noise.
  // Set NEXT_PUBLIC_SENTRY_ENVIRONMENT="staging" in staging deployments.
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // ── Performance sampling ─────────────────────────────────────────────────
  // Flat sample rates are replaced by a sampler so critical flows are always
  // visible regardless of overall traffic volume.
  tracesSampler: ({ name }) => {
    // Payment and certificate issuance: 100% — every slow query must surface
    if (/\/api\/payments/.test(name)) return 1.0;
    if (/\/api\/certificates/.test(name)) return 1.0;
    // Exam flow: 50% — high volume but still needs good coverage
    if (/\/api\/exams/.test(name) || /\/api\/scorm/.test(name)) return 0.5;
    // All other routes: 10%
    return 0.1;
  },

  // Session replays are disabled entirely.
  // replaysOnErrorSampleRate: 1.0 would capture keystrokes and form values
  // (including password fields and payment forms) — a GDPR Art. 5(1)(c) risk
  // on a financial/certification platform. Sentry breadcrumbs + stack traces
  // are sufficient for diagnosing client-side errors without replay.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // ── PII scrubbing ────────────────────────────────────────────────────────
  // beforeSend fires before the event leaves the browser. Strip PII here so
  // nothing reaches the Sentry ingest servers in the first place.
  beforeSend(event) {
    // 1. Clear identifiable user fields — keep only the opaque user.id
    //    (a cuid, not a name or email) so we can correlate errors to a user
    //    without exposing their identity in Sentry.
    if (event.user) {
      event.user = { id: event.user.id };
    }

    // 2. Scrub breadcrumb data (URL navigations, console logs, fetch calls).
    // In @sentry/nextjs v10 event.breadcrumbs is Breadcrumb[] directly.
    if (Array.isArray(event.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
        ...crumb,
        message: crumb.message ? redactString(crumb.message) : crumb.message,
        data: crumb.data ? (scrubObject(crumb.data) as typeof crumb.data) : crumb.data,
      }));
    }

    // 3. Scrub request body/data (form submissions, JSON payloads)
    if (event.request) {
      if (event.request.url) event.request.url = redactString(event.request.url);
      if (event.request.data) event.request.data = scrubObject(event.request.data);
      // Remove Cookie and Authorization headers entirely — never needed for debugging
      if (event.request.headers) {
        const { Cookie, Authorization, cookie, authorization, ...safeHeaders } = event.request.headers as Record<string, string>;
        void Cookie; void Authorization; void cookie; void authorization;
        event.request.headers = safeHeaders;
      }
    }

    // 4. Scrub exception values (error messages can contain PII)
    if (event.exception?.values) {
      event.exception.values = event.exception.values.map((ex) => ({
        ...ex,
        value: ex.value ? redactString(ex.value) : ex.value,
      }));
    }

    return event;
  },
});
