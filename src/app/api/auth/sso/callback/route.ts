import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import * as client from "openid-client";
import { db } from "@/lib/db";
import { getOidcClientConfig } from "@/lib/oidc";
import { auditLog } from "@/lib/audit";

const SSO_FLOW_COOKIE = "sso_flow";

function errorRedirect(req: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/login/sso?error=${code}`, req.url));
}

// GET /api/auth/sso/callback — the IdP redirects here after the candidate
// authenticates on their org's own login screen. Validates the real
// authorization-code response (state, PKCE, nonce, ID token signature —
// all via openid-client's authorizationCodeGrant, not re-implemented here),
// then mints a single-use ticket the "org-sso" Credentials provider redeems
// to actually establish a session (see src/lib/auth.ts).
export async function GET(req: NextRequest) {
  const flowCookie = req.cookies.get(SSO_FLOW_COOKIE)?.value;
  if (!flowCookie) return errorRedirect(req, "expired_flow");

  let flow: { state: string; nonce: string; codeVerifier: string; ssoConfigId: string };
  try {
    flow = JSON.parse(flowCookie);
  } catch {
    return errorRedirect(req, "expired_flow");
  }

  const ssoConfig = await db.organisationSsoConfig.findUnique({ where: { id: flow.ssoConfigId } });
  if (!ssoConfig || !ssoConfig.enabled) return errorRedirect(req, "sso_disabled");

  let oidcConfig: Awaited<ReturnType<typeof getOidcClientConfig>>;
  try {
    oidcConfig = await getOidcClientConfig(ssoConfig);
  } catch (err) {
    console.error("[sso/callback] OIDC discovery failed:", err);
    return errorRedirect(req, "idp_unreachable");
  }

  let claims: ReturnType<Awaited<ReturnType<typeof client.authorizationCodeGrant>>["claims"]>;
  try {
    const tokens = await client.authorizationCodeGrant(oidcConfig, new URL(req.url), {
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      pkceCodeVerifier: flow.codeVerifier,
      idTokenExpected: true,
    });
    claims = tokens.claims();
    // The OIDC spec only guarantees scope-requested claims (email, profile)
    // land in the ID token itself if the RP explicitly asks for them via the
    // `claims` authorization parameter — many IdPs put them there anyway as
    // a convenience, but a spec-strict one (rightly) only returns them from
    // the UserInfo endpoint. Fall back to it so both kinds of IdP work.
    if (typeof claims?.email !== "string" && claims?.sub) {
      const userInfo = await client.fetchUserInfo(oidcConfig, tokens.access_token, claims.sub);
      claims = { ...claims, ...userInfo };
    }
  } catch (err) {
    // A failed/declined login at the IdP, or a genuinely invalid response —
    // either way this is not retriable with the same flow cookie.
    console.error("[sso/callback] authorization code grant failed:", err);
    return errorRedirect(req, "auth_failed");
  }

  const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : null;
  const sub = claims?.sub;
  if (!email || !sub) return errorRedirect(req, "missing_email_claim");

  // Defense-in-depth: the IdP is only trusted for the domain it was
  // configured for. A misconfigured customer IdP that (incorrectly) issues
  // tokens for other domains must not be able to sign a candidate in as
  // anyone outside that org.
  const emailDomain = email.split("@")[1];
  if (emailDomain !== ssoConfig.emailDomain) {
    console.warn(`[sso/callback] email domain mismatch: got ${emailDomain}, expected ${ssoConfig.emailDomain}`);
    return errorRedirect(req, "domain_mismatch");
  }

  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    const firstName = typeof claims?.given_name === "string" ? claims.given_name : email.split("@")[0];
    const lastName = typeof claims?.family_name === "string" ? claims.family_name : "";
    user = await db.user.create({
      data: {
        email,
        firstName,
        lastName,
        // No password at all for an SSO-only account — same "unusable hash"
        // convention as org-invited members (src/lib/organisation-members.ts).
        passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
        role: "CANDIDATE",
        status: "ACTIVE",
        emailVerified: new Date(),
      },
    });
  }

  await db.organisationMember.upsert({
    where: { userId_organisationId: { userId: user.id, organisationId: ssoConfig.organisationId } },
    create: { userId: user.id, organisationId: ssoConfig.organisationId, role: "CANDIDATE" },
    update: {},
  });

  await db.account.upsert({
    where: { provider_providerAccountId: { provider: "org-sso", providerAccountId: sub } },
    create: { userId: user.id, type: "oidc", provider: "org-sso", providerAccountId: sub },
    update: { userId: user.id },
  });

  const ticketToken = randomBytes(32).toString("hex");
  await db.ssoLoginTicket.create({
    data: { token: ticketToken, userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
  });

  await auditLog({
    userId: user.id,
    action: "USER_LOGIN",
    entityType: "User",
    entityId: user.id,
    metadata: { method: "org-sso", organisationId: ssoConfig.organisationId },
  }).catch(() => {});

  const res = NextResponse.redirect(new URL(`/login/sso/complete?ticket=${ticketToken}`, req.url));
  res.cookies.delete(SSO_FLOW_COOKIE);
  return res;
}
