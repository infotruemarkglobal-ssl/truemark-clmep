import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { auditLog } from "@/lib/audit";

// GET /api/status-incidents — public, unauthenticated. Recent incidents for
// the public status page. Rate-limited in src/proxy.ts (shared "status-page"
// bucket, applied before this handler runs) rather than here — this route
// and /status/page.tsx's direct DB query both need the same protection, so
// it lives once at the middleware layer instead of being duplicated (and
// double-counted against the same bucket) in each caller.
export async function GET() {
  const incidents = await db.statusIncident.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    select: { id: true, title: true, message: true, severity: true, status: true, startedAt: true, resolvedAt: true },
  });

  return NextResponse.json({ incidents });
}

const schema = z.object({
  title: z.string().min(3).max(200),
  message: z.string().min(3).max(2000),
  severity: z.enum(["minor", "major", "critical"]).default("minor"),
});

// POST /api/status-incidents — post a new incident. security:manage only.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "security:manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const incident = await db.statusIncident.create({
    data: { ...body.data, createdBy: session.user.id },
  });

  await auditLog({
    userId: session.user.id,
    action: "STATUS_INCIDENT_POSTED",
    entityType: "StatusIncident",
    entityId: incident.id,
    metadata: { title: incident.title, severity: incident.severity },
  });

  return NextResponse.json(incident, { status: 201 });
}
