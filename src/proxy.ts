import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { MFA_REQUIRED_ROLES } from "@/lib/constants";
import type { UserRole } from "@/lib/constants";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// ─── Exempt route prefixes ────────────────────────────────────────────────────
// These routes are reachable without a session. All of them still receive the
// nonce-based CSP header (see buildCsp below) — authentication exemption only.

const AUTH_EXEMPT_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/change-password",
  "/mfa-verify",
  // Public certificate verification — must be reachable without an account
  // so employers and third parties can confirm a certificate's validity.
  "/verify",
  // Public certificate register (ISO 17024 Cl.6.7) — searchable list of all
  // active certified persons. No authentication required.
  "/registry",
  // About/structure page (ISO 17024 Cl.5.1) — public page describing
  // the certification body's structure, scope, and impartiality commitments.
  "/about",
  // NextAuth internal endpoints
  "/api/auth",
  // Liveness probe — must be reachable by Vercel health checks and uptime
  // monitors without a session. Contains no sensitive data.
  "/api/health",
  // Password-change API is called during the force-change-password flow,
  // before a full session is established.
  "/api/profile/change-password",
  // Next.js internals
  "/_next",
  "/favicon",
];

// API routes that MFA-required roles may call BEFORE completing MFA
// (kept minimal — MFA must be resolved before any privileged API call)
const MFA_EXEMPT_API_PREFIXES: string[] = [
  "/api/auth",
];

// ─── Content-Security-Policy (per-request nonce) ──────────────────────────────
//
// A cryptographically random nonce is generated for every request. It is:
//   • Embedded in the CSP response header so the browser only executes scripts
//     that carry the matching nonce attribute.
//   • Written to the x-nonce request header so Next.js Server Components can
//     read it via `headers()` and pass it to any <Script nonce={nonce}> tags.
//
// WHY nonces instead of 'unsafe-inline'
// ──────────────────────────────────────
// 'unsafe-inline' defeats the entire purpose of a script-src CSP: an attacker
// who achieves XSS can inject any <script> and the browser will run it.
// With nonces, only scripts that the server has explicitly signed for *this
// specific response* can execute — injected scripts have no valid nonce.
//
// DIRECTIVE RATIONALE
// ────────────────────
// script-src  'nonce-{n}' 'strict-dynamic'
//   – Only scripts bearing the nonce are trusted at first load.
//   – 'strict-dynamic' propagates trust to scripts they dynamically inject
//     (Next.js router chunks, lazy components, etc.).
//   – 'unsafe-inline' listed last is a CSP-level-2 fallback only; it is
//     silently ignored by all browsers that support nonces (level 3+).
//   – No 'unsafe-eval' — eval is blocked in this application.
//   – No https://js.paystack.co — the app never loads the Paystack JS SDK
//     directly; the checkout flow is a server-redirect to Paystack's hosted page.
//
// connect-src  'self' https://api.paystack.co https://*.sentry.io
//   – Removed https://*.neon.tech  (Neon is a server-side DB; the browser
//     never opens a TCP connection to it — including it was misleading.)
//   – Removed https://inn.gs  (Inngest SDK is Node-only; same reasoning.)
//   – Added https://*.sentry.io for the browser Sentry SDK to report errors.
//
// media-src  + S3/R2 origins so <video src="...s3.amazonaws.com/..."> works
//   – Video course content is streamed from S3 or R2; without these origins
//     the browser would silently refuse to load the media.
//
// frame-ancestors 'self'
//   – Prevents this application from being embedded in foreign frames.
//   – This is the CSP-level analogue of X-Frame-Options: DENY (set statically
//     in next.config.ts for older browser compatibility).
//
// SCORM CONTENT EXCEPTION
// ────────────────────────
// The SCORM player at /scorm/player/* loads an iframe from /scorm-content/*
// (same-origin static files). Middleware does NOT set CSP headers for those
// paths — their CSP is controlled by next.config.ts (permissive, because SCORM
// packages contain third-party inline scripts and eval that we cannot nonce).

