import * as Sentry from "@sentry/nextjs";

// Edge runtime config — applied to Next.js middleware (src/middleware.ts).
//
// The edge runtime has a restricted API surface: no Node.js built-ins, no
// filesystem, no `crypto.createHmac` (only Web Crypto). The Sentry SDK
// supports this environment with a smaller integration set.
//
// Without this file, middleware errors (CSP header generation failures,
// auth redirect bugs, rate-limit logic errors) are silently dropped.

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const CERT_NUMBER_RE = /TGC-\d{8}-[A-Z0-9]{4,}/gi;

function redactString(s: string): string {
  return s
    .replace(EMAIL_RE, "[email]")
    .replace(CERT_NUMBER_RE, "[cert-number]");
}

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // Edge transactions are short (middleware runs < 1 ms typically), but
  // sample at 100% to catch any middleware errors in payment/auth flows.
  tracesSampleRate: 1.0,

  beforeSend(event) {
    if (event.user) event.user = { id: event.user.id };
    if (event.request?.url) event.request.url = redactString(event.request.url);
    return event;
  },
});
