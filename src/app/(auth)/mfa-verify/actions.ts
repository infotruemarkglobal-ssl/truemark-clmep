"use server";

import { redirect } from "next/navigation";
import { verify } from "otplib";
import { getCachedSession, updateSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { SECURITY } from "@/lib/constants";

export async function verifyMfaCode(
  _: { error?: string } | null,
  formData: FormData,
): Promise<{ error: string }> {
  const code = (formData.get("code") as string | null)?.replace(/\s/g, "") ?? "";
  const next = (formData.get("next") as string | null) ?? "/dashboard";

  if (code.length !== 6 || !/^\d+$/.test(code)) {
    return { error: "Enter the 6-digit code from your authenticator app." };
  }

  const session = await getCachedSession();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { mfaSecret: true, mfaEnabled: true },
  });

  if (!user?.mfaEnabled || !user.mfaSecret) {
    return { error: "MFA not configured. Please scan the QR code first." };
  }

  const isValid = await verify({
    token: code,
    secret: user.mfaSecret,
    strategy: "totp",
    epochTolerance: SECURITY.TOTP_WINDOW,
  });

  if (!isValid) {
    return { error: "Incorrect code. Check your authenticator app and try again." };
  }

  await updateSession({ user: { mfaVerified: true } });

  const SAFE_PATH = /^\/(?!api\/|_next\/)/;
  const dest = SAFE_PATH.test(next) ? next : "/dashboard";
  redirect(dest);
}

export async function confirmMfaSetup(
  _: { error?: string } | null,
  formData: FormData,
): Promise<{ error: string }> {
  const code = (formData.get("code") as string | null)?.replace(/\s/g, "") ?? "";
  const next = (formData.get("next") as string | null) ?? "/dashboard";

  if (code.length !== 6 || !/^\d+$/.test(code)) {
    return { error: "Enter the 6-digit code shown in your authenticator app." };
  }

  const session = await getCachedSession();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { mfaSecret: true },
  });

  if (!user?.mfaSecret) {
    return { error: "Setup session expired. Please refresh the page." };
  }

  const isValid = await verify({
    token: code,
    secret: user.mfaSecret,
    strategy: "totp",
    epochTolerance: SECURITY.TOTP_WINDOW,
  });

  if (!isValid) {
    return { error: "Incorrect code. Make sure your phone's time is synced and try again." };
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { mfaEnabled: true },
  });

  await updateSession({ user: { mfaVerified: true } });

  const SAFE_PATH = /^\/(?!api\/|_next\/)/;
  const dest = SAFE_PATH.test(next) ? next : "/dashboard";
  redirect(dest);
}
