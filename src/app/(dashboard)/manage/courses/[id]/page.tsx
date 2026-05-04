import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import CourseEditor from "@/components/manage/CourseEditor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const course = await db.course.findFirst({ where: { id }, select: { title: true } });
  return { title: course ? `Edit: ${course.title}` : "Course Editor" };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.TRAINER];
  if (!(ALLOWED as string[]).includes(session.user.role)) redirect("/dashboard");

  // Use findFirst (not findUnique) to avoid Prisma uniqueness-only constraint
  // Fetch modules+lessons separately from nested SCORM to avoid client version issues
  const course = await db.course.findFirst({
    where: { id },
    include: {
      scheme: { select: { id: true, name: true, code: true } },
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: { orderBy: { order: "asc" } },
        },
      },
    },
  });

  if (!course) notFound();

  const isAdmin = ([USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER] as string[]).includes(session.user.role);
  if (!isAdmin && course.creatorId !== session.user.id) redirect("/manage/courses");

  // Collect all lesson IDs to look up linked SCORM packages
  const allLessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));

  const [schemes, allScormPackages] = await Promise.all([
    db.certificationScheme.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    }),
    // Fetch all SCORM packages (linked or not) so we can join to lessons
    db.sCORMPackage.findMany({
      select: { id: true, title: true, version: true, lessonId: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Build a map: lessonId -> scorm package info
  const scormByLesson = new Map<string, { id: string; title: string }>();
  for (const pkg of allScormPackages) {
    if (pkg.lessonId && allLessonIds.includes(pkg.lessonId)) {
      scormByLesson.set(pkg.lessonId, { id: pkg.id, title: pkg.title });
    }
  }

  // Packages with no lesson assigned (available to link)
  const unlinkedScorm = allScormPackages.filter((p) => !p.lessonId);

  const serialised = {
    id: course.id,
    title: course.title,
    slug: course.slug,
    description: course.description ?? "",
    shortDescription: course.shortDescription ?? "",
    status: course.status,
    price: course.price,
    currency: course.currency,
    cpdHours: course.cpdHours,
    durationHours: course.durationHours,
    minProgressToExam: course.minProgressToExam,
    thumbnailUrl: course.thumbnailUrl,
    scheme: course.scheme,
    modules: course.modules.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      order: m.order,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        contentType: l.contentType,
        contentUrl: l.contentUrl,
        contentData: l.contentData,
        durationMins: l.durationMins,
        isPreview: l.isPreview,
        order: l.order,
        scormPackage: scormByLesson.get(l.id) ?? null,
      })),
    })),
  };

  return (
    <CourseEditor
      course={serialised}
      schemes={schemes}
      scormPackages={unlinkedScorm}
    />
  );
}
