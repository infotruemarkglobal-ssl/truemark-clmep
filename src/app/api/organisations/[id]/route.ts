import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { CACHE_TAGS } from "@/lib/cache";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.ORG_MANAGER];
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // HIGH-3 RBAC fix: ORG_MANAGER can only read their own org
  if (session.user.role === USER_ROLES.ORG_MANAGER) {
    const membership = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId: session.user.id, organisationId: id } },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await db.organisation.findUnique({ where: { id } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(org);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only the ORG_MANAGER of this specific org may edit it.
  // SUPER_ADMIN and CERTIFICATION_OFFICER have read-only access to org profiles.
  if (session.user.role !== USER_ROLES.ORG_MANAGER) {
    return NextResponse.json({ error: "Forbidden — only the Organisation Manager can edit this profile" }, { status: 403 });
  }

  const { id } = await params;

  // Verify this ORG_MANAGER is a member of the target org
  const membership = await db.organisationMember.findUnique({
    where: { userId_organisationId: { userId: session.user.id, organisationId: id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const schema = z.object({
    name: z.string().min(2).optional(),
    registrationNo: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    website: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    industry: z.string().optional().nullable(),
    logoUrl: z.string().optional().nullable(),
    cacDocumentUrl: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
    // Super admin only: verification + approved schemes
    verificationStatus: z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional(),
    verificationNotes: z.string().optional().nullable(),
    approvedSchemes: z.array(z.string()).optional(),
  });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  // Whitelist the fields ORG_MANAGER may write — admin-only fields (verificationStatus etc.) are stripped.
  const ORG_MANAGER_FIELDS = new Set([
    "name", "registrationNo", "country", "address",
    "website", "description", "industry", "logoUrl", "cacDocumentUrl",
  ]);
  const parsed = body.data as Record<string, unknown>;
  const updateData: Record<string, unknown> = Object.fromEntries(
    Object.entries(parsed).filter(([k]) => ORG_MANAGER_FIELDS.has(k)),
  );

  if (updateData.approvedSchemes !== undefined) {
    updateData.approvedSchemes = JSON.stringify(updateData.approvedSchemes);
  }

  const org = await db.organisation.update({
    where: { id },
    data: updateData as Parameters<typeof db.organisation.update>[0]["data"],
  });

  revalidateTag(CACHE_TAGS.org, {});

  await auditLog({
    userId: session.user.id,
    action: "ORGANISATION_UPDATED",
    entityType: "Organisation",
    entityId: id,
    metadata: { orgName: org.name, updatedFields: Object.keys(updateData) },
  });

  return NextResponse.json(org);
}
