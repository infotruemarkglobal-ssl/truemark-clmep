import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

function isSuperAdmin(role: string) {
  return role === "SUPER_ADMIN";
}

// GET /api/platform/roles — list all roles with their permission IDs
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const roles = await db.customRole.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: {
      rolePermissions: { select: { permissionId: true } },
      _count: { select: { userRoles: true } },
    },
  });

  return NextResponse.json(
    roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissionIds: r.rolePermissions.map((rp) => rp.permissionId),
      userCount: r._count.userRoles,
    })),
  );
}

// POST /api/platform/roles — create a new custom role
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const schema = z.object({
    name: z.string().min(2).max(60),
    description: z.string().max(200).optional(),
  });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await db.customRole.findUnique({ where: { name: parsed.data.name } });
  if (existing) return NextResponse.json({ error: "A role with that name already exists" }, { status: 409 });

  const role = await db.customRole.create({
    data: { name: parsed.data.name, description: parsed.data.description, isSystem: false },
  });

  await auditLog({
    userId: session.user.id,
    action: "CUSTOM_ROLE_CREATED",
    entityType: "CustomRole",
    entityId: role.id,
    metadata: { name: role.name, description: role.description, severity: "HIGH" },
  }).catch(() => {});

  return NextResponse.json(role, { status: 201 });
}
