import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

const schema = z.object({
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  phone: z.string().optional().nullable(),
  professionalTitle: z.string().optional().nullable(),
  employer: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable().or(z.literal("")),
});

// GET /api/users/me
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        phone: true, photoUrl: true, role: true, status: true,
        mfaEnabled: true, lastLoginAt: true, createdAt: true,
        profile: {
          select: {
            professionalTitle: true,
            employer: true,
            country: true,
            linkedinUrl: true,
            registrationType: true,
          },
        },
      },
    });

    return NextResponse.json(user);
  } catch (err) {
    console.error("[/api/users/me GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/users/me
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = schema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

    const { firstName, lastName, phone, professionalTitle, employer, country, linkedinUrl } = body.data;

    await db.user.update({
      where: { id: session.user.id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        phone: phone ?? null,
      },
    });

    await db.candidateProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        professionalTitle: professionalTitle ?? null,
        employer: employer ?? null,
        country: country ?? null,
        linkedinUrl: linkedinUrl ?? null,
      },
      update: {
        ...(professionalTitle !== undefined && { professionalTitle }),
        ...(employer !== undefined && { employer }),
        ...(country !== undefined && { country }),
        ...(linkedinUrl !== undefined && { linkedinUrl }),
      },
    });

    await auditLog({
      userId: session.user.id,
      action: "PROFILE_UPDATED",
      entityType: "User",
      entityId: session.user.id,
      metadata: { fields: Object.keys(body.data) },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/users/me PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
