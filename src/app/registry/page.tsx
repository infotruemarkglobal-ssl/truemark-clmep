import type { Metadata } from "next";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import CertificateRegistry from "@/components/registry/CertificateRegistry";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Certificate Register — Truemark Global",
  description:
    "Publicly verified certifications issued by Truemark Global under ISO/IEC 17024:2012. " +
    "Search the register to confirm a certificate holder's credentials.",
};

export default async function RegistryPage() {
  // Rate limit: 60 requests/minute per IP — generous for legitimate browsing,
  // tight enough to deter serial enumeration of holder names.
  const hdrs = await headers();
  const ip =
    hdrs.get("x-real-ip") ??
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const rl = await rateLimit(ip, "cert-registry", { limit: 60, windowMs: 60_000 });
  if (!rl.success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Too many requests</h1>
          <p className="text-slate-500 text-sm">
            Please wait a moment before accessing the certificate register.
          </p>
        </div>
      </div>
    );
  }

  const now = new Date();

  const certificates = await db.certificate.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      certificateNumber: true,
      issuedAt: true,
      expiresAt: true,
      status: true,
      user: { select: { firstName: true, lastName: true } },
      scheme: { select: { id: true, name: true, code: true, description: true } },
    },
    orderBy: { issuedAt: "desc" },
  });

  const schemes = await db.certificationScheme.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  const entries = certificates.map((c) => ({
    certificateNumber: c.certificateNumber,
    issuedAt: c.issuedAt.toISOString(),
    expiresAt: c.expiresAt?.toISOString() ?? null,
    holderName: `${c.user.firstName} ${c.user.lastName}`,
    scheme: c.scheme,
  }));

  return <CertificateRegistry entries={entries} schemes={schemes} />;
}
