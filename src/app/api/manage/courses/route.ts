import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.TRAINER];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isSuperAdmin = ([USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER] as string[]).includes(session.user.role);

  const courses = await db.course.findMany({
    where: isSuperAdmin ? undefined : { creatorId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { firstName: true, lastName: true } },
      scheme: { select: { name: true, code: true } },
      _count: { select: { modules: true, enrolments: true } },
    },
  });

  return NextResponse.json(courses);
}

const schema = z.object({
  title: z.string().min(2).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  shortDescription: z.string().optional(),
  schemeId: z.string().nullable().optional(),
  price: z.number().min(0).default(0),
  currency: z.string().default("NGN"),
  cpdHours: z.number().min(0).default(0),
  durationHours: z.number().min(0).nullable().optional(),
  minProgressToExam: z.number().min(0).max(100).default(80),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  // Check slug uniqueness
  const existing = await db.course.findUnique({ where: { slug: body.data.slug } });
  if (existing) {
    return NextResponse.json({ error: "A course with this slug already exists" }, { status: 409 });
  }

  const course = await db.course.create({
    data: {
      title: body.data.title,
      slug: body.data.slug,
      shortDescription: body.data.shortDescription ?? null,
      schemeId: body.data.schemeId ?? null,
      price: body.data.price,
      currency: body.data.currency,
      cpdHours: body.data.cpdHours,
      durationHours: body.data.durationHours ?? null,
      minProgressToExam: body.data.minProgressToExam,
      creatorId: session.user.id,
      status: "DRAFT",
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "COURSE_CREATED",
    entityType: "Course",
    entityId: course.id,
    metadata: { title: course.title, slug: course.slug },
  });

  return NextResponse.json(course, { status: 201 });
}
