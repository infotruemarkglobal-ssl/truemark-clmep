import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import ScormManagePage from "@/components/manage/ScormManagePage";

export const metadata: Metadata = { title: "SCORM Packages" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.TRAINER];
  if (!(ALLOWED as string[]).includes(session.user.role)) redirect("/dashboard");

  const [packages, lessons] = await Promise.all([
    db.sCORMPackage.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            module: { select: { course: { select: { title: true } } } },
          },
        },
        _count: { select: { sessions: true } },
      },
    }),
    // Get all SCORM-type lessons that don't yet have a package
    db.courseLesson.findMany({
      where: { contentType: "scorm", scormPackage: null },
      select: {
        id: true,
        title: true,
        module: { select: { course: { select: { title: true } } } },
      },
      orderBy: { title: "asc" },
    }),
  ]);

  const serialisedPackages = packages.map((p) => ({
    id: p.id,
    title: p.title,
    version: p.version,
    launchUrl: p.launchUrl,
    createdAt: p.createdAt.toISOString(),
    sessionCount: p._count.sessions,
    lesson: p.lesson
      ? {
          id: p.lesson.id,
          title: p.lesson.title,
          courseTitle: p.lesson.module.course.title,
        }
      : null,
  }));

  const serialisedLessons = lessons.map((l) => ({
    id: l.id,
    title: l.title,
    courseTitle: l.module.course.title,
  }));

  return <ScormManagePage packages={serialisedPackages} availableLessons={serialisedLessons} />;
}
