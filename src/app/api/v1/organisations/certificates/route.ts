import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-keys";

// GET /api/v1/organisations/certificates — Bearer <API key>, scope "certificates:read"
// Read-only. Same live query the Compliance tab uses (never a cached or
// self-reported status) — this is the "pull certification status into your
// own HR/LMS system" endpoint, and the primary-source-verification property
// the compliance dashboard has must hold here too.
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req, "certificates:read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const certificates = await db.certificate.findMany({
    where: { organisationId: auth.organisationId, deletedAt: null },
    select: {
      certificateNumber: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      user: { select: { firstName: true, lastName: true, email: true } },
      scheme: { select: { name: true, code: true } },
    },
    orderBy: { expiresAt: "asc" },
  });

  return NextResponse.json({
    data: certificates.map((c) => ({
      certificateNumber: c.certificateNumber,
      status: c.status,
      issuedAt: c.issuedAt.toISOString(),
      expiresAt: c.expiresAt?.toISOString() ?? null,
      holder: { firstName: c.user.firstName, lastName: c.user.lastName, email: c.user.email },
      scheme: { name: c.scheme.name, code: c.scheme.code },
    })),
  });
}
