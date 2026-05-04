import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { generateSecret, generateURI } from "otplib";
import { getCachedSession } from "@/lib/auth";
import { db } from "@/lib/db";
import MfaVerifyForm from "./MfaVerifyForm";
import MfaSetupForm from "./MfaSetupForm";

export const metadata: Metadata = { title: "Two-Factor Verification" };

export default async function MfaVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getCachedSession();
  if (!session?.user?.id) redirect("/login");

  const { next = "/dashboard" } = await searchParams;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { mfaEnabled: true, mfaSecret: true, email: true },
  });

  // MFA is fully configured — show the verify form
  if (user?.mfaEnabled && user.mfaSecret) {
    return (
      <div className="w-full max-w-sm mx-auto bg-white rounded-2xl shadow-2xl p-8">
        <MfaVerifyForm next={next} />
      </div>
    );
  }

  // MFA not set up yet — generate a secret (reuse if one was already saved from a previous attempt)
  let secret = user?.mfaSecret ?? null;
  if (!secret) {
    secret = generateSecret();
    await db.user.update({
      where: { id: session.user.id },
      data: { mfaSecret: secret },
    });
  }

  const uri = generateURI({
    strategy: "totp",
    issuer: "Truemark Global",
    label: user?.email ?? session.user.email,
    secret,
  });

  const qrDataUrl = await QRCode.toDataURL(uri, { width: 220, margin: 1 });

  return (
    <div className="w-full max-w-sm mx-auto bg-white rounded-2xl shadow-2xl p-8">
      <MfaSetupForm next={next} qrDataUrl={qrDataUrl} secret={secret} />
    </div>
  );
}
