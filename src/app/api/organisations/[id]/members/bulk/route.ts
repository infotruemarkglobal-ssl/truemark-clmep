import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { inngest, EVENTS } from "@/inngest/client";
import { addExistingMember, createAndAddMember, checkAccess } from "@/lib/organisation-members";

const rowSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(["CANDIDATE", "MEMBER", "SUPERVISOR", "MANAGER"]).default("CANDIDATE"),
  departmentId: z.string().optional(),
});

// A single bulk upload can add members and/or hand out course seats — most
// real usage is the latter (an org already has its people in the system and
// just wants many of them into one course at once, replacing clicking
// "assign" one row at a time). seatId is optional and shared across every
// row in one upload; per-row course choice would need per-row seatIds,
// which this first version doesn't support — one CSV, one course.
const bodySchema = z.object({
  seatId: z.string().optional(),
  rows: z.array(rowSchema).min(1).max(200),
});

type RowResult = { email: string; ok: boolean; action: string; error?: string };

// POST /api/organisations/[id]/members/bulk — CSV-driven bulk member add +
// optional seat assignment. Parsing happens client-side (papaparse); this
// route receives already-structured rows, never a raw file. Every row is
// processed and reported individually — a bad row never silently drops or
// silently succeeds without being reflected in the response.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await checkAccess(session, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 5 bulk uploads/hour — generous for legitimate re-uploads after fixing a
  // few rows, tight enough that this can't be used to script mass account
  // creation (each row up to 200 already bounds a single request).
  const rl = await rateLimit(session.user.id, "org-bulk-members", { limit: 5, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many bulk uploads. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const org = await db.organisation.findUnique({ where: { id } });
  if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { seatId, rows } = parsed.data;

  let seat: { id: string; courseId: string; organisationId: string; course: { title: string; slug: string } } | null = null;
  if (seatId) {
    const found = await db.courseSeat.findUnique({
      where: { id: seatId },
      include: { course: { select: { title: true, slug: true } } },
    });
    if (!found || found.organisationId !== id) {
      return NextResponse.json({ error: "Seat pool not found for this organisation" }, { status: 404 });
    }
    seat = found;
  }

  const results: RowResult[] = [];

  for (const row of rows) {
    try {
      let userId: string;
      const existingUser = await db.user.findUnique({ where: { email: row.email } });
      const existingMembership = existingUser
        ? await db.organisationMember.findUnique({
            where: { userId_organisationId: { userId: existingUser.id, organisationId: id } },
          })
        : null;

      if (existingMembership) {
        // Already a member — this row's job (per the "replace one-by-one
        // seat assignment" use case) is just seat assignment below, if requested.
        userId = existingMembership.userId;
      } else if (existingUser) {
        const added = await addExistingMember(session, org, row.email, row.role, row.departmentId);
        if (!added.ok) { results.push({ email: row.email, ok: false, action: "add", error: added.error }); continue; }
        userId = existingUser.id;
      } else if (row.firstName && row.lastName) {
        const created = await createAndAddMember(session, org, { email: row.email, firstName: row.firstName, lastName: row.lastName, role: row.role, departmentId: row.departmentId }, req);
        if (!created.ok) { results.push({ email: row.email, ok: false, action: "create", error: created.error }); continue; }
        const newUser = await db.user.findUnique({ where: { email: row.email } });
        if (!newUser) { results.push({ email: row.email, ok: false, action: "create", error: "Account creation did not complete" }); continue; }
        userId = newUser.id;
      } else {
        results.push({ email: row.email, ok: false, action: "skip", error: "No account exists and no first/last name given to create one" });
        continue;
      }

      // ── Optional seat assignment — same atomic guard as the single-seat route ──
      if (seat) {
        const existingEnrolment = await db.enrolment.findUnique({
          where: { userId_courseId: { userId, courseId: seat.courseId } },
        });
        if (existingEnrolment) {
          results.push({ email: row.email, ok: true, action: "already_enrolled" });
          continue;
        }

        const seatUpdated = await db.$executeRaw`
          UPDATE "course_seats"
          SET "usedSeats" = "usedSeats" + 1
          WHERE id = ${seat.id}
          AND "usedSeats" < "totalSeats"
        `;
        if (seatUpdated === 0) {
          results.push({ email: row.email, ok: false, action: "seat_assign", error: "No seats remaining in this pool" });
          continue;
        }

        const enrolment = await db.enrolment.create({
          data: {
            userId,
            courseId: seat.courseId,
            purchaseId: (await db.courseSeat.findUniqueOrThrow({ where: { id: seat.id } })).purchaseId,
            status: "ACTIVE",
            progress: 0,
            organisationId: id,
            registrationSource: "ORG_ASSIGNED",
          },
        });
        await db.seatAssignment.create({
          data: { seatId: seat.id, userId, assignedById: session.user.id, enrolmentId: enrolment.id },
        });
        await db.notification.create({
          data: {
            userId,
            type: "ENROLMENT_CONFIRMATION",
            title: "You've been enrolled in a course",
            message: `Your organisation has enrolled you in "${seat.course.title}". Start learning whenever you're ready.`,
            link: `/courses/${seat.course.slug}`,
          },
        }).catch(() => {});
        await inngest.send({
          id: `seat-assigned-${seat.id}-${userId}`,
          name: EVENTS.SEND_SEAT_ASSIGNED,
          data: { to: row.email, firstName: row.firstName ?? "", courseTitle: seat.course.title, courseSlug: seat.course.slug, orgName: org.name, userId },
        }).catch((err) => console.error("[members/bulk] inngest seat-assigned failed:", err));

        results.push({ email: row.email, ok: true, action: existingMembership ? "seat_assigned" : "added_and_seat_assigned" });
      } else {
        results.push({ email: row.email, ok: true, action: existingMembership ? "already_member" : "added" });
      }
    } catch (err) {
      results.push({ email: row.email, ok: false, action: "error", error: err instanceof Error ? err.message : "Unexpected error" });
    }
  }

  await auditLog({
    userId: session.user.id,
    action: "ORG_BULK_MEMBER_UPLOAD",
    entityType: "Organisation",
    entityId: id,
    metadata: {
      orgId: id,
      orgName: org.name,
      rowCount: rows.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      seatId: seatId ?? null,
    },
  }).catch(() => {});

  return NextResponse.json({ results });
}
