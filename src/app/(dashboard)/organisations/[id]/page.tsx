import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import OrgDetailPage from "@/components/organisations/OrgDetailPage";

export const metadata: Metadata = { title: "Organisation" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.ORG_MANAGER];
  if (!(ALLOWED as string[]).includes(session.user.role)) redirect("/dashboard");

  const { id } = await params;

  // ORG_MANAGER must be a member of this org
  if (session.user.role === USER_ROLES.ORG_MANAGER) {
    const membership = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId: session.user.id, organisationId: id } },
    });
    if (!membership) redirect("/dashboard");
  }

  // Run all primary queries in parallel — org notFound check gates the secondary
  // user/course resolution for payment history below.
  const [org, assignableCourses, purchases, certCount, activeEnrolments, completedEnrolments, totalPayments] =
    await Promise.all([
      db.organisation.findUnique({
        where: { id },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true, firstName: true, lastName: true, email: true,
                  role: true, status: true, lastLoginAt: true,
                  enrolments: {
                    select: { courseId: true, status: true, progress: true },
                  },
                },
              },
              department: { select: { id: true, name: true } },
            },
            orderBy: { joinedAt: "desc" },
          },
          departments: { select: { id: true, name: true } },
        },
      }),
      // Published courses available for bulk assignment to org members
      db.course.findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, title: true, slug: true, cpdHours: true, scheme: { select: { code: true } } },
        orderBy: { title: "asc" },
      }),
      // Last 10 purchases for this org — user names resolved via secondary lookup below
      db.purchase.findMany({
        where: { organisationId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true, amount: true, currency: true, status: true,
          description: true, paystackReference: true,
          paidAt: true, createdAt: true, userId: true, courseId: true,
        },
      }),
      // Certificates issued under this org's sponsorship (ISO 17024 Cl.9.5)
      db.certificate.count({ where: { organisationId: id, status: "ACTIVE", deletedAt: null } }),
      db.enrolment.count({ where: { organisationId: id, status: "ACTIVE" } }),
      db.enrolment.count({ where: { organisationId: id, status: "COMPLETED" } }),
      db.purchase.count({ where: { organisationId: id } }),
    ]);

  if (!org) notFound();

  // Resolve individual payer names and course titles for the payment history tab.
  // Purchase has no Prisma user/course relations so we batch-fetch separately.
  const payerIds = [...new Set(purchases.flatMap((p) => (p.userId ? [p.userId] : [])))];
  const paymentCourseIds = [...new Set(purchases.flatMap((p) => (p.courseId ? [p.courseId] : [])))];

  const [payerUsers, paymentCourses] = await Promise.all([
    payerIds.length
      ? db.user.findMany({
          where: { id: { in: payerIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : Promise.resolve([]),
    paymentCourseIds.length
      ? db.course.findMany({
          where: { id: { in: paymentCourseIds } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
  ]);

  const payerMap = new Map(payerUsers.map((u) => [u.id, u]));
  const paymentCourseMap = new Map(paymentCourses.map((c) => [c.id, c]));

  const serialised = {
    id: org.id,
    name: org.name,
    registrationNo: org.registrationNo,
    country: org.country,
    address: org.address,
    website: org.website,
    logoUrl: org.logoUrl,
    description: org.description,
    industry: org.industry,
    cacDocumentUrl: org.cacDocumentUrl,
    verificationStatus: org.verificationStatus,
    verificationNotes: org.verificationNotes,
    approvedSchemes: org.approvedSchemes,
    isActive: org.isActive,
    departments: org.departments,
    members: org.members.map((m) => ({
      id: m.id,
      joinedAt: m.joinedAt.toISOString(),
      role: m.role,
      department: m.department,
      user: {
        id: m.user.id,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        email: m.user.email,
        role: m.user.role,
        status: m.user.status,
        lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
        enrolments: m.user.enrolments,
      },
    })),
  };

  const serialisedCourses = assignableCourses.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    cpdHours: c.cpdHours,
    schemeCode: c.scheme?.code ?? null,
  }));

  const serialisedPayments = purchases.map((p) => ({
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    description: p.description,
    paystackReference: p.paystackReference,
    date: (p.paidAt ?? p.createdAt).toISOString(),
    payer: p.userId ? (payerMap.get(p.userId) ?? null) : null,
    courseTitle: p.courseId ? (paymentCourseMap.get(p.courseId)?.title ?? null) : null,
  }));

  return (
    <OrgDetailPage
      org={serialised}
      isAdmin={session.user.role !== USER_ROLES.ORG_MANAGER}
      courses={serialisedCourses}
      payments={serialisedPayments}
      certCount={certCount}
      activeEnrolments={activeEnrolments}
      completedEnrolments={completedEnrolments}
      totalPayments={totalPayments}
    />
  );
}
