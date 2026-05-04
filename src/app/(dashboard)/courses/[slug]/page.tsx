import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import CoursePlayer from "@/components/courses/CoursePlayer";
import PaymentToast from "@/components/courses/PaymentToast";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const course = await db.course.findUnique({ where: { slug }, select: { title: true } });
  return { title: course?.title ?? "Course" };
}

export default async function CourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { slug } = await params;
  const { payment } = await searchParams;
  const session = await auth();

  const course = await db.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      shortDescription: true,
      description: true,
      cpdHours: true,
      durationHours: true,
      minProgressToExam: true,
      price: true,
      currency: true,
      scheme: { select: { id: true, name: true, code: true, validityMonths: true } },
      creator: { select: { firstName: true, lastName: true, photoUrl: true } },
      modules: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          order: true,
          lessons: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              contentType: true,
              contentUrl: true,
              contentData: true,
              durationMins: true,
              isPreview: true,
              scormPackage: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!course) notFound();

  const enrolment = session?.user
    ? await db.enrolment.findUnique({
        where: { userId_courseId: { userId: session.user.id, courseId: course.id } },
        include: { lessonProgress: true },
      })
    : null;

  // Check exam availability
  const examPaper = course.scheme
    ? await db.examPaper.findFirst({ where: { schemeId: course.scheme.id, isActive: true } })
    : null;

  const examEligible =
    !!enrolment &&
    enrolment.progress >= course.minProgressToExam &&
    !!examPaper;

  // Serialise modules/lessons (convert scormPackage to scormPackageId)
  const serialisedCourse = {
    ...course,
    modules: course.modules.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) => ({
        ...l,
        scormPackageId: l.scormPackage?.id ?? null,
        scormPackage: undefined,
      })),
    })),
  };

  return (
    <>
      {payment && <PaymentToast status={payment} />}
      <CoursePlayer
        course={serialisedCourse}
        enrolment={enrolment}
        examPaperId={examEligible ? examPaper!.id : null}
      />
    </>
  );
}
