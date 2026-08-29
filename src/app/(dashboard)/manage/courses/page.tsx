import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { can } from "@/lib/permissions";
import ManageCoursesPage from "@/components/manage/ManageCoursesPage";

export const metadata: Metadata = { title: "Manage Courses" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // courses:read is granted broadly (CANDIDATE, ORG_MANAGER, EXAMINER all hold
  // it too, for browsing the public catalog) — this is the admin management
  // panel, and its sibling API (src/app/api/manage/courses/route.ts) has always
  // ceiling-restricted this to SUPER_ADMIN/CO/TRAINER. A bare check here would
  // let any courses:read holder reach this page.
  if (!(await can(session, "courses:read", ["SUPER_ADMIN", "CERTIFICATION_OFFICER", "TRAINER"]))) redirect("/dashboard");

  const isSuperAdmin = session.user.role === USER_ROLES.SUPER_ADMIN;

  // Trainers only see their own courses; admins see all
  const [courses, schemes] = await Promise.all([
    db.course.findMany({
      where: isSuperAdmin || session.user.role === USER_ROLES.CERTIFICATION_OFFICER
        ? undefined
        : { creatorId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { firstName: true, lastName: true } },
        scheme: { select: { name: true, code: true } },
        _count: { select: { modules: true, enrolments: true } },
      },
    }),
    db.certificationScheme.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const serialised = courses.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    status: c.status,
    price: c.price,
    currency: c.currency,
    cpdHours: c.cpdHours,
    durationHours: c.durationHours,
    thumbnailUrl: c.thumbnailUrl,
    createdAt: c.createdAt.toISOString(),
    publishedAt: c.publishedAt?.toISOString() ?? null,
    creator: c.creator,
    scheme: c.scheme,
    moduleCount: c._count.modules,
    enrolmentCount: c._count.enrolments,
  }));

  return (
    <ManageCoursesPage
      courses={serialised}
      schemes={schemes}
      canCreate={true}
    />
  );
}
