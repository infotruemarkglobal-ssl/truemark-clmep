import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import bcrypt from "bcryptjs";

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.ORG_MANAGER];

// GET /api/users — list users (admins only)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // A03:2021 — validate all query parameters; unvalidated params could allow filter injection
  const { searchParams } = new URL(req.url);
  const qpSchema = z.object({
    search: z.string().max(200).default(""),
    role: z.enum(["SUPER_ADMIN", "CERTIFICATION_OFFICER", "EXAMINER", "TRAINER", "PROCTOR", "AUDITOR", "ORG_MANAGER", "CANDIDATE"]).optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_VERIFICATION"]).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  });
  const qp = qpSchema.safeParse({
    search: searchParams.get("search") ?? undefined,
    role: searchParams.get("role") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });
  if (!qp.success) return NextResponse.json({ error: qp.error.flatten() }, { status: 400 });

  const { search, role, status, page } = qp.data;
  const pageSize = 20;

  // HIGH-2 RBAC fix: ORG_MANAGER may only see members of their own organisation
  let orgScopeFilter: { id: { in: string[] } } | Record<string, never> = {};
  if (session.user.role === USER_ROLES.ORG_MANAGER) {
    const membership = await db.organisationMember.findFirst({
      where: { userId: session.user.id },
      select: { organisationId: true },
    });
    if (!membership) return NextResponse.json({ users: [], total: 0, page, pageSize });
    const members = await db.organisationMember.findMany({
      where: { organisationId: membership.organisationId },
      select: { userId: true },
    });
    orgScopeFilter = { id: { in: members.map((m) => m.userId) } };
  }

  const where = {
    AND: [
      orgScopeFilter,
      search ? {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
        ],
      } : {},
      role ? { role } : {},
      status ? { status } : {},
    ],
  };

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true, email: true,
        role: true, status: true, mfaEnabled: true,
        lastLoginAt: true, createdAt: true,
        // Art. 5(1)(c) data minimisation: phone is returned only to SUPER_ADMIN /
        // CERTIFICATION_OFFICER who need full contact details. ORG_MANAGER does
        // not require phone numbers to manage course enrolments.
        ...(session.user.role !== USER_ROLES.ORG_MANAGER ? { phone: true } : {}),
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
  ]);

  return NextResponse.json({ users, total, page, pageSize });
}

// POST /api/users — create user (super admin only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schema = z.object({
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    email: z.string().email().toLowerCase(),
    role: z.string().min(1),
    password: z.string().min(12),
    phone: z.string().optional(),
  });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const SYSTEM_ROLES = ["SUPER_ADMIN", "CERTIFICATION_OFFICER", "EXAMINER", "TRAINER", "PROCTOR", "AUDITOR", "ORG_MANAGER", "CANDIDATE"];
  if (!SYSTEM_ROLES.includes(body.data.role)) {
    const customRole = await db.customRole.findUnique({ where: { name: body.data.role } });
    if (!customRole) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email: body.data.email } });
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const { password, ...userData } = body.data;
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: {
      ...userData,
      passwordHash,
      status: "ACTIVE",
      emailVerified: new Date(),
      mustChangePassword: true,
    },
    select: { id: true, email: true, role: true },
  });

  await auditLog({
    userId: session.user.id,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  return NextResponse.json(user, { status: 201 });
}
