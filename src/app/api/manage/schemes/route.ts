import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";

const createSchema = z.object({
  code: z.string().min(1).max(50).transform((v) => v.trim().toUpperCase()),
  name: z.string().min(1).max(200).trim(),
  description: z.string().optional().nullable(),
  standardVersion: z.string().max(100).optional().nullable(),
  validityMonths: z.coerce.number().int().min(1).default(36),
  passMark: z.coerce.number().int().min(0).max(100).default(70),
  maxAttempts: z.coerce.number().int().min(1).default(3),
  cpdHoursRequired: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== USER_ROLES.SUPER_ADMIN)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { code, ...rest } = parsed.data;

  const duplicate = await db.certificationScheme.findUnique({
    where: { code },
    select: { id: true },
  });
  if (duplicate)
    return NextResponse.json({ error: `Scheme code "${code}" is already in use` }, { status: 409 });

  const scheme = await db.certificationScheme.create({
    data: {
      code,
      ...rest,
      standardVersion: rest.standardVersion ?? "ISO/IEC 17024:2012",
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "SCHEME_CREATED",
    entityType: "CertificationScheme",
    entityId: scheme.id,
    metadata: { code: scheme.code, name: scheme.name },
  });

  return NextResponse.json(scheme, { status: 201 });
}
