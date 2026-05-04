"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ListChecks,
  SquarePen,
  Send,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type ManualQuestion = {
  questionId: string;
  type: "essay" | "fill_blank";
  text: string;
  marks: number;
  sectionTitle: string;
  responseData: string | null;
  marksAwarded: number | null;
};

type AutoQuestion = {
  questionId: string;
  type: string;
  text: string;
  marks: number;
  sectionTitle: string;
  marksAwarded: number | null;
  isCorrect: boolean | null;
};

type ExistingGrade = {
  rawScore: number;
  percentageScore: number;
  passed: boolean;
  feedbackNotes: string | null;
  gradedAt: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseAnswer(responseData: string | null): string {
  if (!responseData) return "(No answer submitted)";
  try {
    const parsed: unknown = JSON.parse(responseData);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.text === "string") return obj.text;
      if (typeof obj.answer === "string") return obj.answer;
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return responseData;
  }
}

const TYPE_LABELS: Record<string, string> = {
  essay: "Essay",
  fill_blank: "Fill in the blank",
  mcq_single: "MCQ (single)",
  mcq_multi: "MCQ (multi)",
  true_false: "True / False",
  drag_drop: "Drag & drop",
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function GradingForm({
  attemptId,
  examTitle,
  attemptNumber,
  submittedAt,
  totalMarks,
  passMark,
  alreadyGraded,
  gradeReleased: gradeReleasedProp,
  existingGrade,
  manualQuestions,
  autoQuestions,
}: {
  attemptId: string;
  examTitle: string;
  attemptNumber: number;
  submittedAt: string | null;
  totalMarks: number;
  passMark: number;
  alreadyGraded: boolean;
  gradeReleased: boolean;
  existingGrade: ExistingGrade | null;
  manualQuestions: ManualQuestion[];
  autoQuestions: AutoQuestion[];
}) {
  const router = useRouter();

  const [scores, setScores] = useState<Record<string, number | "">>(() => {
    const init: Record<string, number | ""> = {};
    for (const q of manualQuestions) {
      init[q.questionId] = q.marksAwarded ?? "";
    }
    return init;
  });

  const [feedbackNotes, setFeedbackNotes] = useState(
    existingGrade?.feedbackNotes ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [released, setReleased] = useState(gradeReleasedProp);
  const [activeTab, setActiveTab] = useState<"manual" | "auto">("manual");

  const isReadOnly = alreadyGraded || submitted;
  const gradedCount = manualQuestions.filter(
    (q) => scores[q.questionId] !== ""
  ).length;
  const allScored = gradedCount === manualQuestions.length;

  async function handleSubmit() {
    const manualScores: Record<string, number> = {};

    for (const q of manualQuestions) {
      const raw = scores[q.questionId];
      if (raw === "" || raw === undefined) {
        toast.error("Please enter a score for every question before submitting");
        return;
      }
      const n = Number(raw);
      if (isNaN(n) || n < 0 || n > q.marks) {
        toast.error(
          `Score for "${q.text.slice(0, 50)}${q.text.length > 50 ? "…" : ""}" must be 0–${q.marks}`
        );
        return;
      }
      manualScores[q.questionId] = n;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/manage/exams/grade/${attemptId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manualScores,
          feedbackNotes: feedbackNotes.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to submit grade");
        return;
      }
      setSubmitted(true);
      toast.success("Grade submitted successfully");
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRelease() {
    setReleasing(true);
    try {
      const res = await fetch(`/api/manage/exams/grade/${attemptId}`, {
        method: "PATCH",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to release grade");
        return;
      }
      setReleased(true);
      toast.success("Grade released — candidate will be notified by email");
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setReleasing(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <button
            type="button"
            onClick={() => router.push("/manage/exams")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Exams
          </button>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-violet-600" />
                <span className="text-xs font-semibold text-violet-700 uppercase tracking-wider">
                  Blind Grading Session
                </span>
              </div>
              <h1 className="text-xl font-semibold text-slate-900">
                {examTitle}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Attempt #{attemptNumber}
                {submittedAt && (
                  <>
                    {" "}
                    &middot; Submitted{" "}
                    {format(new Date(submittedAt), "d MMM yyyy, HH:mm")}
                  </>
                )}
                {" "}
                &middot; Pass mark {passMark}% &middot; {totalMarks} total marks
              </p>
            </div>

            <Badge
              variant="outline"
              className="text-violet-700 border-violet-300 bg-violet-50 shrink-0"
            >
              Candidate identity hidden
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {/* ── Status banners ────────────────────────────────────────────── */}
        {(alreadyGraded || submitted) && existingGrade && (
          <div
            className={cn(
              "rounded-xl border px-5 py-4 flex items-start gap-3",
              existingGrade.passed
                ? "bg-emerald-50 border-emerald-200"
                : "bg-red-50 border-red-200"
            )}
          >
            {existingGrade.passed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            )}
            <div className="text-sm">
              <p className="font-semibold text-slate-800">
                Graded &mdash;{" "}
                <span
                  className={
                    existingGrade.passed ? "text-emerald-700" : "text-red-600"
                  }
                >
                  {existingGrade.passed ? "Passed" : "Failed"}
                </span>
              </p>
              <p className="text-slate-600 mt-0.5">
                {existingGrade.rawScore.toFixed(0)} / {totalMarks} marks &middot;{" "}
                {existingGrade.percentageScore.toFixed(0)}% &middot; Graded{" "}
                {format(new Date(existingGrade.gradedAt), "d MMM yyyy, HH:mm")}
              </p>
            </div>
          </div>
        )}

        {submitted && !existingGrade && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold text-slate-800">
              Grade submitted successfully.
            </p>
          </div>
        )}

        {released && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 flex items-center gap-3">
            <Unlock className="w-5 h-5 text-blue-600 shrink-0" />
            <p className="text-sm font-semibold text-slate-800">
              Grade released &mdash; the candidate can now view their result.
            </p>
          </div>
        )}

        {/* ── Progress bar ──────────────────────────────────────────────── */}
        {manualQuestions.length > 0 && !isReadOnly && (
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-300"
                style={{
                  width: `${(gradedCount / manualQuestions.length) * 100}%`,
                }}
              />
            </div>
            <span className="text-sm text-slate-600 shrink-0 tabular-nums">
              {gradedCount} / {manualQuestions.length} scored
            </span>
          </div>
        )}

        {/* ── Tab switcher ──────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-slate-200">
          {(
            [
              {
                id: "manual" as const,
                label: "Manual Grading",
                icon: SquarePen,
                count: manualQuestions.length,
              },
              {
                id: "auto" as const,
                label: "Auto-scored",
                icon: ListChecks,
                count: autoQuestions.length,
              },
            ] as const
          ).map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === id
                  ? "border-violet-600 text-violet-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full",
                  activeTab === id
                    ? "bg-violet-100 text-violet-700"
                    : "bg-slate-100 text-slate-500"
                )}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Manual grading tab ────────────────────────────────────────── */}
        {activeTab === "manual" && (
          <div className="space-y-4">
            {manualQuestions.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
                <ListChecks className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm text-slate-500">
                  No essay or fill-in-the-blank questions in this paper.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  All questions were auto-scored.
                </p>
              </div>
            ) : (
              manualQuestions.map((q, idx) => (
                <div
                  key={q.questionId}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-500">
                        Q{idx + 1}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {q.sectionTitle}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-xs text-amber-700 border-amber-300 bg-amber-50"
                      >
                        {TYPE_LABELS[q.type] ?? q.type}
                      </Badge>
                    </div>
                    <span className="text-xs font-medium text-slate-500 shrink-0">
                      {q.marks} {q.marks === 1 ? "mark" : "marks"}
                    </span>
                  </div>

                  <div className="px-5 py-4 space-y-4">
                    {/* Question text */}
                    <p className="text-sm font-medium text-slate-800 leading-relaxed">
                      {q.text}
                    </p>

                    {/* Candidate answer */}
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                        Candidate&apos;s Answer
                      </p>
                      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap min-h-[60px]">
                        {parseAnswer(q.responseData)}
                      </div>
                    </div>

                    {/* Score input */}
                    <div className="flex items-center gap-3">
                      <Label className="text-sm text-slate-700 shrink-0">
                        Score awarded
                      </Label>
                      {isReadOnly ? (
                        <span className="text-sm font-semibold text-slate-900">
                          {(q.marksAwarded ?? 0).toFixed(0)} / {q.marks}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={q.marks}
                            step={0.5}
                            value={scores[q.questionId]}
                            onChange={(e) => {
                              const val = e.target.value;
                              setScores((prev) => ({
                                ...prev,
                                [q.questionId]:
                                  val === "" ? "" : Number(val),
                              }));
                            }}
                            className="w-20 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            placeholder="0"
                          />
                          <span className="text-sm text-slate-500">
                            / {q.marks}{" "}
                            {q.marks === 1 ? "mark" : "marks"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Examiner notes */}
            {manualQuestions.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 space-y-2">
                <Label
                  htmlFor="feedbackNotes"
                  className="text-sm font-medium text-slate-700"
                >
                  Examiner Notes{" "}
                  <span className="font-normal text-slate-400">
                    (optional · internal record, not visible to candidate until
                    grade is released)
                  </span>
                </Label>
                <Textarea
                  id="feedbackNotes"
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  disabled={isReadOnly}
                  rows={3}
                  maxLength={5000}
                  placeholder="Notes for the certification officer's record…"
                  className="resize-none text-sm"
                />
                {!isReadOnly && (
                  <p className="text-xs text-slate-400 text-right">
                    {feedbackNotes.length} / 5000
                  </p>
                )}
              </div>
            )}

            {/* Submit */}
            {!isReadOnly && manualQuestions.length > 0 && (
              <div className="flex items-center gap-3 pt-1">
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !allScored}
                  className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? "Submitting…" : "Submit Grades"}
                </Button>
                <p className="text-xs text-slate-400">
                  {!allScored
                    ? `${manualQuestions.length - gradedCount} question${manualQuestions.length - gradedCount === 1 ? "" : "s"} still need a score`
                    : "All questions scored — ready to submit"}
                </p>
              </div>
            )}

            {/* Release grade */}
            {isReadOnly && !released && (
              <div className="flex items-center gap-3 pt-1">
                <Button
                  onClick={handleRelease}
                  disabled={releasing}
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-2"
                >
                  <Unlock className="w-4 h-4" />
                  {releasing ? "Releasing…" : "Release Grade to Candidate"}
                </Button>
                <p className="text-xs text-slate-400">
                  Candidate will be notified by email.
                </p>
              </div>
            )}

            {released && (
              <div className="pt-1">
                <Button
                  variant="outline"
                  onClick={() => router.push("/manage/exams")}
                >
                  Back to Exam Management
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Auto-scored tab ───────────────────────────────────────────── */}
        {activeTab === "auto" && (
          <div className="space-y-3">
            {autoQuestions.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
                <p className="text-sm text-slate-500">
                  No auto-scored questions in this paper.
                </p>
              </div>
            ) : (
              autoQuestions.map((q, idx) => (
                <div
                  key={q.questionId}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex items-start gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-slate-400">
                        Q{idx + 1}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {q.sectionTitle}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {TYPE_LABELS[q.type] ?? q.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {q.text}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {q.isCorrect === null ? (
                      <Clock className="w-4 h-4 text-slate-400" />
                    ) : q.isCorrect ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-sm font-medium text-slate-700 tabular-nums">
                      {(q.marksAwarded ?? 0).toFixed(0)} / {q.marks}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
