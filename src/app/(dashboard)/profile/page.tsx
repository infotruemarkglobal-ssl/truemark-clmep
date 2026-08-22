import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ProfilePage from "@/components/settings/ProfilePage";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfileRoute() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      photoUrl: true,
      signatureUrl: true,
      role: true,
      status: true,
      mfaEnabled: true,
      lastLoginAt: true,
      createdAt: true,
      profile: {
        select: {
          professionalTitle: true,
          employer: true,
          country: true,
          linkedinUrl: true,
        },
      },
    },
  });

  if (!user) redirect("/login");

  // Use the stable auth-gated proxy (mints a fresh pre-signed URL per request)
  // instead of baking a 15-minute pre-signed URL into the page — the latter goes
  // stale as soon as the user leaves this page open for a while.
  const signatureUrl = user.signatureUrl
    ? `/api/files/url?key=${encodeURIComponent(user.signatureUrl)}`
    : null;

  return (
    <ProfilePage
      user={{
        ...user,
        signatureUrl,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        profile: user.profile ?? null,
      }}
    />
  );
}
