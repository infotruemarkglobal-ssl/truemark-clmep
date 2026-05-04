import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// ─── Non-CSP security headers ──────────────────────────────────────────────────
//
// These are static (same value on every response) so they live here.
// The Content-Security-Policy is generated per-request in src/middleware.ts
// because it needs a fresh nonce for each response — a static CSP with
// 'unsafe-inline' is meaningless as XSS protection.
//
// Applied to every route via source: "/(.*)" below.
// The /scorm-content/:path* block below overrides X-Frame-Options and adds a
// route-specific permissive CSP for SCORM packages (see rationale there).

const baseSecurityHeaders = [
  // Prevent this application's pages from being embedded in foreign frames.
  // frame-ancestors in the per-request CSP (middleware.ts) provides the same
  // protection for CSP-aware browsers; X-Frame-Options covers older ones.
  // DENY is stricter than SAMEORIGIN and correct here — no page in this app
  // needs to be embedded anywhere (the SCORM player opens a top-level window).
  { key: "X-Frame-Options", value: "DENY" },

  // Prevent browsers from MIME-sniffing a response away from the declared type.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // 2-year HSTS — prevents SSL-stripping attacks and enables preloading.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },

  // Referrer-Policy: send the origin+path to same-origin, only origin to
  // cross-origin. Prevents sensitive URL path segments appearing in third-party
  // access logs (e.g. /certificates/{id}/download).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Permissions-Policy: explicitly scope browser feature access.
  //   camera/microphone — required by the proctoring module (same-origin only)
  //   payment          — required for Paystack checkout (same-origin only)
  //   geolocation / usb / bluetooth / sensors — not used; deny explicitly.
  {
    key: "Permissions-Policy",
    value: [
      "camera=(self)",
      "microphone=(self)",
      "geolocation=()",
      "payment=(self)",
      "usb=()",
      "bluetooth=()",
      "accelerometer=()",
      "gyroscope=()",
      "magnetometer=()",
    ].join(", "),
  },
];

// CORS: no Access-Control-Allow-Origin header is set — all API routes are
// same-origin only. This platform has no public API or third-party JS clients.
// If a cross-origin consumer is added in future, add CORS headers at the route
// level (not globally) and scope them to specific trusted origins.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,

  // These packages are Node-only and must never be bundled into the browser bundle.
  // Listing them here keeps them as external requires on the server, giving faster
  // cold starts and preventing accidental client-side inclusion.
  serverExternalPackages: [
    "bcryptjs",
    "nodemailer",
    "pg",
    "@prisma/client",
    "@prisma/adapter-pg",
    "adm-zip",
    "qrcode",
    "otplib",
    "@react-pdf/renderer",
    "@aws-sdk/s3-request-presigner",
  ],

  experimental: {
    // Tree-shake icon/utility barrel files at the import level instead of
    // pulling in the entire package on every page that touches even one icon.
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@aws-sdk/client-s3",
    ],
  },

  async headers() {
    return [
      // ── 1. Global non-CSP security headers ──────────────────────────────────
      // Applied to every route. CSP is intentionally absent here — it is set
      // per-request in middleware.ts so it can carry a nonce.
      {
        source: "/(.*)",
        headers: baseSecurityHeaders,
      },

      // ── 2. SCORM content override ────────────────────────────────────────────
      // SCORM packages are third-party content that routinely contains inline
      // scripts and eval() — the spec pre-dates modern CSP. Scope the relaxation
      // tightly; the parent SCORM player page (/scorm/player/*) keeps the strict
      // nonce-based CSP from middleware.ts.
      //
      // Two sources are covered:
      //   /api/scorm/content/:path*  — R2 proxy route (production + dev with s3)
      //   /scorm-content/:path*      — Legacy static files in public/ (local dev
      //                                backwards compat; not used in production)
      //
      // These headers are evaluated AFTER the global block, so they override
      // X-Frame-Options for these subtrees specifically.
      {
        source: "/api/scorm/content/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // SCORM packages use inline scripts and eval — both are required
              // for the SCORM 1.2 / 2004 runtime and cannot be removed.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              // Images and data URIs are common in SCORM course media
              "img-src 'self' data: blob:",
              // SCORM API calls go to /api/scorm/* on this same origin
              "connect-src 'self'",
              "media-src 'self' blob:",
              "font-src 'self' data:",
              // Only allow this content to be framed by same-origin pages
              // (i.e. /scorm/player/* — the SCORM player route)
              "frame-ancestors 'self'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join("; "),
          },
          // Override the global DENY so SCORM content can load inside the player iframe.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      // Legacy: local dev packages extracted to public/scorm-content/ before the
      // R2 proxy migration. Not used in production. Kept for backwards compat.
      {
        source: "/scorm-content/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "connect-src 'self'",
              "media-src 'self' blob:",
              "font-src 'self' data:",
              "frame-ancestors 'self'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join("; "),
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },

  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === "development",
    },
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,

  // ── Source maps ───────────────────────────────────────────────────────────
  // Source maps are generated, uploaded to Sentry, then deleted from the build
  // output so they are never served publicly or committed to the repo.
  //
  // Without hideSourceMaps: true, Next.js serves .js.map files from
  // /_next/static/chunks/*.js.map — anyone who knows the URL can read the
  // full server-side source, including auth logic and DB schema details.
  //
  // Without deleteSourceMapsAfterUpload: true, the .map files remain in the
  // build directory and can be accidentally included in Docker images or CDN
  // uploads.
  sourcemaps: {
    // In development, source maps are served locally by Next.js dev server —
    // no need to upload them to Sentry.
    disable: process.env.NODE_ENV !== "production",
    // Delete .map files after upload so they are not served from the CDN.
    // Must be paired with hideSourceMaps below.
    deleteSourcemapsAfterUpload: true,
  },

  // Note: hideSourceMaps was removed from SentryBuildOptions in @sentry/nextjs v8+.
  // Source map public exposure is now prevented via deleteSourcemapsAfterUpload
  // (maps are deleted before the build output is deployed) combined with the
  // *.js.map entry in .gitignore. The Next.js framework does not serve
  // /_next/static/*.js.map files unless explicitly configured to do so.

  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
