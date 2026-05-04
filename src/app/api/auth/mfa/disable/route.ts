import { NextResponse } from "next/server";
import { auth, updateSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { MFA_REQUIRED_ROLES } from "@/lib/constants";

// POST /api/auth/mfa/disable — disable TOTP MFA for the current user.
// MFA-required roles (CO, Examiner, etc.) cannot disable MFA — it is enforced by policy.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Policy: MFA-required roles must always have MFA enabled. Only CANDIDATE,
  // TRAINER, and ORG_MANAGER can opt out of MFA.
  if ((MFA_REQUIRED_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json(
      { error: "MFA cannot be disabled for your role — it is required by security policy (ISO 27001 A.8.3)." },
      { status: 403 },
    );
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { mfaEnabled: false, mfaSecret: null },
  });

  // Invalidate the mfaVerified flag in the current session token
  await updateSession({ user: { mfaVerified: false } });

  await auditLog({
    userId: session.user.id,
    action: "MFA_DISABLED",
    entityType: "User",
    entityId: session.user.id,
    metadata: { method: "totp", previouslyEnabled: true },
  });

  return NextResponse.json({ ok: true });
}
