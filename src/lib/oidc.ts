import * as client from "openid-client";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

/**
 * Enterprise SSO — OIDC only this pass (see the Tier 3 plan for why SAML is
 * explicitly deferred: next-auth's own SAML provider needs an external
 * BoxyHQ Jackson service this stack doesn't run, and hand-rolling SAML XML
 * signature validation under time pressure is a real security risk, not a
 * shortcut worth taking).
 *
 * Every organisation brings its own IdP; which one applies is resolved at
 * login time by the candidate's email domain, not by anything they choose
 * themselves — so a candidate can never point their login at someone else's
 * configured IdP.
 */

export async function resolveSsoConfigForEmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  return db.organisationSsoConfig.findFirst({
    where: { emailDomain: domain, enabled: true },
  });
}

export async function getOidcClientConfig(config: { issuerUrl: string; clientId: string; encryptedClientSecret: string }) {
  const clientSecret = decryptSecret(config.encryptedClientSecret);
  // Real discovery — fetches the IdP's actual /.well-known/openid-configuration
  // document over HTTPS every time rather than trusting a cached copy, since
  // an IdP can rotate its token/authorization endpoints.
  return client.discovery(new URL(config.issuerUrl), config.clientId, clientSecret);
}
