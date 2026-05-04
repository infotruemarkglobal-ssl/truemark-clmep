import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

// PATCH /api/users/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const schema = z.object({
    role: z.enum(["SUPER_ADMIN", "CERTIFICATION_OFFICER", "EXAMINER", "TRAINER", "PROCTOR", "AUDITOR", "ORG_MANAGER", "CANDIDATE"]).optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_VERIFICATION"]).optional(),
    firstName: z.string().min(2).optional(),
    lastName: z.string().min(2).optional(),
    phone: z.string().optional().nullable(),
  });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  // Prevent self role-change
  if (id === session.user.id && body.data.role && body.data.role !== session.user.role) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  // ASVS 4.1.3 — privilege escalation prevention.
  // Only SUPER_ADMIN can assign the SUPER_ADMIN or CERTIFICATION_OFFICER roles.
  const SUPER_ONLY_ROLES: string[] = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];
  if (body.data.role && SUPER_ONLY_ROLES.includes(body.data.role) && session.user.role !== USER_ROLES.SUPER_ADMIN) {
    return NextResponse.json(
      { error: "Forbidden — only a Super Admin can assign that role" },
      { status: 403 },
    );
  }

  // CERTIFICATION_OFFICER may only assign non-privileged roles
  const CERT_OFFICER_ASSIGNABLE: string[] = [
    USER_ROLES.TRAINER, USER_ROLES.ORG_MANAGER, USER_ROLES.CANDIDATE,
  ];
  if (
    session.user.role === USER_ROLES.CERTIFICATION_OFFICER &&
    body.data.role !== undefined &&
    !CERT_OFFICER_ASSIGNABLE.includes(body.data.role)
  ) {
    return NextResponse.json(
      { error: "Forbidden — Certification Officers may only assign Trainer, Org Manager, or Candidate roles" },
      { status: 403 },
    );
  }

  const user = await db.user.update({
    where: { id },
    data: body.data,
    select: { id: true, email: true, role: true, status: true },
  });

  await auditLog({
    userId: session.user.id,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: id,
    metadata: { changes: body.data },
  });

  return NextResponse.json(user);
}

// DELETE /api/users/[id] — soft delete (set status INACTIVE)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.user.id) return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });

  // Cl.7.6 ISO 17024 — withdrawal of certification eligibility must trigger
  // revocation of all active certificates. Array form is PgBouncer compatible
  // (Supabase). The active cert count is pre-fetched so it can be referenced
  // in the audit log metadata without using the callback form.
  const activeCertCount = await db.certificate.count({
    where: { userId: id, status: "ACTIVE" },
  });

  await db.$transaction([
    db.user.update({ where: { id }, data: { status: "INACTIVE" } }),
    db.certificate.updateMany({
      where: { userId: id, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revocationReason: "Account withdrawn — automatic revocation per ISO 17024 Cl.7.6",
      },
    }),
    db.auditLog.create({
      data: {
        userId: session.user.id,
        action: "USER_WITHDRAWN",
        entityType: "User",
        entityId: id,
        metadata: JSON.stringify({
          certsRevoked: activeCertCount,
          reason: "ISO 17024 Cl.7.6 — withdrawal triggers automatic cert revocation",
        }),
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
