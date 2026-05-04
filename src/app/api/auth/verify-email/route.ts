import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  if (!token || !email) {
    return NextResponse.redirect(new URL("/verify-email?error=missing", req.url));
  }

  const record = await db.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });

  if (!record) {
    return NextResponse.redirect(new URL("/verify-email?error=invalid", req.url));
  }

  if (record.expires < new Date()) {
    await db.verificationToken.delete({
      where: { identifier_token: { identifier: email, token } },
    });
    return NextResponse.redirect(new URL("/verify-email?error=expired", req.url));
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.redirect(new URL("/verify-email?error=invalid", req.url));
  }

  // Activate the account
  await db.user.update({
    where: { id: user.id },
    data: { status: "ACTIVE", emailVerified: new Date() },
  });

  await db.verificationToken.delete({
    where: { identifier_token: { identifier: email, token } },
  });

  await auditLog({
    userId: user.id,
    action: "EMAIL_VERIFIED",
    entityType: "User",
    entityId: user.id,
    metadata: { email },
  });

  return NextResponse.redirect(new URL("/verify-email?success=1", req.url));
}
