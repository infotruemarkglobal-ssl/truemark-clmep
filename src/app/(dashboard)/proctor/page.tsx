import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import ProctorMonitorPage from "@/components/proctor/ProctorMonitorPage";

export const metadata: Metadata = { title: "Live Exam Monitoring — TrueMark Platform" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const allowed = [USER_ROLES.PROCTOR, USER_ROLES.SUPER_ADMIN] as string[];
  if (!allowed.includes(session.user.role)) redirect("/dashboard");

  const sessions = await db.proctoringSession.findMany({
    where: { status: "active" },
    include: {
      attempt: {
        include: {
          examPaper: { select: { title: true } },
          user: { select: { firstName: true, lastName: true } },
        },
      },
      incidents: {
        orderBy: { timestamp: "desc" },
        take: 3,
        select: { id: true, type: true, severity: true, timestamp: true },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  const serialised = sessions.map((s) => ({
    id: s.id,
    flagCount: s.flagCount,
    startedAt: s.startedAt.toISOString(),
    candidateName: `${s.attempt.user.firstName} ${s.attempt.user.lastName}`,
    examTitle: s.attempt.examPaper.title,
    incidents: s.incidents.map((i) => ({
      id: i.id,
      type: i.type,
      severity: i.severity,
      timestamp: i.timestamp.toISOString(),
    })),
  }));

  return <ProctorMonitorPage sessions={serialised} />;
}
