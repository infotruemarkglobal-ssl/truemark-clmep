import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import ManageComplaintsPage from "@/components/manage/ManageComplaintsPage";

export const metadata: Metadata = { title: "Manage Complaints" };

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

  const complaints = await db.complaint.findMany({
    where: {
      ...(status ? { status } : {}),
    },
    orderBy: { submittedAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  const hasMore = complaints.length > PAGE_SIZE;
  const page = hasMore ? complaints.slice(0, PAGE_SIZE) : complaints;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const serialised = page.map((c) => ({
    id: c.id,
    reference: c.reference,
    type: c.type,
    description: c.description,
    status: c.status,
    resolution: c.resolution,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    submittedAt: c.submittedAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    submitterName: c.user ? `${c.user.firstName} ${c.user.lastName}` : (c.name ?? "Anonymous"),
    submitterEmail: c.user?.email ?? c.email ?? null,
    userId: c.userId ?? null,
  }));

  return (
    <ManageComplaintsPage
      complaints={serialised}
      nextCursor={nextCursor}
      currentStatus={status ?? null}
    />
  );
}
