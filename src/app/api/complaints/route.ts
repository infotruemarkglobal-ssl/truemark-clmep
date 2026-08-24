import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { USER_ROLES } from "@/lib/constants";

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

// GET /api/complaints — candidate's own complaints (admins use /manage/complaints instead)
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const complaints = await db.complaint.findMany({
    where: { userId: session.user.id },
    orderBy: { submittedAt: "desc" },
  });

  return NextResponse.json(complaints);
}

const COMPLAINT_TYPES = [
  "service_quality",
  "staff_conduct",
  "certification_process",
  "billing",
  "other",
] as const;

const schema = z.object({
  type: z.enum(COMPLAINT_TYPES),
  description: z.string().min(20, "Please provide at least 20 characters describing your complaint").max(3000),
  evidenceUrls: z.array(z.string().url()).max(5).optional(),
});

// POST /api/complaints — candidate submits a complaint
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 5 per hour — complaints are formal submissions, not a chat/support channel.
  const rl = await rateLimit(session.user.id, "complaint-submit", { limit: 5, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many complaints submitted. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const reference = `CMP-${crypto.randomUUID().replace(/-/g, "").substring(0, 8).toUpperCase()}`;

  const complaint = await db.complaint.create({
    data: {
      reference,
      userId: session.user.id,
      type: body.data.type,
      description: body.data.description,
      evidenceUrls: body.data.evidenceUrls?.length ? JSON.stringify(body.data.evidenceUrls) : null,
      status: "SUBMITTED",
    },
  });

  // Notify certification staff so a submission is never missed
  const officers = await db.user.findMany({
    where: { role: { in: ADMIN_ROLES as string[] }, status: "ACTIVE" },
    select: { id: true },
  });
  if (officers.length > 0) {
    await db.notification.createMany({
      data: officers.map((o) => ({
        userId: o.id,
        type: "SYSTEM_ALERT",
        title: `New Complaint — ${reference}`,
        message: `A new complaint has been submitted (${body.data.type.replace(/_/g, " ")}). Ref: ${reference}`,
        link: "/manage/complaints",
      })),
      skipDuplicates: true,
    });
  }

  await auditLog({
    userId: session.user.id,
    action: "COMPLAINT_SUBMITTED",
    entityType: "Complaint",
    entityId: complaint.id,
    metadata: { reference, type: body.data.type },
  });

  return NextResponse.json(complaint, { status: 201 });
}
