import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import CertificateVerification from "@/components/certificates/CertificateVerification";

const getCertificate = cache(async (certNumber: string) =>
  db.certificate.findUnique({
    where: { certificateNumber: certNumber, deletedAt: null },
    include: {
      user: { select: { firstName: true, lastName: true } },
      scheme: true,
    },
  }),
);

// HIGH fix: force dynamic rendering so revoked certificates are never served
// from a CDN or Next.js page cache. Without this, a certificate revoked at
// 10:00 could still show "VALID" to visitors until the cache TTL expires.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ certNumber: string }>;
}): Promise<Metadata> {
  const { certNumber } = await params;
  const cert = await getCertificate(certNumber);
  if (!cert) return { title: "Certificate Not Found" };
  return { title: `Certificate ${certNumber} — ${cert.scheme.name}` };
}

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ certNumber: string }>;
}) {
  const { certNumber } = await params;

  // ── Rate limit ────────────────────────────────────────────────────────────
  // This page is public (no login required) and performs a DB lookup on every
  // render (force-dynamic). Without a rate limit an attacker can enumerate all
  // certificate numbers and harvest holder names + scheme details.
  // 30 lookups / minute per IP — enough for an employer doing spot-checks,
  // tight enough to make serial enumeration impractical.
  const hdrs = await headers();
  const ip = hdrs.get("x-real-ip") ?? hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await rateLimit(ip, "cert-verify", { limit: 30, windowMs: 60_000 });
  if (!rl.success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Too many requests</h1>
          <p className="text-slate-500 text-sm">
            Please wait a moment before verifying another certificate.
          </p>
        </div>
      </div>
    );
  }

  const certificate = await getCertificate(certNumber);

  if (!certificate) {
    return (
      <CertificateVerification
        result="not_found"
        certNumber={certNumber}
        certificate={null}
      />
    );
  }

  return (
    <>
      <CertificateVerification
        result={certificate.status === "ACTIVE" ? "valid" : "invalid"}
        certNumber={certNumber}
        certificate={{
          certificateNumber: certificate.certificateNumber,
          status: certificate.status,
          issuedAt: certificate.issuedAt.toISOString(),
          expiresAt: certificate.expiresAt?.toISOString() ?? null,
          holderName: `${certificate.user.firstName} ${certificate.user.lastName}`,
          scheme: {
            name: certificate.scheme.name,
            code: certificate.scheme.code,
            description: certificate.scheme.description ?? null,
            validityMonths: certificate.scheme.validityMonths,
          },
          qrCodeUrl: certificate.qrCodeUrl,
          openBadgeJson: certificate.openBadgeJson
            ? JSON.parse(certificate.openBadgeJson) as Record<string, unknown>
            : null,
        }}
      />
      <div className="text-center pb-6 flex items-center justify-center gap-4 flex-wrap">
        <a
          href="/registry"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
        >
          View Full Certificate Register →
        </a>
        <span className="text-slate-200 text-xs">|</span>
        <a
          href="/about"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
        >
          About TrueMark Global →
        </a>
      </div>
    </>
  );
}
