import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { can } from "@/lib/permissions";

const schema = z.object({ action: z.literal("approve") });

// PATCH /api/documents/[id] — approve the document's latest (most recent)
// version, moving it DRAFT -> ACTIVE and superseding whatever version was
// previously ACTIVE. DocumentVersion has carried status/approvedBy/approvedAt
// fields since it was first added, but nothing ever exercised them — every
// document in the library has sat permanently in DRAFT. This is the missing
// approval step, same CO/SUPER_ADMIN ceiling as creating a document.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "documents:manage", ["SUPER_ADMIN", "CERTIFICATION_OFFICER"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const doc = await db.document.findUnique({
    where: { id },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const latest = doc.versions[0];
  if (!latest) return NextResponse.json({ error: "This document has no versions to approve" }, { status: 422 });
  if (latest.status === "ACTIVE") {
    return NextResponse.json({ error: "This version is already the active, approved version" }, { status: 409 });
  }

  const previouslyActive = doc.versions.find((v) => v.status === "ACTIVE" && v.id !== latest.id);

  const updated = await db.$transaction(async (tx) => {
    if (previouslyActive) {
      await tx.documentVersion.update({ where: { id: previouslyActive.id }, data: { status: "SUPERSEDED", supersededAt: new Date() } });
    }
    return tx.documentVersion.update({
      where: { id: latest.id },
      data: { status: "ACTIVE", approvedBy: session.user.id, approvedAt: new Date() },
    });
  });

  await auditLog({
    userId: session.user.id,
    action: "DOCUMENT_VERSION_APPROVED",
    entityType: "DocumentVersion",
    entityId: latest.id,
    metadata: { documentId: doc.id, title: doc.title, version: latest.version, supersededVersionId: previouslyActive?.id ?? null },
  });

  return NextResponse.json(updated);
}
