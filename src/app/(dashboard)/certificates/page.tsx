import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import CertificateList from "@/components/certificates/CertificateList";

export const metadata: Metadata = { title: "My Certificates" };

export default async function CertificatesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const certificates = await db.certificate.findMany({
    where: { userId: session.user.id, deletedAt: null },
    orderBy: { issuedAt: "desc" },
    include: {
      scheme: { select: { name: true, code: true, validityMonths: true } },
      renewals: { select: { id: true } },
    },
  });

  const serialised = certificates.map((c) => ({
    id: c.id,
    certificateNumber: c.certificateNumber,
    status: c.status,
    issuedAt: c.issuedAt.toISOString(),
    expiresAt: (c.expiresAt ?? new Date()).toISOString(),
    qrCodeUrl: c.qrCodeUrl,
    scheme: c.scheme,
    renewals: c.renewals,
  }));

  return <CertificateList certificates={serialised} />;
}
