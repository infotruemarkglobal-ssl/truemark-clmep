import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { paystackInitialize, toSmallestUnit } from "@/lib/paystack";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 10 initiations per hour per user — enough for legitimate retries
  // (bad card, browser back, etc.) without allowing bulk fraud probing.
  const rl = await rateLimit(session.user.id, "payment-initiate", { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many payment requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const { courseId } = await req.json();
  if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });

  const course = await db.course.findFirst({
    where: { id: courseId, status: "PUBLISHED" },
  });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  // Check if already enrolled
  const existing = await db.enrolment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId } },
  });

  if (existing) {
    // Allow re-enrollment only if all exam attempts for this course's scheme are exhausted
    if (course.schemeId) {
      const examPaper = await db.examPaper.findFirst({ where: { schemeId: course.schemeId, isActive: true }, select: { id: true, scheme: { select: { maxAttempts: true } } } });
      if (examPaper) {
        const attemptCount = await db.examAttempt.count({
          where: { userId: session.user.id, examPaperId: examPaper.id, status: { in: ["COMPLETED", "VOIDED"] } },
        });
        const maxAttempts = examPaper.scheme?.maxAttempts ?? 3;
        if (attemptCount < maxAttempts) {
          return NextResponse.json({ error: "Already enrolled. Complete the course or exhaust all exam attempts to re-enrol." }, { status: 409 });
        }
        // All attempts used — allow re-enrollment (paid)
      } else {
        return NextResponse.json({ error: "Already enrolled" }, { status: 409 });
      }
    } else {
      return NextResponse.json({ error: "Already enrolled" }, { status: 409 });
    }
  }

  // Free course — enrol directly
  if (course.price === 0) {
    const enrolment = await db.enrolment.create({
      data: { userId: session.user.id, courseId, status: "ACTIVE", progress: 0 },
    });
    await auditLog({
      userId: session.user.id,
      action: "COURSE_ENROLMENT",
      entityType: "Enrolment",
      entityId: enrolment.id,
      metadata: { courseId, courseTitle: course.title, free: true },
    });

    // Notify user
    await db.notification.create({
      data: {
        userId: session.user.id,
        type: "ENROLMENT_CONFIRMATION",
        title: "Enrolment confirmed",
        message: `You are now enrolled in "${course.title}". Start learning whenever you're ready.`,
        link: `/courses/${course.slug}`,
      },
    }).catch(() => {});

    return NextResponse.json({ free: true, enrolmentId: enrolment.id });
  }

  // Generate a unique reference
  const reference = `CLMEP-${session.user.id.slice(0, 8)}-${courseId.slice(0, 8)}-${Date.now()}`;

  // Create pending purchase record
  const purchase = await db.purchase.create({
    data: {
      userId: session.user.id,
      courseId,
      paystackReference: reference,
      amount: course.price,
      currency: course.currency || "NGN",
      status: "PENDING",
      description: `Enrolment: ${course.title}`,
      metadata: JSON.stringify({ courseId, userId: session.user.id }),
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  const result = await paystackInitialize({
    email: session.user.email!,
    amount: toSmallestUnit(course.price, course.currency || "NGN"),
    currency: course.currency || "NGN",
    reference,
    callback_url: `${appUrl}/payments/callback?reference=${reference}&courseId=${courseId}`,
    metadata: { courseId, userId: session.user.id, purchaseId: purchase.id },
  });

  if (!result.status || !result.data?.authorization_url) {
    await db.purchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } });
    return NextResponse.json(
      { error: result.message ?? "Payment gateway error — please try again." },
      { status: 502 },
    );
  }

  // Save access code
  await db.purchase.update({
    where: { id: purchase.id },
    data: { paystackAccessCode: result.data.access_code ?? null },
  });

  // ISO 27001 A.8.15 — log payment initiation for traceability
  await auditLog({
    userId: session.user.id,
    action: "PAYMENT_INITIATED",
    entityType: "Purchase",
    entityId: purchase.id,
    metadata: {
      reference,
      courseId,
      amount: course.price,
      currency: course.currency || "NGN",
    },
  }).catch(() => {});

  return NextResponse.json({
    authorizationUrl: result.data.authorization_url,
    reference,
    amount: course.price,
    currency: course.currency || "NGN",
  });
}
