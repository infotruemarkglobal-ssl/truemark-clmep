// Next.js instrumentation hook — required for @sentry/nextjs App Router support.
//
// WHY THIS FILE EXISTS
// ────────────────────
// withSentryConfig() in next.config.ts wraps the build pipeline (source maps,
// webpack plugin) but does NOT initialise the Sentry SDK at runtime for:
//
//   • React Server Component errors (thrown during RSC rendering)
//   • API route handler unhandled rejections
//   • Edge middleware errors
//
// In Next.js App Router (v13+), the instrumentation.ts register() function is
// the canonical hook for SDK initialisation. The onRequestError export is a
// Next.js 15+ hook that fires for every server-side request error before it is
// handed to the nearest error.tsx boundary — this is what wires up RSC error
// capture without requiring a try-catch in every server component.
//
// Without this file:
//   - Unhandled throws in Server Components → silent 500s (no Sentry event)
//   - API route 500s → may be captured by SDK auto-wrapping, but only if the
//     route was instrumented before it ran, which is not guaranteed.
//   - Middleware errors → never captured (edge runtime init was skipped)

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// onRequestError is called by Next.js 15+ for every unhandled server-side
// request error (RSC throws, route handler unhandled rejections). It runs
// before the error reaches the nearest error.tsx boundary, so it captures
// errors that would otherwise be lost in production 500s.
//
// captureRequestError was added to @sentry/nextjs around v8. If a future SDK
// upgrade removes it, replace the fallback with the new API.
import * as Sentry from "@sentry/nextjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onRequestError = (Sentry as any).captureRequestError
  ?? ((err: unknown) => { Sentry.captureException(err); });
