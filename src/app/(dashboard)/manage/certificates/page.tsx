import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import ManageCertificatesPage from "@/components/manage/ManageCertificatesPage";

export const metadata: Metadata = { title: "Manage Certificates" };

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(ALLOWED as string[]).includes(session.user.role)) redirect("/dashboard");

  const { status, cursor } = await searchParams;
  const PAGE_SIZE = 25;

  const certificates = await db.certificate.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status } : {}),
    },
    orderBy: { issuedAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      scheme: { select: { name: true, code: true } },
    },
  });

  const hasMore = certificates.length > PAGE_SIZE;
  const page = hasMore ? certificates.slice(0, PAGE_SIZE) : certificates;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const serialised = page.map((c) => ({
    id: c.id,
    certificateNumber: c.certificateNumber,
    status: c.status,
    issuedAt: c.issuedAt.toISOString(),
    expiresAt: c.expiresAt?.toISOString() ?? null,
    holderName: `${c.user.firstName} ${c.user.lastName}`,
    holderEmail: c.user.email,
    holderId: c.user.id,
    schemeName: c.scheme.name,
    schemeCode: c.scheme.code,
  }));

  return (
    <ManageCertificatesPage
      certificates={serialised}
      nextCursor={nextCursor}
      currentStatus={status ?? null}
    />
  );
}
