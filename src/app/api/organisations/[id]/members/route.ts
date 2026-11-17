import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { addExistingMember, createAndAddMember, checkAccess } from "@/lib/organisation-members";

// GET /api/organisations/[id]/members — list members
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await checkAccess(session, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await db.organisationMember.findMany({
    where: { organisationId: id },
    include: {
      user: {
        select: {
          id: true, firstName: true, lastName: true, email: true,
          role: true, status: true,
          // Art. 5(1)(c) data minimisation: ORG_MANAGER does not need the exact
          // last-login timestamp — that is behavioural telemetry exceeding the need
          // of org-level course enrolment management. Status field is sufficient.
          enrolments: {
            select: {
              courseId: true, status: true, progress: true,
              course: { select: { title: true, slug: true } },
            },
          },
        },
      },
      department: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  return NextResponse.json(members);
}

// POST /api/organisations/[id]/members
//
// Two modes (determined by the `mode` field):
//   "add"    — add an existing user by email
//   "create" — create a brand-new account, send welcome email with a set-password link
//
// Business logic (audit log, notification, consent records, welcome email)
// lives in src/lib/organisation-members.ts, shared with the bulk-CSV route
// at ./bulk/route.ts — one code path for adding a member, whether it's this
// single-row form or a many-row CSV upload.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await checkAccess(session, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await db.organisation.findUnique({ where: { id } });
  if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });

  const body = await req.json();
  const mode: "add" | "create" = body.mode ?? "add";

  if (mode === "add") {
    const schema = z.object({
      email: z.string().email(),
      role: z.enum(["CANDIDATE", "MEMBER", "SUPERVISOR", "MANAGER"]).default("CANDIDATE"),
      departmentId: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const result = await addExistingMember(session, org, parsed.data.email, parsed.data.role, parsed.data.departmentId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.member, { status: result.status });
  }

  if (mode === "create") {
    const schema = z.object({
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
      email: z.string().email(),
      role: z.enum(["CANDIDATE", "MEMBER", "SUPERVISOR", "MANAGER"]).default("CANDIDATE"),
      departmentId: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const result = await createAndAddMember(session, org, parsed.data, req);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.member, { status: result.status });
  }

  return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
}
