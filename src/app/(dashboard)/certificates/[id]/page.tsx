import { notFound, redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function CertificateByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const cert = await db.certificate.findUnique({
    where: { id, deletedAt: null },
    select: { certificateNumber: true, userId: true },
  });

  if (!cert) notFound();

  // Redirect to the public verify page using the certificate number
  redirect(`/verify/${cert.certificateNumber}`);
}
