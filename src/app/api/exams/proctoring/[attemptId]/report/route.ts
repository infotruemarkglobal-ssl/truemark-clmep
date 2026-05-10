import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];
  if (!(ALLOWED as string[]).includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { attemptId } = await params;

  const procSession = await db.proctoringSession.findUnique({
    where: { attemptId },
    include: { incidents: { orderBy: { timestamp: "asc" } } },
  });

  if (!procSession) {
    return NextResponse.json({ hasSession: false });
  }

  const sessionStart = procSession.startedAt;

  const incidents = procSession.incidents.map((inc) => ({
    id: inc.id,
    type: inc.type,
    severity: inc.severity,
    description: inc.description,
    timestamp: inc.timestamp.toISOString(),
    offsetSeconds: Math.max(0, Math.floor((inc.timestamp.getTime() - sessionStart.getTime()) / 1000)),
    reviewed: inc.reviewed,
    reviewNote: inc.reviewNote,
  }));

  const integrityScore = Math.max(0, 100 - incidents.length * 10);

  const durationMinutes = procSession.endedAt
    ? Math.round((procSession.endedAt.getTime() - sessionStart.getTime()) / 60000)
    : null;

  const counts: Record<string, number> = {};
  for (const inc of incidents) {
    counts[inc.type] = (counts[inc.type] ?? 0) + 1;
  }

  return NextResponse.json({
    hasSession: true,
    session: {
      id: procSession.id,
      status: procSession.status,
      startedAt: sessionStart.toISOString(),
      endedAt: procSession.endedAt?.toISOString() ?? null,
      durationMinutes,
      flagCount: procSession.flagCount,
      integrityScore,
    },
    incidents,
    counts,
    totalViolations: incidents.length,
  });
}
