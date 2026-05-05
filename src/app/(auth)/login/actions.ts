"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

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
 * Why redirect: false + manual redirect():
 *   Without redirect: false, NextAuth internally calls redirect(absoluteCallbackUrl)
 *   which throws NEXT_REDIRECT. The client-side try/catch in LoginForm catches this
 *   throw BEFORE React's server-action layer converts it to navigation, so the user
 *   sees "Something went wrong" even on a successful login.
 *   With redirect: false, NextAuth returns the callback URL string instead of
 *   throwing. We then call redirect("/dashboard") ourselves — that NEXT_REDIRECT
 *   is thrown from the server action body (outside any try/catch), so React's
 *   runtime intercepts it cleanly and navigates the client.
 *
 * Return contract:
 *   - { error: string }  →  auth failed; error is one of the ERROR_MESSAGES keys
 *   - never              →  successful auth calls redirect("/dashboard") which
 *                           throws NEXT_REDIRECT; React handles navigation
 */
export async function loginWithCredentials(
  email: string,
  password: string
): Promise<{ error: string } | undefined> {
  try {
    // redirect: false makes signIn() return the callback URL string on success
    // instead of throwing NEXT_REDIRECT. This keeps the throw outside the
    // try/catch so React can intercept it for navigation (see above).
    await signIn("credentials", {
      email,
      password,
      redirect: false,
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
    throw error;
  }
  // Reached only on successful auth. redirect() throws NEXT_REDIRECT outside
  // the try/catch, so React's server-action runtime intercepts it and navigates.
  redirect("/dashboard");
}
