"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

/**
 * Redeems a single-use SSO ticket (minted by
 * src/app/api/auth/sso/callback/route.ts after a real completed OIDC
 * exchange) to establish a session — mirrors src/app/(auth)/login/actions.ts's
 * loginWithCredentials exactly (redirect: false + manual redirect(), see
 * that file's header comment for why: keeps the NEXT_REDIRECT throw outside
 * the try/catch so React's server-action runtime can intercept it cleanly).
 */
export async function redeemSsoTicket(ticket: string): Promise<{ error: string } | undefined> {
  try {
    await signIn("org-sso", {
      ticket,
      redirect: false,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "expired_or_used_ticket" };
    }
    throw error;
  }
  redirect("/dashboard");
}
