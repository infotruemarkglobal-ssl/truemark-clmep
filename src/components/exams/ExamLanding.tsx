"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Shield, Clock, ClipboardList, Award, AlertTriangle,
  CheckCircle2, ChevronRight, Eye, Maximize2, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { Camera } from "lucide-react";

type ExamPaperInfo = {
  id: string;
  title: string;
  timeLimitMins: number;
  passMark: number;
  maxAttempts: number;
  scheme: { name: string; code: string } | null;
  totalQuestions: number;
  requiresProctoring: boolean;
};

const PROCTORED_RULES = [
  { icon: Camera, text: "Camera access is required. Your video feed will be monitored throughout the exam." },
  { icon: Maximize2, text: "The exam runs in fullscreen mode. Exiting fullscreen will be logged as a proctoring incident." },
  { icon: Eye, text: "Tab switching is monitored. Exceeding the allowed violations will automatically terminate your exam." },
  { icon: Clock, text: "The timer starts immediately when you begin. You cannot pause the exam once started." },
  { icon: ClipboardList, text: "You can flag questions for review and navigate freely between questions." },
  { icon: AlertTriangle, text: "Do not refresh the page. Your progress is saved automatically." },
  { icon: Lock, text: "Copy-paste is disabled during the exam. All answers must be typed or selected directly." },
];

const UNPROCTORED_RULES = [
  { icon: Clock, text: "The timer starts immediately when you begin. You cannot pause the exam once started." },
  { icon: ClipboardList, text: "You can flag questions for review and navigate freely between questions." },
  { icon: AlertTriangle, text: "Do not refresh the page. Your progress is saved automatically." },
];

export default function ExamLanding({
  examPaper,
  previousAttempts,
  isEligible,
}: {
  examPaper: ExamPaperInfo;
  previousAttempts: number;
  isEligible: boolean;
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);

  const attemptsLeft = examPaper.maxAttempts - previousAttempts;
  const canAttempt = isEligible && attemptsLeft > 0;
  const rules = examPaper.requiresProctoring ? PROCTORED_RULES : UNPROCTORED_RULES;

  async function startExam() {
    if (!agreed || !canAttempt || starting) return;
    setStarting(true);
    try {
      const res = await fetch(`/api/exams/${examPaper.id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start exam");
      // Refresh the page — the server component will detect the in-progress attempt and render ExamInterface
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start exam");
      setStarting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {examPaper.scheme && (
              <Badge className="mb-2 bg-primary/10 text-primary border-0">{examPaper.scheme.code}</Badge>
            )}
            <h1 className="text-xl font-bold text-slate-900">{examPaper.title}</h1>
            {examPaper.scheme && (
              <p className="text-slate-500 text-sm mt-0.5">Leads to {examPaper.scheme.name}</p>
            )}
          </div>
        </div>

        {/* Exam details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          {[
            { label: "Duration", value: `${examPaper.timeLimitMins} mins`, icon: Clock },
            { label: "Questions", value: examPaper.totalQuestions, icon: ClipboardList },
            { label: "Pass Mark", value: `${examPaper.passMark}%`, icon: Award },
            { label: "Attempts Left", value: attemptsLeft, icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="text-center p-3 bg-slate-50 rounded-xl">
              <Icon className="w-5 h-5 mx-auto mb-1 text-slate-400" aria-hidden="true" />
              <p className="text-lg font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {previousAttempts > 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            You have made {previousAttempts} previous attempt{previousAttempts !== 1 ? "s" : ""} on this exam.
            {attemptsLeft > 0
              ? ` You have ${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} remaining.`
              : " You have no attempts remaining."}
          </div>
        )}

        {!isEligible && attemptsLeft > 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            You have not met the minimum course progress requirement to sit this exam. Complete the required course content first.
          </div>
        )}

        {attemptsLeft <= 0 && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              All exam attempts have been used
            </div>
            <p className="text-xs">
              You have used all {examPaper.maxAttempts} allowed attempts for this exam. To try again,
              you must re-enrol in the associated course and make a new payment to restart the process from the beginning.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-100"
              onClick={() => router.push("/courses")}
            >
              Go to Course Catalogue to Re-enrol
            </Button>
          </div>
        )}
      </div>

      {/* Exam rules */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          {examPaper.requiresProctoring
            ? <><Eye className="w-5 h-5 text-primary" aria-hidden="true" /> Proctoring &amp; Exam Rules</>
            : <><ClipboardList className="w-5 h-5 text-primary" aria-hidden="true" /> Exam Rules</>
          }
        </h2>

        {examPaper.requiresProctoring && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              This is a <strong>proctored exam</strong>. Your camera, tab activity, and screen will be monitored throughout.
              Grant camera access when prompted.
            </span>
          </div>
        )}

        <ul className="space-y-3">
          {rules.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm text-slate-600">
              <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        {examPaper.requiresProctoring && (
          <div className="mt-6 p-4 bg-slate-50 rounded-xl">
            <p className="text-xs text-slate-500 leading-relaxed">
              This examination is conducted under the supervision of an online proctoring system in accordance
              with ISO/IEC 17024:2012 Clause 9.2 (Examination Process). Any detected irregularities will be
              reviewed by a Certification Officer. Candidates found to have cheated will be permanently barred
              from future examinations.
            </p>
          </div>
        )}
      </div>

      {/* Consent & Start */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {/* Native checkbox (sr-only) ensures keyboard operability (Tab + Space) and
            correct screen reader semantics. The visual indicator below is aria-hidden. */}
        <label className="flex items-start gap-3 cursor-pointer group" htmlFor="exam-consent">
          <span className="relative shrink-0 mt-0.5">
            <input
              type="checkbox"
              id="exam-consent"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="sr-only"
            />
            {/* Visual checkbox — aria-hidden so screen readers use the native input */}
            <span
              aria-hidden="true"
              className={cn(
                "block w-5 h-5 rounded border-2 flex items-center justify-center transition",
                agreed ? "bg-primary border-primary" : "border-slate-300 group-hover:border-primary"
              )}
            >
              {agreed && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
            </span>
          </span>
          <span className="text-sm text-slate-700">
            I confirm that I have read and understood the exam rules. I agree to complete this examination
            honestly and without assistance.
            {examPaper.requiresProctoring && (
              <> I consent to camera monitoring and understand that any violations will be logged and reviewed.</>
            )}
          </span>
        </label>

        <div className="mt-6 flex items-center justify-between gap-4" role="group" aria-label="Exam actions">
          <Button variant="outline" onClick={() => router.back()} title="Return to the previous page">
            Go Back
          </Button>
          <div className="text-right">
            <Button
              onClick={startExam}
              disabled={!agreed || !canAttempt || starting}
              className="gap-2 min-w-36"
              title={!agreed ? "You must agree to the exam rules before starting" : !canAttempt ? "You are not eligible to attempt this exam" : "Start the exam now — the timer will begin immediately"}
            >
              {starting ? "Starting…" : (
                <>
                  Begin Exam <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
            {canAttempt && !agreed && (
              <p className="text-xs text-slate-400 mt-1">Tick the box above to enable</p>
            )}
            {canAttempt && agreed && (
              <p className="text-xs text-amber-600 mt-1 font-medium">Timer starts immediately on click</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
