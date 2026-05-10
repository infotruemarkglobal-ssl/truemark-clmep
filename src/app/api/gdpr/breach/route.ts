import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";
import { addHours } from "date-fns";
import { inngest, EVENTS } from "@/inngest/client";
import { rateLimit } from "@/lib/rate-limit";

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

// Art. 33 GDPR: supervisory authority must be notified within 72 hours of
// becoming aware of a personal data breach (unless unlikely to result in risk).
const DPA_NOTIFICATION_WINDOW_HOURS = 72;

const schema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  severity: z.enum(["low", "medium", "high", "critical"]),
  affectedUsers: z.number().int().min(0).optional(),
  dataTypesAffected: z.string().max(1000).optional(),
});

// ── POST /api/gdpr/breach — record a new breach incident ─────────────────────
// Only SUPER_ADMIN / CERTIFICATION_OFFICER may log breach incidents.
// On creation a notification is dispatched to the DPO/admin email so the
// 72-hour Art. 33 clock is visible. A background job (Inngest) should be
// wired to fire a reminder at discoveredAt + 48 hours if not yet reported.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 10 breach reports per hour — generous for a real incident, tight enough to
  // prevent accidental or deliberate spam that would flood the audit log and
  // trigger spurious Inngest DPA-reminder jobs.
  const rl = await rateLimit(session.user.id, "gdpr-breach-report", { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many breach reports. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const discoveredAt = new Date();
  const dpaDeadline = addHours(discoveredAt, DPA_NOTIFICATION_WINDOW_HOURS);

  const breach = await db.breachIncident.create({
    data: {
      title: body.data.title,
      description: body.data.description,
      severity: body.data.severity,
      affectedUsers: body.data.affectedUsers ?? null,
      dataTypesAffected: body.data.dataTypesAffected ?? null,
      discoveredAt,
      createdBy: session.user.id,
      status: "open",
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "BREACH_INCIDENT_CREATED",
    entityType: "BreachIncident",
    entityId: breach.id,
    metadata: {
      severity: breach.severity,
      affectedUsers: breach.affectedUsers,
      dpaDeadline: dpaDeadline.toISOString(),
      note: `Art. 33 DPA notification due by ${dpaDeadline.toISOString()}`,
    },
  });

  // Create an in-app notification for all SUPER_ADMIN users so the 72-hour
  // window is surfaced immediately. In production wire an Inngest function
  // to send an email alert and a 48-hour reminder if reportedToAuthority is
  // still false.
  const admins = await db.user.findMany({
    where: { role: USER_ROLES.SUPER_ADMIN, status: "ACTIVE" },
    select: { id: true },
  });
  if (admins.length > 0) {
    await db.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: "SYSTEM_ALERT",
        title: `BREACH ALERT [${body.data.severity.toUpperCase()}]: ${body.data.title}`,
        message: `A data breach has been recorded. Art. 33 GDPR requires DPA notification by ${dpaDeadline.toLocaleString()}. Breach ID: ${breach.id}.`,
        link: `/audit`,
      })),
    }).catch(() => {});
  }

  // Fire the 48-hour Art. 33 reminder. idempotency key is stable per breach so
  // a duplicate POST (e.g., double-click) cannot schedule two reminders.
  await inngest.send({
    id: `breach-dpa-reminder-${breach.id}`,
    name: EVENTS.BREACH_REPORTED,
    data: { breachId: breach.id, discoveredAt: discoveredAt.toISOString() },
  }).catch((err) => console.error("[gdpr/breach] Failed to schedule DPA reminder:", err));

  return NextResponse.json({ breach, dpaDeadline }, { status: 201 });
}

// ── GET /api/gdpr/breach — list breach incidents ──────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const PAGE_SIZE = 50;

  const breaches = await db.breachIncident.findMany({
    orderBy: { discoveredAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = breaches.length > PAGE_SIZE;
  const page = hasMore ? breaches.slice(0, PAGE_SIZE) : breaches;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const now = Date.now();
  const annotated = page.map((b) => ({
    ...b,
    dpaDeadline: addHours(b.discoveredAt, DPA_NOTIFICATION_WINDOW_HOURS),
    dpaWindowExpired: !b.reportedToAuthority &&
      now > addHours(b.discoveredAt, DPA_NOTIFICATION_WINDOW_HOURS).getTime(),
  }));

  return NextResponse.json({ breaches: annotated, nextCursor });
}
