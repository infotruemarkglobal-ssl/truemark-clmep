"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, isPast, formatDistanceToNow } from "date-fns";
import {
  ClipboardList, Clock, Calendar, CheckCircle2, XCircle,
  AlertCircle, ChevronRight, BookOpen, Award, Lock, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type ExamPaperSummary = {
  id: string;
  title: string;
  timeLimitMins: number;
  passMark: number;
  maxAttempts: number;
  scheme: { name: string; code: string } | null;
  _count: { questions: number };
};

type ExamAttemptSummary = {
  id: string;
  examPaperId: string;
  status: string;
  score: number | null;
  passed: boolean | null;
  startedAt: string;
  submittedAt: string | null;
};

type EligibleCourse = {
  id: string;
  title: string;
  slug: string;
  progress: number;
  examPaper: ExamPaperSummary | null;
};

export default function ExamList({
  eligibleCourses,
  attempts,
}: {
  eligibleCourses: EligibleCourse[];
  attempts: ExamAttemptSummary[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"available" | "history">("available");

  const attemptsByPaper = attempts.reduce<Record<string, ExamAttemptSummary[]>>((acc, a) => {
    (acc[a.examPaperId] ??= []).push(a);
    return acc;
  }, {});

  const availableExams = eligibleCourses.filter((c) => c.examPaper);
  const completedAttempts = attempts.filter((a) => a.status === "COMPLETED");

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Certification Exams</h1>
        <p className="text-slate-500 text-sm mt-1">Book and sit proctored certification examinations</p>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Available", value: availableExams.length, icon: ClipboardList, color: "text-primary" },
          { label: "Attempts", value: attempts.length, icon: BookOpen, color: "text-blue-600" },
          { label: "Passed", value: completedAttempts.filter((a) => a.passed).length, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "In Progress", value: attempts.filter((a) => a.status === "IN_PROGRESS").length, icon: Clock, color: "text-amber-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
            <Icon className={cn("w-8 h-8 shrink-0", color)} />
            <div>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-px">
        {(["available", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition border-b-2 -mb-px",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {t === "available" ? `Available (${availableExams.length})` : `History (${attempts.length})`}
          </button>
        ))}
      </div>

      {/* Available exams */}
      {tab === "available" && (
        <div className="space-y-4">
          {availableExams.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <Lock className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p className="font-medium text-slate-700">No exams available yet</p>
              <p className="text-sm text-slate-500 mt-1">Complete the required course progress to unlock certification exams.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push("/courses")}>
                Go to Courses
              </Button>
            </div>
          ) : (
            availableExams.map((course) => {
              const paper = course.examPaper!;
              const courseAttempts = attemptsByPaper[paper.id] ?? [];
              const attemptsUsed = courseAttempts.length;
              const latestAttempt = courseAttempts[0];
              const hasPassed = courseAttempts.some((a) => a.passed);
              const attemptsLeft = paper.maxAttempts - attemptsUsed;
              const inProgress = courseAttempts.find((a) => a.status === "IN_PROGRESS");

              return (
                <div key={course.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {paper.scheme && (
                            <Badge className="bg-primary/10 text-primary border-0">{paper.scheme.code}</Badge>
                          )}
                          {hasPassed && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Passed
                            </Badge>
                          )}
                          {inProgress && (
                            <Badge className="bg-amber-100 text-amber-700 border-0 gap-1">
                              <Clock className="w-3 h-3" /> In Progress
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-semibold text-slate-900 text-lg">{paper.title}</h3>
                        <p className="text-sm text-slate-500 mt-0.5">Course: {course.title}</p>

                        {/* Exam meta */}
                        <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-600">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-slate-400" /> {paper.timeLimitMins} mins
                          </span>
                          <span className="flex items-center gap-1.5">
                            <ClipboardList className="w-4 h-4 text-slate-400" /> {paper._count.questions} questions
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Award className="w-4 h-4 text-slate-400" /> Pass mark: {paper.passMark}%
                          </span>
                          <span className="flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 text-slate-400" />
                            {attemptsLeft > 0
                              ? `${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} remaining`
                              : "No attempts remaining"}
                          </span>
                        </div>

                        {/* Course progress */}
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>Course progress</span>
                            <span className="font-medium text-primary">{Math.round(course.progress)}%</span>
                          </div>
                          <Progress value={course.progress} className="h-1.5" />
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        {inProgress ? (
                          <Button
                            onClick={() => router.push(`/exams/${paper.id}`)}
                            className="gap-2"
                          >
                            Resume Exam <ChevronRight className="w-4 h-4" />
                          </Button>
                        ) : attemptsLeft > 0 && !hasPassed ? (
                          <Button
                            onClick={() => router.push(`/exams/${paper.id}`)}
                            className="gap-2"
                          >
                            {attemptsUsed === 0 ? "Start Exam" : "Retake Exam"}
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        ) : hasPassed ? (
                          <Button variant="outline" onClick={() => router.push(`/certificates`)} className="gap-2">
                            <Award className="w-4 h-4" /> View Certificate
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-1.5"
                            onClick={() => router.push(`/courses/${course.slug}`)}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Re-enrol to retry
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Latest result */}
                    {latestAttempt && latestAttempt.status === "COMPLETED" && (
                      <div className={cn(
                        "mt-4 p-3 rounded-xl text-sm flex items-center gap-3",
                        latestAttempt.passed ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
                      )}>
                        {latestAttempt.passed
                          ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                          : <XCircle className="w-4 h-4 shrink-0" />}
                        <span>
                          Last attempt: <strong>{latestAttempt.score !== null ? `${Math.round(latestAttempt.score)}%` : "—"}</strong>
                          {" · "}{latestAttempt.passed ? "Passed" : "Did not pass"}
                          {latestAttempt.submittedAt && (
                            <> · {formatDistanceToNow(new Date(latestAttempt.submittedAt), { addSuffix: true })}</>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <div className="space-y-3">
          {attempts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <ClipboardList className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p className="font-medium text-slate-700">No exam history yet</p>
              <p className="text-sm text-slate-500 mt-1">Your completed and in-progress exam attempts will appear here.</p>
            </div>
          ) : (
            attempts.map((attempt) => {
              const paper = eligibleCourses.find((c) => c.examPaper?.id === attempt.examPaperId)?.examPaper;
              return (
                <div key={attempt.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                    attempt.status === "IN_PROGRESS" ? "bg-amber-100" :
                    attempt.passed ? "bg-emerald-100" : "bg-red-100"
                  )}>
                    {attempt.status === "IN_PROGRESS"
                      ? <Clock className="w-5 h-5 text-amber-600" />
                      : attempt.passed
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        : <XCircle className="w-5 h-5 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm truncate">
                      {paper?.title ?? "Exam"}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      Started {format(new Date(attempt.startedAt), "d MMM yyyy, HH:mm")}
                      {attempt.submittedAt && (
                        <> · Submitted {format(new Date(attempt.submittedAt), "d MMM yyyy, HH:mm")}</>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {attempt.status === "COMPLETED" && attempt.score !== null && (
                      <p className={cn(
                        "text-lg font-bold",
                        attempt.passed ? "text-emerald-600" : "text-red-500"
                      )}>
                        {Math.round(attempt.score)}%
                      </p>
                    )}
                    <Badge className={cn(
                      "text-xs border-0",
                      attempt.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" :
                      attempt.passed ? "bg-emerald-100 text-emerald-700" :
                      "bg-red-100 text-red-600"
                    )}>
                      {attempt.status === "IN_PROGRESS" ? "In Progress" :
                       attempt.passed ? "Passed" : "Failed"}
                    </Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
