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

  const org = await db.organisation.findUnique({
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
  });

  if (!org) notFound();

  // Get published courses for assignment
  const courses = await db.course.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, title: true, slug: true, cpdHours: true, scheme: { select: { code: true } } },
    orderBy: { title: "asc" },
  });

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

  const serialisedCourses = courses.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    cpdHours: c.cpdHours,
    schemeCode: c.scheme?.code ?? null,
  }));

  return (
    <OrgDetailPage
      org={serialised}
      isAdmin={session.user.role !== USER_ROLES.ORG_MANAGER}
    />
  );
}
