import * as Sentry from "@sentry/nextjs";

// ── PII scrubbing helpers ────────────────────────────────────────────────────
// Identical ruleset to sentry.client.config.ts — keep in sync.
// Duplicated here (not imported) because sentry.server.config.ts is evaluated
// by Next.js before module resolution is fully initialised, so shared imports
// can cause subtle build-time failures.

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
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",

  // ── Environment ──────────────────────────────────────────────────────────
  // Set SENTRY_ENVIRONMENT="staging" in CI/CD for staging deployments.
  // Never rely on NODE_ENV alone — it is always "production" in any deployed
  // environment, so staging errors would appear under the production environment
  // and trigger production alert rules.
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // ── Performance sampling ─────────────────────────────────────────────────
  tracesSampler: ({ name }) => {
    if (/\/api\/payments/.test(name)) return 1.0;
    if (/\/api\/certificates/.test(name)) return 1.0;
    if (/\/api\/exams/.test(name) || /\/api\/scorm/.test(name)) return 0.5;
    return 0.1;
  },

  // ── Integrations ─────────────────────────────────────────────────────────
  integrations: [
    // httpIntegration captures outgoing HTTP calls (e.g. Paystack API) as
    // child spans so slow external calls are visible in the transaction trace.
    Sentry.httpIntegration({ breadcrumbs: true }),

    // Prisma integration: instruments every Prisma Client operation as a child
    // span with the model, action, and (non-PII) query details. This surfaces
    // slow DB queries that cause payment or exam endpoint timeouts.
    // Requires prisma >= 4.2.0 — already satisfied by this project's lockfile.
    // The `db` import cannot be used here (circular initialisation risk), so
    // the integration auto-discovers the Prisma client instance at runtime.
    Sentry.prismaIntegration(),
  ],

  // ── PII scrubbing ────────────────────────────────────────────────────────
  // Server-side events are higher-risk than client events because they include
  // full request bodies (Prisma inputs, JSON payloads from the browser) and
  // can contain raw email addresses, session tokens, and candidate names.
  beforeSend(event) {
    // 1. Strip identifiable user context — keep id (cuid) only
    if (event.user) {
      event.user = { id: event.user.id };
    }

    // 2. Scrub request body (JSON payload, form data)
    if (event.request) {
      if (event.request.url) event.request.url = redactString(event.request.url);
      if (event.request.data) event.request.data = scrubObject(event.request.data);
      if (event.request.headers) {
        const { Cookie, Authorization, cookie, authorization, ...safeHeaders } =
          event.request.headers as Record<string, string>;
        void Cookie; void Authorization; void cookie; void authorization;
        event.request.headers = safeHeaders;
      }
    }

    // 3. Scrub breadcrumbs (server-side: DB queries, HTTP calls).
    // In @sentry/nextjs v10 event.breadcrumbs is Breadcrumb[] directly.
    if (Array.isArray(event.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
        ...crumb,
        message: crumb.message ? redactString(crumb.message) : crumb.message,
        data: crumb.data ? (scrubObject(crumb.data) as typeof crumb.data) : crumb.data,
      }));
    }

    // 4. Scrub error message strings (Prisma errors can echo field values)
    if (event.exception?.values) {
      event.exception.values = event.exception.values.map((ex) => ({
        ...ex,
        value: ex.value ? redactString(ex.value) : ex.value,
      }));
    }

    return event;
  },

  // ── Extra context on errors ──────────────────────────────────────────────
  // beforeSendTransaction is separate from beforeSend — it fires for
  // performance transactions (traces), not error events.
  beforeSendTransaction(event) {
    // Scrub any PII that may appear in transaction names (e.g. user IDs in
    // dynamic segments that weren't parameterised by the SDK).
    if (event.transaction) {
      event.transaction = redactString(event.transaction);
    }
    return event;
  },
});
