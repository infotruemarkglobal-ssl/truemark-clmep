import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { inngest, EVENTS } from "@/inngest/client";

// POST /api/platform/users/[id]/reset-password
// SUPER_ADMIN only. Generates a temporary password, hashes it, sets
// mustChangePassword=true, and emails it to the user via Inngest.
// The temporary password is never returned in the API response.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot reset your own password via admin action" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, firstName: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Generate temporary password: 16 hex chars + "A1!" for complexity requirements
  const temporaryPassword = randomBytes(8).toString("hex") + "A1!";
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  await db.user.update({
    where: { id },
    data: { passwordHash, mustChangePassword: true },
  });

  await auditLog({
    userId: session.user.id,
    action: "ADMIN_PASSWORD_RESET",
    entityType: "User",
    entityId: id,
    metadata: { targetEmail: user.email },
  });

  // Email temporary password — never include it in the API response
  await inngest.send({
    id: `admin-pwd-reset-${id}-${Date.now()}`,
    name: EVENTS.SEND_ADMIN_PASSWORD_RESET,
    data: {
      to: user.email,
      firstName: user.firstName,
      temporaryPassword,
    },
  }).catch((err) => console.error("[admin] inngest password reset failed:", err));

  return NextResponse.json({ success: true });
}
