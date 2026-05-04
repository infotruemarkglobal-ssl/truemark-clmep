import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/platform/permissions — list all permissions grouped by category
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const permissions = await db.permission.findMany({
    orderBy: [{ category: "asc" }, { resource: "asc" }, { action: "asc" }],
  });

  return NextResponse.json(permissions);
}
