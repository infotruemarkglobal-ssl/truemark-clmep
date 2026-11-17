import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-keys";

// GET /api/v1/organisations/members — Bearer <API key>, scope "members:read"
// Read-only. Returns the org's own members and role — same data the
// Members tab shows, as JSON for an org's own HR/LMS system to consume.
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req, "members:read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const members = await db.organisationMember.findMany({
    where: { organisationId: auth.organisationId },
    select: {
      role: true,
      joinedAt: true,
      user: { select: { firstName: true, lastName: true, email: true, status: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  return NextResponse.json({
    data: members.map((m) => ({
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
      accountStatus: m.user.status,
      organisationRole: m.role,
      joinedAt: m.joinedAt.toISOString(),
    })),
  });
}
