"use client";

import { useRouter } from "next/navigation";
import { format, differenceInMinutes } from "date-fns";
import {
  CheckCircle2, XCircle, Clock, Award, ChevronRight,
  RotateCcw, BookOpen, HelpCircle, Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type ResponseSummary = {
  questionId: string;
  questionText: string;
  questionType: string;
  marks: number;
  isCorrect: boolean | null;
  marksAwarded: number | null;
};

type AttemptResult = {
  id: string;
  examPaperId: string;
  status: string;
  score: number | null;
  passed: boolean | null;
  startedAt: string;
  submittedAt: string | null;
  examPaper: {
    title: string;
    passMark: number;
    timeLimitMins: number;
    scheme: { name: string; code: string } | null;
  };
  responseSummary: ResponseSummary[];
};

export default function ExamResult({
  attempt,
  attemptsLeft,
  courseSlug,
}: {
  attempt: AttemptResult;
  attemptsLeft: number;
  courseSlug: string | null;
}) {
  const router = useRouter();

  const score = attempt.score !== null ? Math.round(attempt.score) : null;
  const passed = attempt.passed ?? false;
  const timeTaken = attempt.submittedAt
    ? differenceInMinutes(new Date(attempt.submittedAt), new Date(attempt.startedAt))
    : null;

  const autoGraded = attempt.responseSummary.filter((r) => r.isCorrect !== null);
  const pendingGrade = attempt.responseSummary.filter((r) => r.isCorrect === null);
  const correct = autoGraded.filter((r) => r.isCorrect).length;
  const incorrect = autoGraded.filter((r) => !r.isCorrect).length;

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      {/* Result card */}
      <div className={cn(
        "rounded-2xl border shadow-sm p-8 text-center",
        passed
          ? "bg-linear-to-br from-emerald-50 to-white border-emerald-200"
          : "bg-linear-to-br from-red-50 to-white border-red-200"
      )}>
        <div className={cn(
          "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4",
          passed ? "bg-emerald-100" : "bg-red-100"
        )}>
          {passed
            ? <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            : <XCircle className="w-10 h-10 text-red-500" />}
        </div>

        <h1 className={cn(
          "text-3xl font-bold mb-1",
          passed ? "text-emerald-800" : "text-red-700"
        )}>
          {passed ? "Congratulations!" : "Not This Time"}
        </h1>

        <p className={cn("text-sm mb-6", passed ? "text-emerald-700" : "text-red-600")}>
          {passed
            ? "You have passed the examination. Your result will be reviewed by a Certification Officer."
            : `You did not meet the pass mark of ${attempt.examPaper.passMark}%.${attemptsLeft > 0 ? " You may retake the exam." : ""}`}
        </p>

        {/* Score display */}
        {score !== null && (
          <div className="mb-6">
            <div className={cn("text-6xl font-black mb-2", passed ? "text-emerald-600" : "text-red-500")}>
              {score}%
            </div>
            <p className="text-sm text-slate-500">
              Pass mark: {attempt.examPaper.passMark}%
            </p>
            <div className="mt-4 max-w-xs mx-auto">
              <Progress value={score} className="h-3" />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>0%</span>
                <span className="text-primary font-medium">{attempt.examPaper.passMark}% pass</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        )}

        {pendingGrade.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 text-left">
            <HelpCircle className="w-4 h-4 inline mr-1.5 shrink-0" />
            {pendingGrade.length} essay question{pendingGrade.length !== 1 ? "s are" : " is"} pending manual grading by an examiner.
            Your final score may change after grading is complete.
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Correct", value: correct, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
          { label: "Incorrect", value: incorrect, icon: XCircle, color: "text-red-500 bg-red-50" },
          { label: "Pending", value: pendingGrade.length, icon: HelpCircle, color: "text-amber-600 bg-amber-50" },
          {
            label: "Time Taken",
            value: timeTaken !== null ? `${timeTaken}m` : "—",
            icon: Clock,
            color: "text-blue-600 bg-blue-50",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2", color.split(" ")[1])}>
              <Icon className={cn("w-5 h-5", color.split(" ")[0])} />
            </div>
            <p className="text-xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Exam info */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Attempt Details</h2>
        <div className="space-y-3 text-sm">
          {[
            { label: "Examination", value: attempt.examPaper.title },
            attempt.examPaper.scheme && { label: "Scheme", value: attempt.examPaper.scheme.name },
            { label: "Started", value: format(new Date(attempt.startedAt), "d MMM yyyy, HH:mm") },
            attempt.submittedAt && { label: "Submitted", value: format(new Date(attempt.submittedAt), "d MMM yyyy, HH:mm") },
            { label: "Reference", value: attempt.id.slice(0, 8).toUpperCase(), mono: true },
          ].filter(Boolean).map((row) => {
            const { label, value, mono } = row as { label: string; value: string; mono?: boolean };
            return (
              <div key={label} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                <span className="text-slate-500">{label}</span>
                <span className={cn("font-medium text-slate-900", mono && "font-mono text-xs")}>{value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Question breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900 text-sm">Question Breakdown</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {attempt.responseSummary.map((r, i) => (
            <div key={r.questionId} className="flex items-start gap-3 px-4 py-3">
              <div className="shrink-0 mt-0.5">
                {r.isCorrect === null
                  ? <Minus className="w-4 h-4 text-amber-500" />
                  : r.isCorrect
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    : <XCircle className="w-4 h-4 text-red-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 line-clamp-2">
                  <span className="font-medium text-slate-500 mr-1">Q{i + 1}.</span>
                  {r.questionText}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 capitalize">{r.questionType.replace(/_/g, " ")}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={cn(
                  "text-xs font-semibold",
                  r.isCorrect === null ? "text-amber-500" : r.isCorrect ? "text-emerald-600" : "text-red-500"
                )}>
                  {r.marksAwarded !== null ? r.marksAwarded : "—"}/{r.marks}
                </p>
                {r.isCorrect === null && (
                  <Badge className="text-[9px] bg-amber-100 text-amber-700 border-0 mt-0.5">Pending</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          variant="outline"
          onClick={() => router.push(courseSlug ? `/courses/${courseSlug}` : "/courses")}
          className="flex-1 gap-2"
        >
          <BookOpen className="w-4 h-4" />
          {courseSlug ? "Back to Course" : "Back to Courses"}
        </Button>
        {!passed && attemptsLeft > 0 && (
          <Button
            onClick={() => router.push(`/exams/${attempt.examPaperId}`)}
            className="flex-1 gap-2"
          >
            <RotateCcw className="w-4 h-4" /> Retake Exam ({attemptsLeft} left)
          </Button>
        )}
        {passed && (
          <Button
            onClick={() => router.push("/certificates")}
            className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <Award className="w-4 h-4" /> View Certificates <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
