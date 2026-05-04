import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import OrgMembersPage from "@/components/organisations/OrgMembersPage";

export const metadata: Metadata = { title: "Members & Courses" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Only ORG_MANAGER uses this route (admins go to /organisations/{id})
  if (session.user.role !== USER_ROLES.ORG_MANAGER) redirect("/organisations");

  const membership = await db.organisationMember.findFirst({
    where: { userId: session.user.id },
    select: { organisationId: true },
  });
  if (!membership) redirect("/dashboard");

  const orgId = membership.organisationId;

  const [org, members, courses, departments] = await Promise.all([
    db.organisation.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    }),
    db.organisationMember.findMany({
      where: { organisationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            status: true,
            lastLoginAt: true,
            mustChangePassword: true,
            enrolments: {
              select: {
                courseId: true,
                status: true,
                progress: true,
                course: { select: { id: true, title: true, slug: true } },
              },
            },
          },
        },
        department: { select: { id: true, name: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
    db.course.findMany({
      where: { status: "PUBLISHED" },
      select: {
        id: true,
        title: true,
        slug: true,
        cpdHours: true,
        price: true,
        currency: true,
        scheme: { select: { code: true, name: true } },
      },
      orderBy: { title: "asc" },
    }),
    db.department.findMany({
      where: { organisationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!org) redirect("/dashboard");

  return (
    <OrgMembersPage
      org={org}
      members={members.map((m) => ({
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
          mustChangePassword: m.user.mustChangePassword,
          enrolments: m.user.enrolments.map((e) => ({
            courseId: e.courseId,
            status: e.status,
            progress: e.progress,
            course: e.course,
          })),
        },
      }))}
      courses={courses.map((c) => ({
        id: c.id,
        title: c.title,
        slug: c.slug,
        cpdHours: c.cpdHours,
        price: c.price,
        currency: c.currency,
        schemeCode: c.scheme?.code ?? null,
        schemeName: c.scheme?.name ?? null,
      }))}
      departments={departments}
    />
  );
}
