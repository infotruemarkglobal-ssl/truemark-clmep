import { cache } from "react";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ACCOUNT_STATUS, MFA_REQUIRED_ROLES, SECURITY } from "@/lib/constants";
import type { UserRole } from "@/lib/constants";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  // @ts-expect-error — Prisma v7 adapter is compatible but types lag
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
    // ASVS 3.3.1 — match the session timeout defined in constants
    maxAge: SECURITY.SESSION_TIMEOUT_MINS * 60,
    // ASVS 3.3.2 — re-issue token on every request that has activity,
    // ensuring a stolen token cannot be replayed for the full maxAge window
    updateAge: 5 * 60, // rotate every 5 minutes of activity
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;

        if (user.status === ACCOUNT_STATUS.SUSPENDED) throw new Error("ACCOUNT_SUSPENDED");
        if (user.status === ACCOUNT_STATUS.PENDING_VERIFICATION) throw new Error("EMAIL_NOT_VERIFIED");
        if (user.lockedUntil && user.lockedUntil > new Date()) throw new Error("ACCOUNT_LOCKED");

        const passwordValid = await bcrypt.compare(password, user.passwordHash);

        if (!passwordValid) {
          const newCount = user.failedLoginCount + 1;
          const willLock = newCount >= SECURITY.MAX_LOGIN_ATTEMPTS;
          await db.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: newCount,
              lockedUntil: willLock
                ? new Date(Date.now() + SECURITY.LOCKOUT_MINS * 60 * 1000)
                : null,
            },
          });
          // ISO 27001 A.8.15 — log failed credential attempt
          await db.auditLog.create({
            data: {
              userId: user.id,
              action: "USER_LOGIN_FAILED",
              entityType: "User",
              entityId: user.id,
              metadata: JSON.stringify({ method: "credentials", failedCount: newCount }),
            },
          }).catch(() => {});
          // ISO 27001 A.8.15 — log account lockout as a separate security event
          if (willLock) {
            await db.auditLog.create({
              data: {
                userId: user.id,
                action: "ACCOUNT_LOCKED",
                entityType: "User",
                entityId: user.id,
                metadata: JSON.stringify({
                  reason: "MAX_LOGIN_ATTEMPTS_EXCEEDED",
                  lockedUntil: new Date(Date.now() + SECURITY.LOCKOUT_MINS * 60 * 1000).toISOString(),
                }),
              },
            }).catch(() => {});
          }
          return null;
        }

        await db.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });

        // Audit log is best-effort — a write failure must never block a valid login.
        await db.auditLog.create({
          data: {
            userId: user.id,
            action: "USER_LOGIN",
            entityType: "User",
            entityId: user.id,
            metadata: JSON.stringify({ method: "credentials" }),
          },
        }).catch(() => {});

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          image: user.photoUrl,
          role: user.role as UserRole,
          mfaEnabled: user.mfaEnabled,
          mfaVerified: false,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
    Google({
      allowDangerousEmailAccountLinking: true,
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
    MicrosoftEntraID({
      allowDangerousEmailAccountLinking: true,
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID ?? "",
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_SECRET ?? "",
    }),
  ],
  callbacks: {
    // ASVS 3.4.1 / CWE-601 — clamp all redirect targets to the same origin.
    // NextAuth validates against NEXTAUTH_URL, but an explicit check here ensures
    // that a misconfigured deployment (wrong NEXTAUTH_URL, reverse proxy quirks)
    // cannot produce an open redirect.
    async redirect({ url, baseUrl }) {
      // Relative paths are always safe
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Absolute URLs must share the same origin as the app
      try {
        const target = new URL(url);
        const base = new URL(baseUrl);
        if (target.origin === base.origin) return url;
      } catch {
        // malformed URL — fall through to safe default
      }
      return baseUrl;
    },

    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        token.id = user.id;
        // OAuth providers (Google, Microsoft) don't populate role/mfaEnabled/
        // mustChangePassword. Fetch these from the DB so MFA and password-change
        // enforcement apply equally to OAuth and credential sign-ins (L4 fix).
        if (account?.provider && account.provider !== "credentials") {
          const dbUser = await db.user.findUnique({ where: { id: user.id as string } });
          if (dbUser) {
            token.role = dbUser.role as UserRole;
            token.mfaEnabled = dbUser.mfaEnabled;
            token.mustChangePassword = dbUser.mustChangePassword;
          }
        } else {
          token.role = (user as { role: UserRole }).role;
          token.mfaEnabled = (user as { mfaEnabled: boolean }).mfaEnabled;
          token.mustChangePassword = (user as { mustChangePassword: boolean }).mustChangePassword;
        }
        // mfaVerified always starts false; TOTP flow promotes it via trigger=update.
        token.mfaVerified = false;
      }
      if (trigger === "update") {
        // Preserve mfaVerified=true when set by the MFA verification flow
        if ((session as { user?: { mfaVerified?: boolean } })?.user?.mfaVerified === true) {
          token.mfaVerified = true;
        }
        const dbUser = await db.user.findUnique({ where: { id: token.id as string } });
        if (dbUser) {
          token.role = dbUser.role as UserRole;
          token.mfaEnabled = dbUser.mfaEnabled;
          token.mustChangePassword = dbUser.mustChangePassword;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.mfaEnabled = token.mfaEnabled as boolean;
        session.user.mfaVerified = token.mfaVerified as boolean;
        session.user.mustChangePassword = (token.mustChangePassword as boolean) ?? false;
      }
      return session;
    },
  },
  events: {
    // ISO 27001 A.8.15 — log successful OAuth sign-in (credentials are logged inside authorize())
    async signIn({ user, account }) {
      if (account?.provider && account.provider !== "credentials" && user.id) {
        await db.auditLog.create({
          data: {
            userId: user.id,
            action: "USER_LOGIN_OAUTH",
            entityType: "User",
            entityId: user.id,
            metadata: JSON.stringify({ provider: account.provider }),
          },
        }).catch(() => {});
      }
    },
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (token?.id) {
        await db.auditLog.create({
          data: {
            userId: token.id as string,
            action: "USER_LOGOUT",
            entityType: "User",
            entityId: token.id as string,
          },
        });
      }
    },
  },
});

declare module "next-auth" {
  interface User {
    role: UserRole;
    mfaEnabled: boolean;
    mfaVerified: boolean;
    mustChangePassword: boolean;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
      role: UserRole;
      mfaEnabled: boolean;
      mfaVerified: boolean;
      mustChangePassword: boolean;
    };
  }
}


// Deduplicate auth() calls within a single React request tree.
// Without cache(), each server component that calls auth() independently
// triggers a separate JWT decode + optional DB lookup. On the dashboard,
// the layout + page + dashboard component (Candidate/Admin/Org) each call
// auth(), so this cuts 3 decodes to 1 per request.
//
// React cache() is request-scoped (per-render-pass), not persistent — it
// never serves a stale session from a previous request.
export const getCachedSession = cache(auth);

export async function getSession() {
  return await getCachedSession();
}

export async function requireAuth() {
  const session = await getCachedSession();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  return session;
}

export function roleRequiresMfa(role: UserRole): boolean {
  return MFA_REQUIRED_ROLES.includes(role);
}

// Stable wrapper around NextAuth v5 beta's `unstable_update`.
// When the API is stabilised (likely renamed to `update`) this is the only
// place that needs to change — all callers import `updateSession` from here.
export async function updateSession(data: Parameters<typeof unstable_update>[0]) {
  return unstable_update(data);
}
