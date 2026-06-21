import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";

// GET /api/platform/users/[id] — full user profile for SUPER_ADMIN
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      status: true,
      mustChangePassword: true,
      mfaEnabled: true,
      failedLoginCount: true,
      lockedUntil: true,
      lastLoginAt: true,
      createdAt: true,
      organisationMemberships: {
        select: {
          id: true,
          role: true,
          joinedAt: true,
          organisation: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...user,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    organisationMemberships: user.organisationMemberships.map((m) => ({
      ...m,
      joinedAt: m.joinedAt.toISOString(),
    })),
  });
}

const putSchema = z.object({
  role: z.enum([
    "SUPER_ADMIN", "CERTIFICATION_OFFICER", "EXAMINER",
    "TRAINER", "PROCTOR", "AUDITOR", "ORG_MANAGER", "CANDIDATE", "SUPPORT_AGENT",
  ]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_VERIFICATION"]).optional(),
  mustChangePassword: z.boolean().optional(),
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  lockedUntil: z.null().optional(),
  failedLoginCount: z.number().int().min(0).optional(),
});

// PUT /api/platform/users/[id] — update user fields for SUPER_ADMIN
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = putSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  // Self-protection: cannot change own role or suspend self
  if (id === session.user.id && (body.data.role || body.data.status === "SUSPENDED")) {
    return NextResponse.json({ error: "Cannot change your own role or suspend yourself" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.user.update({
    where: { id },
    data: body.data,
    select: {
      id: true, firstName: true, lastName: true, email: true,
      role: true, status: true, mustChangePassword: true,
      mfaEnabled: true, failedLoginCount: true,
      lockedUntil: true, lastLoginAt: true,
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: id,
    metadata: { changes: body.data },
  });

  return NextResponse.json({
    ...updated,
    lockedUntil: updated.lockedUntil?.toISOString() ?? null,
    lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
  });
}
