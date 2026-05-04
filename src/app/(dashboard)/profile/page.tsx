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

  return (
    <ProfilePage
      user={{
        ...user,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        profile: user.profile ?? null,
      }}
    />
  );
}
