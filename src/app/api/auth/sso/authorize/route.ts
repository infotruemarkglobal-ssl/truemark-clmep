import { NextRequest, NextResponse } from "next/server";
import * as client from "openid-client";
import { z } from "zod";
import { getOidcClientConfig, resolveSsoConfigForEmail } from "@/lib/oidc";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const SSO_FLOW_COOKIE = "sso_flow";

// GET /api/auth/sso/authorize?email=... — starts a real OIDC authorization
// code flow against the org's own configured IdP (resolved from the email
// domain, never from user choice). PKCE + state + nonce travel in a
// short-lived httpOnly cookie across the redirect to the IdP and back.
export async function GET(req: NextRequest) {
  const email = z.string().email().safeParse(req.nextUrl.searchParams.get("email"));
  if (!email.success) {
    return NextResponse.redirect(new URL("/login/sso?error=invalid_email", req.url));
  }

  const ip = getClientIp(req);
  const rl = await rateLimit(ip, "sso-authorize", { limit: 20, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.redirect(new URL("/login/sso?error=rate_limited", req.url));
  }

  const ssoConfig = await resolveSsoConfigForEmail(email.data);
  if (!ssoConfig) {
    return NextResponse.redirect(new URL("/login/sso?error=no_sso_for_domain", req.url));
  }

  let oidcConfig: Awaited<ReturnType<typeof getOidcClientConfig>>;
  try {
    oidcConfig = await getOidcClientConfig(ssoConfig);
  } catch (err) {
    console.error("[sso/authorize] OIDC discovery failed:", err);
    return NextResponse.redirect(new URL("/login/sso?error=idp_unreachable", req.url));
  }

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomState();

  const appUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const authUrl = client.buildAuthorizationUrl(oidcConfig, {
    redirect_uri: `${appUrl}/api/auth/sso/callback`,
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(
    SSO_FLOW_COOKIE,
    JSON.stringify({ state, nonce, codeVerifier, ssoConfigId: ssoConfig.id }),
    { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 300, path: "/" },
  );
  return res;
}
