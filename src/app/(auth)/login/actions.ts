"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

/**
 * Server action for credentials login.
 *
 * Why a server action instead of signIn() from next-auth/react:
 *   The client-side signIn() fetches a CSRF token before POSTing credentials.
 *   On Vercel, if NEXTAUTH_URL doesn't exactly match the request origin (e.g.
 *   www vs non-www, or a preview deployment URL), the CSRF fetch fails and
 *   the library falls back to a native form GET — putting credentials in the URL.
 *   A server action bypasses CSRF entirely (Next.js protects server actions
 *   via its own Origin/Host check) and runs the auth flow directly on the server.
 *
 * Return contract:
 *   - { error: string }  →  auth failed; error is one of the ERROR_MESSAGES keys
 *   - undefined          →  never actually returned; successful auth throws
 *                           NEXT_REDIRECT which React handles as navigation
 */
export async function loginWithCredentials(
  email: string,
  password: string
): Promise<{ error: string } | undefined> {
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // authorize() can throw named errors (ACCOUNT_SUSPENDED, EMAIL_NOT_VERIFIED,
      // ACCOUNT_LOCKED). In v5 these are wrapped in AuthError with the original
      // Error in cause.err. Fall back to error.type for wrong-password cases
      // (where authorize returns null and NextAuth generates "CredentialsSignin").
      const cause = (error.cause as { err?: { message?: string } } | undefined)
        ?.err?.message;
      return { error: cause ?? error.type };
    }
    // Rethrow everything else — critically, this includes the NEXT_REDIRECT thrown
    // by redirect("/dashboard") on successful login. React's server-action layer
    // intercepts it and navigates the client. If we catch it here, login silently
    // succeeds with no navigation.
    throw error;
  }
}
