"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Shield, Clock, ClipboardList, Award, AlertTriangle,
  CheckCircle2, ChevronRight, Eye, Maximize2, Lock,
  Camera, VideoOff, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ExamPaperInfo = {
  id: string;
  title: string;
  timeLimitMins: number;
  passMark: number;
  maxAttempts: number;
  scheme: { name: string; code: string } | null;
  totalQuestions: number;
  requiresProctoring: boolean;
  tabSwitchLimit: number;
};

type CourseInfo = {
  id: string;
  title: string;
  price: number;
  currency: string;
};

type CameraStatus = "pending" | "active" | "denied";

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

const QUESTION_TYPE_LABELS: Record<string, string> = {
  MCQ: "Multiple Choice",
  true_false: "True / False",
  fill_blank: "Fill in the Blank",
  essay: "Essay",
  drag_drop: "Drag & Drop",
};

export default function ExamLanding({
  examPaper,
  previousAttempts,
  isEligible,
  course,
  questionTypes,
}: {
  examPaper: ExamPaperInfo;
  previousAttempts: number;
  isEligible: boolean;
  course: CourseInfo | null;
  questionTypes: string[];
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reEnrolling, setReEnrolling] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("pending");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const attemptsLeft = examPaper.maxAttempts - previousAttempts;
  const canAttempt = isEligible && attemptsLeft > 0;
  const rules = examPaper.requiresProctoring ? PROCTORED_RULES : UNPROCTORED_RULES;

  // Start camera preview for proctored exams (briefing only — no ProctoringSession yet).
  useEffect(() => {
    if (!examPaper.requiresProctoring || !canAttempt) return;

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraStatus("active");
      })
      .catch(() => {
        if (!cancelled) setCameraStatus("denied");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examPaper.requiresProctoring, canAttempt]);

  // Stop the preview stream right before exam starts (ExamInterface opens its own stream).
  function stopCameraPreview() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startExam() {
    if (!agreed || !canAttempt || starting) return;
    if (examPaper.requiresProctoring && cameraStatus !== "active") return;
    setStarting(true);
    stopCameraPreview();
    try {
      const res = await fetch(`/api/exams/${examPaper.id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start exam");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start exam");
      setStarting(false);
    }
  }

  async function handleFreeReEnrol() {
    if (!course || reEnrolling) return;
    setReEnrolling(true);
    try {
      const res = await fetch("/api/enrolments/re-enrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Re-enrolment failed");
      toast.success("Re-enrolled successfully. Your progress has been reset.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-enrolment failed");
    } finally {
      setReEnrolling(false);
    }
  }

  const startDisabled =
    !agreed ||
    !canAttempt ||
    starting ||
    (examPaper.requiresProctoring && cameraStatus !== "active");

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

        {/* Exam details grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          {[
            { label: "Duration", value: `${examPaper.timeLimitMins} mins`, icon: Clock },
            { label: "Questions", value: examPaper.totalQuestions, icon: ClipboardList },
            { label: "Pass Mark", value: `${examPaper.passMark}%`, icon: Award },
            { label: "Attempts Left", value: Math.max(0, attemptsLeft), icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="text-center p-3 bg-slate-50 rounded-xl">
              <Icon className="w-5 h-5 mx-auto mb-1 text-slate-400" aria-hidden="true" />
              <p className="text-lg font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Additional briefing info */}
        {(questionTypes.length > 0 || examPaper.requiresProctoring) && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {questionTypes.length > 0 && (
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs font-semibold text-slate-500 mb-1">Question Types</p>
                <p className="text-sm text-slate-700">
                  {questionTypes.map((t) => QUESTION_TYPE_LABELS[t] ?? t).join(", ")}
                </p>
              </div>
            )}
            {examPaper.requiresProctoring && (
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs font-semibold text-slate-500 mb-1">Tab Switch Limit</p>
                <p className="text-sm text-slate-700">{examPaper.tabSwitchLimit} violation{examPaper.tabSwitchLimit !== 1 ? "s" : ""} before auto-termination</p>
              </div>
            )}
          </div>
        )}

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

        {/* Re-enrolment UI — replaces the dead-end message */}
        {attemptsLeft <= 0 && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              All exam attempts have been used
            </div>
            <p className="text-xs">
              You have used all {examPaper.maxAttempts} allowed attempts for this exam.
              {course
                ? course.price > 0
                  ? " To try again, you must purchase the course again."
                  : " To try again, you must re-enrol in the course. Your progress will be reset."
                : " To try again, you must re-enrol in the associated course."}
            </p>
            {course ? (
              course.price > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-100"
                  onClick={() => router.push(`/courses/${course.id}`)}
                >
                  Re-enrol in {course.title}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-100 gap-1.5"
                  disabled={reEnrolling}
                  onClick={handleFreeReEnrol}
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", reEnrolling && "animate-spin")} />
                  {reEnrolling ? "Re-enrolling…" : `Re-enrol in ${course.title}`}
                </Button>
              )
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => router.push("/courses")}
              >
                Browse Courses
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Camera preview for proctored exams */}
      {examPaper.requiresProctoring && canAttempt && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" aria-hidden="true" />
            Camera Check
          </h2>

          {cameraStatus === "pending" && (
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl text-sm text-slate-600">
              <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
              Requesting camera access…
            </div>
          )}

          {cameraStatus === "denied" && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
                <VideoOff className="w-4 h-4 shrink-0" />
                Camera access was denied
              </div>
              <p className="text-xs text-red-700">
                This is a proctored exam and requires camera access. Enable camera access for this
                site in your browser settings, then refresh the page.
              </p>
            </div>
          )}

          {cameraStatus === "active" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Camera active — you are visible
              </div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full max-w-xs rounded-xl border border-slate-200 bg-slate-900"
                aria-label="Camera preview"
              />
              <p className="text-xs text-slate-500">
                Make sure your face is clearly visible and well-lit before starting.
                The exam proctoring system will use this camera feed.
              </p>
            </div>
          )}
        </div>
      )}

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
        <label className="flex items-start gap-3 cursor-pointer group" htmlFor="exam-consent">
          <span className="relative shrink-0 mt-0.5">
            <input
              type="checkbox"
              id="exam-consent"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="sr-only"
            />
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

        {examPaper.requiresProctoring && cameraStatus === "denied" && canAttempt && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
            <VideoOff className="w-3.5 h-3.5 shrink-0" />
            Camera access is required to start this proctored exam.
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-4" role="group" aria-label="Exam actions">
          <Button variant="outline" onClick={() => router.back()} title="Return to the previous page">
            Go Back
          </Button>
          <div className="text-right">
            <Button
              onClick={startExam}
              disabled={startDisabled}
              className="gap-2 min-w-36"
              title={
                !agreed
                  ? "You must agree to the exam rules before starting"
                  : examPaper.requiresProctoring && cameraStatus !== "active"
                  ? "Camera access is required to start this proctored exam"
                  : !canAttempt
                  ? "You are not eligible to attempt this exam"
                  : "Start the exam now — the timer will begin immediately"
              }
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
            {canAttempt && agreed && examPaper.requiresProctoring && cameraStatus === "pending" && (
              <p className="text-xs text-slate-400 mt-1">Waiting for camera…</p>
            )}
            {canAttempt && agreed && (!examPaper.requiresProctoring || cameraStatus === "active") && (
              <p className="text-xs text-amber-600 mt-1 font-medium">Timer starts immediately on click</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
