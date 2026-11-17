import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { auditLog } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";

// Same permission and role ceiling as the general org-profile PATCH route
// (src/app/api/organisations/[id]/route.ts) — SSO config is the customer
// org's own IdP details (their issuer URL, their client id/secret), so it's
// the ORG_MANAGER's own responsibility to configure, same as their org
// profile. SUPER_ADMIN is deliberately excluded for the same reason that
// route excludes it: this permission auto-grants to SUPER_ADMIN otherwise,
// which would let platform staff silently take over a customer's SSO
// connection — not appropriate for security-sensitive per-tenant config.
async function checkAccess(session: Session, orgId: string) {
  if (!(await can(session, "organisations:update", ["ORG_MANAGER"]))) return false;
  const membership = await db.organisationMember.findUnique({
    where: { userId_organisationId: { userId: session.user.id, organisationId: orgId } },
  });
  return !!membership;
}

// GET /api/organisations/[id]/sso-config — never returns the client secret,
// only whether one is configured.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await checkAccess(session, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await db.organisationSsoConfig.findUnique({
    where: { organisationId: id },
    select: { id: true, emailDomain: true, issuerUrl: true, clientId: true, enabled: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json(config ? { ...config, hasClientSecret: true } : null);
}

const schema = z.object({
  emailDomain: z.string().min(1).toLowerCase(),
  issuerUrl: z.string().url(),
  clientId: z.string().min(1),
  // Optional on update — omitted means "keep the existing encrypted secret".
  clientSecret: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
});

// POST /api/organisations/[id]/sso-config — create or update. clientSecret
// is write-only: once saved it is never sent back to any client again.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await checkAccess(session, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { emailDomain, issuerUrl, clientId, clientSecret, enabled } = parsed.data;

  const existing = await db.organisationSsoConfig.findUnique({ where: { organisationId: id } });
  if (!existing && !clientSecret) {
    return NextResponse.json({ error: "clientSecret is required when creating a new SSO configuration" }, { status: 400 });
  }

  // emailDomain must be globally unique (it's how a login attempt resolves
  // to an IdP) — check for a collision with a DIFFERENT org before writing.
  const domainOwner = await db.organisationSsoConfig.findUnique({ where: { emailDomain } });
  if (domainOwner && domainOwner.organisationId !== id) {
    return NextResponse.json({ error: `${emailDomain} is already configured for another organisation` }, { status: 409 });
  }

  // Explicit create/update (not upsert) — Prisma validates a `create` input's
  // required fields even on the branch that ends up unused, so an update-only
  // call that omits clientSecret would fail argument validation against
  // `create.encryptedClientSecret` even though only `update` ever runs.
  const config = existing
    ? await db.organisationSsoConfig.update({
        where: { organisationId: id },
        data: {
          emailDomain,
          issuerUrl,
          clientId,
          enabled,
          ...(clientSecret ? { encryptedClientSecret: encryptSecret(clientSecret) } : {}),
        },
      })
    : await db.organisationSsoConfig.create({
        data: {
          organisationId: id,
          emailDomain,
          issuerUrl,
          clientId,
          encryptedClientSecret: encryptSecret(clientSecret!),
          enabled,
        },
      });

  await auditLog({
    userId: session.user.id,
    action: existing ? "ORG_SSO_CONFIG_UPDATED" : "ORG_SSO_CONFIG_CREATED",
    entityType: "OrganisationSsoConfig",
    entityId: config.id,
    metadata: { orgId: id, emailDomain, issuerUrl, enabled },
  });

  return NextResponse.json({ id: config.id, emailDomain: config.emailDomain, issuerUrl: config.issuerUrl, clientId: config.clientId, enabled: config.enabled });
}

// DELETE /api/organisations/[id]/sso-config — removes the SSO integration entirely.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await checkAccess(session, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await db.organisationSsoConfig.findUnique({ where: { organisationId: id } });
  if (!existing) return NextResponse.json({ error: "No SSO configuration found" }, { status: 404 });

  await db.organisationSsoConfig.delete({ where: { organisationId: id } });

  await auditLog({
    userId: session.user.id,
    action: "ORG_SSO_CONFIG_DELETED",
    entityType: "OrganisationSsoConfig",
    entityId: existing.id,
    metadata: { orgId: id, emailDomain: existing.emailDomain },
  });

  return NextResponse.json({ ok: true });
}
