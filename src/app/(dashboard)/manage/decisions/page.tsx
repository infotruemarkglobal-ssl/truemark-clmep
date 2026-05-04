import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import CertificationDecisionsPage from "@/components/manage/CertificationDecisionsPage";

export const metadata: Metadata = { title: "Certification Decisions" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];
  if (!(ALLOWED as string[]).includes(session.user.role)) redirect("/dashboard");

  const [pendingAttempts, recentDecisions] = await Promise.all([
    db.examAttempt.findMany({
      where: { status: "COMPLETED", certificationDecision: null, deletedAt: null },
      orderBy: { submittedAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        examPaper: {
          select: {
            id: true,
            title: true,
            passMark: true,
            scheme: { select: { id: true, name: true, code: true } },
          },
        },
      },
    }),
    db.certificationDecision.findMany({
      orderBy: { decidedAt: "desc" },
      take: 50,
      include: {
        attempt: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
            examPaper: { select: { title: true, scheme: { select: { name: true, code: true } } } },
          },
        },
        certificationOfficer: { select: { firstName: true, lastName: true } },
        certificate: { select: { id: true, certificateNumber: true } },
      },
    }),
  ]);

  const serialisedPending = pendingAttempts.map((a) => ({
    id: a.id,
    candidateName: `${a.user.firstName} ${a.user.lastName}`,
    candidateEmail: a.user.email,
    examTitle: a.examPaper.title,
    passMark: a.examPaper.passMark,
    percentageScore: a.percentageScore,
    passed: a.passed,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    scheme: a.examPaper.scheme
      ? { id: a.examPaper.scheme.id, name: a.examPaper.scheme.name, code: a.examPaper.scheme.code }
      : null,
  }));

  const serialisedDecisions = recentDecisions.map((d) => ({
    id: d.id,
    decision: d.decision,
    justification: d.justification,
    decidedAt: d.decidedAt.toISOString(),
    candidateName: `${d.attempt.user.firstName} ${d.attempt.user.lastName}`,
    candidateEmail: d.attempt.user.email,
    examTitle: d.attempt.examPaper.title,
    scheme: d.attempt.examPaper.scheme
      ? { name: d.attempt.examPaper.scheme.name, code: d.attempt.examPaper.scheme.code }
      : null,
    officer: `${d.certificationOfficer.firstName} ${d.certificationOfficer.lastName}`,
    certificate: d.certificate
      ? { id: d.certificate.id, number: d.certificate.certificateNumber }
      : null,
  }));

  return (
    <CertificationDecisionsPage
      pendingAttempts={serialisedPending}
      recentDecisions={serialisedDecisions}
    />
  );
}
