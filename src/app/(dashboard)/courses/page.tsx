import type { Metadata } from "next";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import CourseCatalog from "@/components/courses/CourseCatalog";
import PaymentToast from "@/components/courses/PaymentToast";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment } = await searchParams;
  const session = await auth();

  const [courses, enrolments] = await Promise.all([
    db.course.findMany({
      where: { status: "PUBLISHED" },
      include: {
        scheme: { select: { name: true, code: true } },
        creator: { select: { firstName: true, lastName: true } },
        _count: { select: { enrolments: true } },
      },
      orderBy: { publishedAt: "desc" },
    }),
    session?.user
      ? db.enrolment.findMany({
          where: { userId: session.user.id },
          select: { courseId: true, progress: true, status: true },
        })
      : [],
  ]);

  const enrolmentMap = Object.fromEntries(
    enrolments.map((e) => [e.courseId, { progress: e.progress, status: e.status }])
  );

  return (
    <>
      {payment && <PaymentToast status={payment} />}
      <CourseCatalog courses={courses} enrolmentMap={enrolmentMap} />
    </>
  );
}
