import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import fs from "fs";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.TRAINER];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const pkg = await db.sCORMPackage.findUnique({
    where: { id },
    include: { lesson: { select: { title: true } } },
  });
  if (!pkg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(pkg);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const pkg = await db.sCORMPackage.findUnique({ where: { id } });
  if (!pkg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ownership check: TRAINERs may only delete their own packages.
  // SUPER_ADMIN and CERTIFICATION_OFFICER may delete any package.
  if (
    session.user.role === USER_ROLES.TRAINER &&
    pkg.createdBy !== session.user.id
  ) {
    return NextResponse.json({ error: "Forbidden — you can only delete your own SCORM packages" }, { status: 403 });
  }

  // Delete extracted files
  if (pkg.packagePath && fs.existsSync(pkg.packagePath)) {
    fs.rmSync(pkg.packagePath, { recursive: true, force: true });
  }

  await db.sCORMPackage.delete({ where: { id } });

  await auditLog({
    userId: session.user.id,
    action: "SCORM_PACKAGE_DELETED",
    entityType: "SCORMPackage",
    entityId: id,
    metadata: { title: pkg.title },
  });

  return NextResponse.json({ deleted: true });
}
