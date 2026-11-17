import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { can } from "@/lib/permissions";

// PATCH /api/manage/schemes/[id] — currently SUPER_ADMIN only
// Accepts any subset of scheme fields; eligibility fields are the primary use.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "schemes:manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const existing = await db.certificationScheme.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Scheme not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Formal version control (ISO 17024 Cl.7.3) — approving a scheme's current
  // settings is a distinct action from editing them, same pattern as
  // ExamPaper (src/app/api/manage/exams/[id]/route.ts).
  if (body?.action === "approve") {
    if (existing.approvalStatus === "APPROVED") {
      return NextResponse.json({ error: "This scheme's current settings are already approved" }, { status: 409 });
    }
    const updated = await db.certificationScheme.update({
      where: { id },
      data: { approvalStatus: "APPROVED", approvedBy: session.user.id, approvedAt: new Date() },
    });
    await auditLog({
      userId: session.user.id,
      action: "SCHEME_APPROVED",
      entityType: "CertificationScheme",
      entityId: id,
    });
    return NextResponse.json(updated);
  }

  // Whitelist updatable fields — prevent accidental mutation of immutable keys (id, createdAt).
  const ALLOWED_FIELDS = [
    "name", "description", "isActive", "validityMonths", "passMark",
    "maxAttempts", "cpdHoursRequired", "standardVersion",
    // Eligibility (ISO 17024 Cl.6.1)
    "eligibilityEnabled", "minAgeYears", "minExperienceYears",
    "requiredQualifications", "requiredPriorCerts",
    "requiresDocuments", "requiresEmployerLetter", "requiresIdDocument",
    "eligibilityNotes", "autoApproveMinutes",
    // Renewal (ISO 17024 Cl.6.8)
    "renewalRequiresExam", "renewalRequiresCPD", "renewalExamWindowMonths",
  ] as const;

  type AllowedField = (typeof ALLOWED_FIELDS)[number];

  const updateData: Partial<Record<AllowedField, unknown>> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) updateData[key] = body[key];
  }

  if (Object.keys(updateData).length === 0)
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });

  // Coerce numeric fields that arrive as strings from form inputs.
  for (const numKey of ["minAgeYears", "minExperienceYears", "autoApproveMinutes", "validityMonths", "passMark", "maxAttempts", "cpdHoursRequired", "renewalExamWindowMonths"] as const) {
    if (numKey in updateData && updateData[numKey] !== null && updateData[numKey] !== undefined) {
      const v = Number(updateData[numKey]);
      updateData[numKey] = isNaN(v) ? null : v;
    }
  }

  // Substantive changes to the scheme's own definition invalidate the
  // current approval — content-only fields, not eligibility/renewal toggles,
  // which are configuration rather than the certifiable standard itself.
  const CONTENT_FIELDS = ["name", "description", "validityMonths", "passMark", "maxAttempts", "cpdHoursRequired", "standardVersion"] as const;
  const isContentEdit = CONTENT_FIELDS.some((f) => f in updateData);

  const updated = await db.certificationScheme.update({
    where: { id },
    data: {
      ...(updateData as Parameters<typeof db.certificationScheme.update>[0]["data"]),
      ...(isContentEdit ? { approvalStatus: "DRAFT", approvedBy: null, approvedAt: null } : {}),
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "SCHEME_UPDATED",
    entityType: "CertificationScheme",
    entityId: id,
    metadata: { changed: Object.keys(updateData) },
  });

  return NextResponse.json(updated);
}
