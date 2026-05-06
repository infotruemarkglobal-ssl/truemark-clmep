import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { format } from "date-fns";
import { ListChecks, ChevronRight, Inbox } from "lucide-react";

export const metadata: Metadata = { title: "Grade Queue" };
export const dynamic = "force-dynamic";

const ALLOWED = [USER_ROLES.EXAMINER, USER_ROLES.SUPER_ADMIN];

const MANUAL_TYPES = ["essay", "fill_blank"];

export default async function GradeQueuePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role as (typeof ALLOWED)[number])) redirect("/dashboard");

  // Fetch COMPLETED attempts with no ExamGrade that belong to papers containing
  // at least one manually-graded question (essay / fill_blank).
  const pending = await db.examAttempt.findMany({
    where: {
      status: "COMPLETED",
      deletedAt: null,
      grade: null,
      examPaper: {
        sections: {
          some: {
            questions: {
              some: { type: { in: MANUAL_TYPES }, isArchived: false },
            },
          },
        },
      },
    },
    select: {
      id: true,
      userId: true,
      submittedAt: true,
      examPaper: {
        select: {
          title: true,
          sections: {
            select: {
              questions: {
                where: { type: { in: MANUAL_TYPES }, isArchived: false },
                select: { id: true },
              },
            },
          },
        },
      },
    },
    orderBy: { submittedAt: "asc" },
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <ListChecks className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Grade Queue</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Exam attempts awaiting manual grading ({pending.length} pending)
          </p>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center">
          <Inbox className="w-12 h-12 mx-auto mb-3 text-slate-200" />
          <p className="font-semibold text-slate-700">Queue is clear</p>
          <p className="text-slate-500 text-sm mt-1">All submitted attempts have been graded.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                  Candidate
                </th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                  Exam Paper
                </th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                  Submitted
                </th>
                <th className="text-right px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                  Manual Qs
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pending.map((attempt) => {
                const anonymisedId = attempt.userId.slice(-4).toUpperCase();
                const manualCount = attempt.examPaper.sections.reduce(
                  (sum, s) => sum + s.questions.length,
                  0,
                );
                return (
                  <tr key={attempt.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-slate-700">
                      Candidate {anonymisedId}
                    </td>
                    <td className="px-5 py-3.5 text-slate-800 font-medium">
                      {attempt.examPaper.title}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {attempt.submittedAt
                        ? format(attempt.submittedAt, "d MMM yyyy, HH:mm")
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-0.5">
                        {manualCount}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/manage/exams/grade/${attempt.id}`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                      >
                        Grade Now <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
