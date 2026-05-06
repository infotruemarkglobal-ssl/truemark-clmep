import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";

// PATCH /api/manage/schemes/[id] — SUPER_ADMIN only
// Accepts any subset of scheme fields; eligibility fields are the primary use.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== USER_ROLES.SUPER_ADMIN)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const existing = await db.certificationScheme.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Scheme not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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
  ] as const;

  type AllowedField = (typeof ALLOWED_FIELDS)[number];

  const updateData: Partial<Record<AllowedField, unknown>> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) updateData[key] = body[key];
  }

  if (Object.keys(updateData).length === 0)
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });

  // Coerce numeric fields that arrive as strings from form inputs.
  for (const numKey of ["minAgeYears", "minExperienceYears", "autoApproveMinutes", "validityMonths", "passMark", "maxAttempts", "cpdHoursRequired"] as const) {
    if (numKey in updateData && updateData[numKey] !== null && updateData[numKey] !== undefined) {
      const v = Number(updateData[numKey]);
      updateData[numKey] = isNaN(v) ? null : v;
    }
  }

  const updated = await db.certificationScheme.update({
    where: { id },
    data: updateData as Parameters<typeof db.certificationScheme.update>[0]["data"],
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