function buildCsp(nonce: string): string {
  const isProd = process.env.NODE_ENV === "production";

  return [
    "default-src 'self'",
    // nonce covers Next.js hydration/router scripts and any <Script nonce={nonce}> tags.
    // 'strict-dynamic' propagates trust from nonced scripts to their dynamic imports.
    // 'unsafe-inline' is a CSP-level-2 fallback; ignored in CSP-level-3 when nonce present.
    // In development, React DevTools and Turbopack use eval() for hot-reload
    // and error overlays (stack frame reconstruction). 'unsafe-eval' is safe
    // in dev because there is no user-supplied content to inject.
    // In production this directive is absent — eval() is never used by React
    // in production mode and would widen the XSS attack surface.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    // 'unsafe-inline' is required for Tailwind/CSS-in-JS inline styles.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // S3 and R2 for uploaded images; data: for avatar placeholders; blob: for object URLs.
    "img-src 'self' data: blob: https://*.amazonaws.com https://*.r2.cloudflarestorage.com",
    // Sentry browser SDK reports to *.sentry.io. Paystack checkout is a full-page
    // redirect (window.location), not a fetch — api.paystack.co only needed here if
    // any client component calls the Paystack API directly.
    "connect-src 'self' https://api.paystack.co https://*.sentry.io",
    // S3/R2 for course video <video> elements; blob: for MediaSource API streams.
    "media-src 'self' blob: https://*.amazonaws.com https://*.r2.cloudflarestorage.com",
    // /scorm-content/* (same-origin SCORM player iframe) + Paystack hosted checkout.
    "frame-src 'self' https://checkout.paystack.com",
    // Web workers used by the video player and SCORM runtime.
    "worker-src 'self' blob:",
    // Block all plugin content (<object>, <embed>, Flash).
    "object-src 'none'",
    // Restrict <base href> to prevent base-tag injection phishing.
    "base-uri 'self'",
    // Forms may only submit to this origin — mitigates form-action hijacking.
    "form-action 'self'",
    // Prevent this page from being framed by a foreign origin.
    // Complements the static X-Frame-Options: DENY header in next.config.ts.
    "frame-ancestors 'self'",
    // In production, instruct browsers to upgrade any remaining http:// sub-resource
    // requests to https:// before fetching them (belt-and-suspenders with HSTS).
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Credentials login rate limit ─────────────────────────────────────────
  // POST /api/auth/callback/credentials is the NextAuth endpoint that validates
  // username + password. Rate-limit it at the HTTP layer before the handler
  // runs, so the Argon/bcrypt hash is not even attempted on excess requests.
  // The auth.ts lockout logic is an independent second layer of defence.
  //
  // 10 attempts / 15 minutes per IP — allows a legitimate user to mistype their
  // password several times without getting locked out, while making brute-force
  // infeasible (10 × 4 windows/hour = 40 attempts/hour; bcrypt-12 at ~100 ms
  // each = 250 seconds per hash means 40 guesses/hour is the real ceiling anyway).
  if (pathname === "/api/auth/callback/credentials" && req.method === "POST") {
    const ip = getClientIp(req);
    const loginRl = await rateLimit(ip, "login", { limit: 10, windowMs: 15 * 60_000 });
    if (!loginRl.success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": String(loginRl.retryAfterSecs) } },
      );
    }
  }

  // ── Skip SCORM static content ─────────────────────────────────────────────
  // /scorm-content/* is served from public/ with a permissive CSP configured
  // in next.config.ts (because SCORM packages contain third-party inline scripts
  // that cannot be nonce-tagged). Do not override that CSP from middleware.
  if (pathname.startsWith("/scorm-content/")) {
    return NextResponse.next();
  }

  // ── Generate per-request nonce ────────────────────────────────────────────
  // crypto.randomUUID() is available in Node.js 15+ and the Edge Runtime.
  // Base64-encoding keeps it safe for use inside a header value.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Forward the nonce to server components so they can apply it to any
  // <Script nonce={nonce}> tags. Cloning request headers preserves all
  // existing headers (cookies, auth tokens, etc.).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the CSP from the incoming request to apply the nonce to its
  // own generated inline script tags during SSR (Next.js 15+ behaviour).
  requestHeaders.set("Content-Security-Policy", csp);

  // ── Auth-exempt paths — apply CSP but skip session checks ─────────────────
  if (AUTH_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    res.headers.set("x-nonce", nonce);
    return res;
  }

  // ── Session check ─────────────────────────────────────────────────────────
  // NextAuth v5 (Auth.js) renamed the session cookie from "next-auth.session-token"
  // (v4) to "authjs.session-token" (v5 HTTP) / "__Secure-authjs.session-token"
  // (v5 HTTPS/production). getToken() defaults to the old v4 name, so without
  // an explicit cookieName it always returns null in v5, causing an infinite
  // redirect loop: proxy→login (307) ↔ login page auth()→dashboard (303).
  // The salt must match the cookie name (Auth.js v5 uses PBKDF2 keyed by the
  // cookie name as salt when encrypting the JWT payload).
  const isProdEnv = process.env.NODE_ENV === "production";
  const cookieName = isProdEnv
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    cookieName,
    secureCookie: isProdEnv,
    salt: cookieName,
  });

  // ── Unauthenticated request ───────────────────────────────────────────────
  if (!token) {
    if (pathname.startsWith("/api/")) {
      // API routes return 401 themselves — let them handle it.
      const res = NextResponse.next({ request: { headers: requestHeaders } });
      res.headers.set("Content-Security-Policy", csp);
      res.headers.set("x-nonce", nonce);
      return res;
    }

    // Page routes: redirect to login, preserve the intended destination.
    // The dashboard layout also checks auth, but redirecting here avoids
    // a full server render of the protected page before the redirect fires.
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ── Force password change ─────────────────────────────────────────────────
  // If the account was provisioned with a temporary password, bounce the user
  // to the change-password page until they set their own.
  if (token.mustChangePassword) {
    const url = req.nextUrl.clone();
    url.pathname = "/change-password";
    return NextResponse.redirect(url);
  }

  // ── MFA enforcement (ASVS 2.8.1, ISO 27001 A.9.4.2) ─────────────────────
  // Privileged roles (SUPER_ADMIN, EXAMINER, etc.) must complete a second
  // factor before accessing any page or API route. This gate fires before the
  // route handler so a direct fetch() to /api/certificates/generate cannot
  // bypass it by omitting the session cookie.
  const role = token.role as UserRole | undefined;
  const mfaRequired = role ? MFA_REQUIRED_ROLES.includes(role) : false;
  const mfaVerified = token.mfaVerified === true;

  if (mfaRequired && !mfaVerified) {
    if (
      pathname.startsWith("/api/") &&
      !MFA_EXEMPT_API_PREFIXES.some((p) => pathname.startsWith(p))
    ) {
      return NextResponse.json(
        { error: "MFA verification required. Complete two-factor authentication to access this resource." },
        { status: 403 },
      );
    }

    const url = req.nextUrl.clone();
    url.pathname = "/mfa-verify";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ── Authenticated, MFA satisfied — pass through with CSP headers ──────────
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("x-nonce", nonce);
  return res;
}

export const config = {
  matcher: [
    // Run middleware on all routes except:
    //   _next/static — compiled static assets (JS chunks, CSS)
    //   _next/image  — image optimisation endpoint
    //   favicon.ico  — browser default favicon request
    //   Image file extensions — no auth or CSP needed for raw image files
    // Note: /scorm-content/* IS matched (not excluded) — middleware runs but
    // immediately returns NextResponse.next() at the top of the function to
    // avoid overriding the next.config.ts SCORM CSP.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
