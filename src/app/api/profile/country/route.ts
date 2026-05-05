import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile, membership] = await Promise.all([
    db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { country: true },
    }),
    db.organisationMember.findFirst({
      where: { userId: session.user.id },
      select: { organisation: { select: { country: true } } },
    }),
  ]);

  const country = profile?.country ?? membership?.organisation.country ?? null;
  return NextResponse.json({ country });
}
