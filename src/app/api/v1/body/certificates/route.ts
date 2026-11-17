import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clampLimit, requireTruveraKey, toBodyCertificate } from "@/lib/truvera-integration";

// GET /api/v1/body/certificates?cursor=<id>&limit=<1..200> — Bearer <TRUVERA_INTEGRATION_KEY>
// Every certificate the body has issued (not soft-deleted), in id order, a page at a time. Read-only and always live: Truvera
// reads this on a schedule and compares, so a renewal, suspension or revocation shows at the next read. `nextCursor` is the id
// to pass to continue; it is null on the last page.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireTruveraKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor");

  const rows = await db.certificate.findMany({
    where: { deletedAt: null },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: "asc" },
    select: {
      id: true,
      certificateNumber: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      revokedAt: true,
      standardVersion: true,
      schemeCodeSnapshot: true,
      schemeNameSnapshot: true,
      scheme: { select: { code: true, name: true } },
      user: { select: { firstName: true, lastName: true, profile: { select: { country: true } } } },
    },
  });

  const page = rows.slice(0, limit);
  const now = new Date();
  return NextResponse.json(
    { data: page.map((c) => toBodyCertificate(c, now)), nextCursor: rows.length > limit ? page[page.length - 1]!.id : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
