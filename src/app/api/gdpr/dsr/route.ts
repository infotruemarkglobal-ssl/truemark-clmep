import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";
import { addDays } from "date-fns";

// Art. 12(3) GDPR — controller must respond within 30 days.
// WARNING: changing this constant constitutes a compliance decision and requires
// DPO sign-off. Do not increase it without legal review.
const DSR_DEADLINE_DAYS = 30;

const submitSchema = z.object({
  type: z.enum(["access", "erasure", "rectification", "portability", "restriction"]),
  notes: z.string().max(2000).optional(),
});

// ── POST /api/gdpr/dsr — data subject submits a request ──────────────────────
// Any authenticated user may submit a DSR for their own data.
// Art. 12(3): the request is logged with a dueAt 30 days from submission.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = submitSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  // Art. 12(5) — prevent manifestly unfounded / excessive requests by limiting
  // one open request per type per user at a time.
  const openRequest = await db.dataSubjectRequest.findFirst({
    where: { userId: session.user.id, type: body.data.type, status: { in: ["pending", "in_progress"] } },
  });
  if (openRequest) {
    return NextResponse.json(
      { error: "You already have an open request of this type. Please wait for it to be resolved before submitting another." },
      { status: 409 },
    );
  }

  const dsr = await db.dataSubjectRequest.create({
    data: {
      userId: session.user.id,
      type: body.data.type,
      status: "pending",
      notes: body.data.notes ?? null,
      dueAt: addDays(new Date(), DSR_DEADLINE_DAYS),
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "DSR_SUBMITTED",
    entityType: "DataSubjectRequest",
    entityId: dsr.id,
    metadata: { type: body.data.type, dueAt: dsr.dueAt },
  });

  return NextResponse.json({ id: dsr.id, type: dsr.type, status: dsr.status, dueAt: dsr.dueAt }, { status: 201 });
}

// ── GET /api/gdpr/dsr — list DSRs ─────────────────────────────────────────────
// Candidates see only their own requests; admins see all (for the management UI).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];
  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const cursor = searchParams.get("cursor") ?? undefined;
  const PAGE_SIZE = 50;

  const where = isAdmin
    ? (status ? { status } : {})
    : { userId: session.user.id };

  const requests = await db.dataSubjectRequest.findMany({
    where,
    include: isAdmin
      ? { user: { select: { id: true, email: true, firstName: true, lastName: true } } }
      : undefined,
    orderBy: { submittedAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = requests.length > PAGE_SIZE;
  const page = hasMore ? requests.slice(0, PAGE_SIZE) : requests;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({ data: page, nextCursor, hasMore });
}
