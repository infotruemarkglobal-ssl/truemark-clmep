"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";
import {
  Clock, Flag, ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle2, Send, Shield, Eye, Maximize2, X,
  Camera, CameraOff, VideoOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Option = { id: string; text: string };
type Question = {
  id: string;
  questionText: string;
  questionType: "MCQ" | "mcq_single" | "mcq_multi" | "true_false" | "fill_blank" | "essay" | "drag_drop";
  options: Option[];
  marks: number;
  order: number;
};

type ExamState = {
  attemptId: string;
  examPaperId: string;
  proctoringSessionId: string;
  questions: Question[];
  timeLimitMins: number;
  startedAt: string;
  requiresProctoring: boolean;
  tabSwitchLimit: number;
};

type Answer = {
  questionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
};

function isChoiceQuestion(type: Question["questionType"]) {
  return ["MCQ", "mcq_single", "mcq_multi", "true_false"].includes(type);
}

function isMultiSelect(type: Question["questionType"]) {
  return type === "mcq_multi";
}

export default function ExamInterface({
  examState,
  examTitle,
  passMark,
}: {
  examState: ExamState;
  examTitle: string;
  passMark: number;
}) {
  const router = useRouter();
  const {
    attemptId, examPaperId, questions, timeLimitMins, startedAt,
    requiresProctoring, tabSwitchLimit,
  } = examState;

  const totalSeconds = timeLimitMins * 60;
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, totalSeconds - elapsed));

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Announces timer thresholds to screen readers without polluting every second
  const [timerAnnouncement, setTimerAnnouncement] = useState("");
  const announcedThresholdsRef = useRef(new Set<number>());
  const containerRef = useRef<HTMLDivElement>(null);
  // Modal refs — focused on open so keyboard users land inside the dialog
  const violationModalBtnRef = useRef<HTMLButtonElement>(null);
  const confirmModalBtnRef = useRef<HTMLButtonElement>(null);

  // ── Violation tracking ───────────────────────────────────────────────────
  const [tabViolations, setTabViolations] = useState(0);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [lastViolationType, setLastViolationType] = useState<string>("Tab switch");
  const tabViolationsRef = useRef(0);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);

  // ── Camera proctoring ─────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Forward ref so recordViolation can call handleSubmit before it's defined
  const handleSubmitRef = useRef<(auto: boolean) => void>(() => {});
  const [cameraStatus, setCameraStatus] = useState<"pending" | "active" | "denied" | "none">(
    requiresProctoring ? "pending" : "none"
  );
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceStatus, setFaceStatus] = useState<"loading" | "ok" | "absent" | "multiple" | "looking_away" | "talking" | "blocked">("loading");
  // Streak counters (refs to avoid stale closure issues)
  const noFaceStreakRef = useRef(0);
  const lookAwayStreakRef = useRef(0);
  const mouthOpenStreakRef = useRef(0);

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const flaggedCount = flagged.size;

  // ── Countdown timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (secondsLeft <= 0) { handleSubmit(true); return; }
    // Thresholds at which the timer value is announced to screen readers (seconds)
    const ANNOUNCE_AT = [1800, 900, 300, 60]; // 30 min, 15 min, 5 min, 1 min
    const id = setInterval(() => {
      if (isPausedRef.current) return;
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(id); handleSubmit(true); return 0; }
        const next = s - 1;
        for (const threshold of ANNOUNCE_AT) {
          if (next === threshold && !announcedThresholdsRef.current.has(threshold)) {
            announcedThresholdsRef.current.add(threshold);
            const label = threshold === 1800 ? "30 minutes" : threshold === 900 ? "15 minutes" : threshold === 300 ? "5 minutes" : "1 minute";
            setTimerAnnouncement(`${label} remaining`);
          }
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Consolidated violation recorder ──────────────────────────────────────
  const recordViolation = useCallback((
    type: string,
    label: string,
    details: string,
    opts?: { noPause?: boolean },
  ) => {
    const newCount = tabViolationsRef.current + 1;
    tabViolationsRef.current = newCount;
    setTabViolations(newCount);
    setLastViolationType(label);

    // Retry up to 2 times with exponential back-off so a momentary network
    // hiccup doesn't silently drop a proctoring incident record.
    const body = JSON.stringify({
      proctoringSessionId: examState.proctoringSessionId,
      type,
      details: `${details} (#${newCount})`,
    });
    async function sendWithRetry(attempt: number): Promise<void> {
      try {
        const res = await fetch("/api/exams/proctoring/incident", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (data.terminated === true) {
          toast.error("Exam terminated by proctoring system — too many violations.", { duration: 8000 });
          handleSubmitRef.current(true);
        }
      } catch {
        if (attempt < 2) {
          setTimeout(() => sendWithRetry(attempt + 1), 1000 * 2 ** attempt);
        }
      }
    }
    sendWithRetry(0);

    if (newCount >= tabSwitchLimit) {
      toast.error(`Exam terminated: ${newCount} proctoring violations exceeded the limit of ${tabSwitchLimit}.`, { duration: 8000 });
      handleSubmitRef.current(true);
    } else if (!opts?.noPause) {
      isPausedRef.current = true;
      setIsPaused(true);
      setShowViolationWarning(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examState.proctoringSessionId, tabSwitchLimit]);

  // ── Tab-switch detection (document hidden = user switched browser tabs) ──
  useEffect(() => {
    if (!requiresProctoring) return;
    function onVisibilityChange() {
      if (!document.hidden) return;
      recordViolation("tab_switch", "Tab switch", "Candidate switched browser tab or minimised window");
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [requiresProctoring, recordViolation]);

  // ── Window / app-switch detection (blur = focus moved to another app) ────
  useEffect(() => {
    if (!requiresProctoring) return;
    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    function onWindowBlur() {
      // 1.5 s grace period — rules out accidental clicks on OS chrome / alerts
      blurTimer = setTimeout(() => {
        // Only fire if document is still visible (i.e. user switched to another app,
        // not just switched browser tab — tab switch is already caught above)
        if (!document.hidden) {
          recordViolation("window_switch", "Application switch", "Candidate switched to another application while exam window remained open");
        }
      }, 1500);
    }

    function onWindowFocus() {
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    }

    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      if (blurTimer) clearTimeout(blurTimer);
    };
  }, [requiresProctoring, recordViolation]);

  // ── Back-button / navigation lock ────────────────────────────────────────
  useEffect(() => {
    if (!requiresProctoring) return;
    // Push a dummy history entry so back-button hits this state first
    window.history.pushState({ examLock: true }, "", window.location.href);

    function onPopState() {
      // Re-push to keep blocking
      window.history.pushState({ examLock: true }, "", window.location.href);
      recordViolation("navigation_attempt", "Navigation attempt", "Candidate attempted to use browser back/forward during exam");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [requiresProctoring, recordViolation]);

  // ── Page-unload beacon (catches hard navigation away) ────────────────────
  useEffect(() => {
    if (!requiresProctoring) return;
    function onBeforeUnload() {
      if (submittingRef.current) return; // normal submit — don't flag
      const blob = new Blob(
        [JSON.stringify({ proctoringSessionId: examState.proctoringSessionId, type: "navigation_exit", details: "Candidate navigated away from exam page" })],
        { type: "application/json" }
      );
      navigator.sendBeacon("/api/exams/proctoring/incident", blob);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiresProctoring, examState.proctoringSessionId]);

  // ── Proctoring heartbeat (every 30 s) ────────────────────────────────────
  // Keeps the proctoring session's updatedAt fresh so orphan-cleanup jobs can
  // distinguish a live exam from a crashed browser tab.
  useEffect(() => {
    if (!requiresProctoring) return;
    const id = setInterval(() => {
      fetch("/api/exams/proctoring/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proctoringSessionId: examState.proctoringSessionId }),
      }).then(async (res) => {
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (data.terminated === true) {
          toast.error("Your exam session was terminated by the server.", { duration: 8000 });
          handleSubmitRef.current(true);
        }
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiresProctoring, examState.proctoringSessionId]);

  // ── Fullscreen management ────────────────────────────────────────────────
  useEffect(() => {
    function onFullscreenChange() {
      const inFs = !!document.fullscreenElement;
      setIsFullscreen(inFs);
      if (!inFs && !submitting && requiresProctoring) {
        toast.warning("Exited fullscreen — please return to fullscreen mode.", { duration: 5000 });
        fetch("/api/exams/proctoring/incident", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proctoringSessionId: examState.proctoringSessionId,
            type: "fullscreen_exit",
            details: "Candidate exited fullscreen during exam",
          }),
        }).catch(() => {});
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [examState.proctoringSessionId, submitting, requiresProctoring]);

  const enterFullscreen = useCallback(() => {
    containerRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  // ── Camera proctoring ────────────────────────────────────────────────────
  useEffect(() => {
    if (!requiresProctoring) return;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // ideal constraint: prefers front camera but won't hard-reject on
          // tablets and devices where "user" isn't the only available mode.
          video: { width: 320, height: 240, facingMode: { ideal: "user" } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraStatus("active");
      } catch {
        setCameraStatus("denied");
        recordViolation("camera_denied", "Camera access denied", "Candidate denied camera access", { noPause: true });
      }
    }

    startCamera();

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [requiresProctoring, examState.proctoringSessionId, recordViolation]);

  // ── Load face-api.js models once camera is active ────────────────────────
  useEffect(() => {
    if (!requiresProctoring || cameraStatus !== "active") return;
    let cancelled = false;
    (async () => {
      try {
        const faceapi = await import("face-api.js");
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models"),
        ]);
        if (!cancelled) setModelsLoaded(true);
      } catch (err) {
        // Model load failure falls back to pixel-only checks — log so ops can
        // investigate missing model files without blocking the candidate.
        Sentry.captureException(err, { tags: { context: "face-api-model-load" } });
      }
    })();
    return () => { cancelled = true; };
  }, [requiresProctoring, cameraStatus]);

  // ── Intelligent face analysis (every 3s once models are loaded) ──────────
  useEffect(() => {
    if (!requiresProctoring || !modelsLoaded || cameraStatus !== "active") return;

    let running = true;
    let blockedStreak = 0;

    async function analyse() {
      if (!running) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        if (running) setTimeout(analyse, 3000);
        return;
      }

      // ── 1. Quick camera-obstruction check (no ML needed) ──────────────
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = 80; canvas.height = 60;
        ctx.drawImage(video, 0, 0, 80, 60);
        const px = ctx.getImageData(0, 0, 80, 60).data;
        const n = px.length / 4;
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
        const brightness = sum / n;
        let varSum = 0;
        for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; varSum += (l - brightness) ** 2; }
        const stdDev = Math.sqrt(varSum / n);

        if (brightness < 40 || stdDev < 10) {
          blockedStreak++;
          if (blockedStreak >= 2) {
            setCameraBlocked(true);
            setFaceStatus("blocked");
            recordViolation("camera_blocked", "Camera blocked",
              `Camera covered (brightness: ${Math.round(brightness)}, stdDev: ${Math.round(stdDev)})`);
          }
          if (running) setTimeout(analyse, 3000);
          return;
        } else {
          blockedStreak = 0;
          setCameraBlocked(false);
        }
      }

      // ── 2. Face detection ─────────────────────────────────────────────
      try {
        const faceapi = await import("face-api.js");
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4, inputSize: 224 }))
          .withFaceLandmarks(true);

        // ── 2a. No face in frame ─────────────────────────────────────
        if (detections.length === 0) {
          noFaceStreakRef.current++;
          setFaceStatus("absent");
          if (noFaceStreakRef.current === 3) { // 9 s consecutive
            recordViolation("face_not_visible", "Candidate not visible",
              "No face detected in camera frame for 9+ seconds");
          }
        } else {
          noFaceStreakRef.current = 0;
        }

        // ── 2b. Multiple faces ────────────────────────────────────────
        if (detections.length > 1) {
          setFaceStatus("multiple");
          recordViolation("multiple_faces", "Multiple people detected",
            `${detections.length} faces visible — possible impersonation or unauthorised assistance`);
        }

        // ── 2c. Per-face analysis ─────────────────────────────────────
        if (detections.length === 1) {
          const d = detections[0];
          const lm = d.landmarks;
          const box = d.detection.box;

          // Head turn: compare nose-tip x to midpoint of both eye centres
          const leftEye = lm.getLeftEye();
          const rightEye = lm.getRightEye();
          const eyeMidX = (
            leftEye.reduce((s, p) => s + p.x, 0) / leftEye.length +
            rightEye.reduce((s, p) => s + p.x, 0) / rightEye.length
          ) / 2;
          const nose = lm.getNose();
          const noseTipX = nose[nose.length - 1].x;
          const turnRatio = Math.abs(noseTipX - eyeMidX) / Math.max(1, box.width);

          if (turnRatio > 0.18) {
            lookAwayStreakRef.current++;
            setFaceStatus("looking_away");
            if (lookAwayStreakRef.current === 4) { // 12 s consecutive
              fetch("/api/exams/proctoring/incident", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ proctoringSessionId: examState.proctoringSessionId,
                  type: "looking_away", details: `Candidate looking away from screen (turn: ${turnRatio.toFixed(2)})` }),
              }).catch(() => {});
              toast.warning("You appear to be looking away from the screen.", { duration: 4000 });
            }
          } else {
            lookAwayStreakRef.current = 0;

            // Mouth aspect ratio — talking / verbal communication
            const mouth = lm.getMouth(); // 20 points
            // mouth[3]=upper-lip-centre, mouth[9]=lower-lip-centre, mouth[0]=left, mouth[6]=right
            const mh = mouth[9].y - mouth[3].y;
            const mw = Math.max(1, mouth[6].x - mouth[0].x);
            const mar = mh / mw;

            if (mar > 0.28) {
              mouthOpenStreakRef.current++;
              setFaceStatus("talking");
              if (mouthOpenStreakRef.current === 3) { // 9 s of sustained mouth movement
                fetch("/api/exams/proctoring/incident", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ proctoringSessionId: examState.proctoringSessionId,
                    type: "talking_detected", details: `Sustained mouth movement detected (MAR: ${mar.toFixed(2)})` }),
                }).catch(() => {});
                toast.warning("Talking detected — this session is recorded.", { duration: 5000 });
                mouthOpenStreakRef.current = 0; // reset so it fires again after another 9 s
              }
            } else {
              mouthOpenStreakRef.current = 0;
              setFaceStatus("ok");
            }
          }
        }
      } catch {
        // silently ignore detection frame errors
      }

      if (running) setTimeout(analyse, 3000);
    }

    analyse();
    return () => { running = false; };
  }, [requiresProctoring, modelsLoaded, cameraStatus, examState.proctoringSessionId, recordViolation]);

  // ── Timer formatting ─────────────────────────────────────────────────────
  const timerDisplay = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const timerWarning = secondsLeft < 300; // < 5 mins

  // ── Answer management ────────────────────────────────────────────────────
  function setAnswer(qId: string, update: Partial<Omit<Answer, "questionId">>) {
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], questionId: qId, ...update } }));
  }

  function toggleMultiOption(qId: string, optionId: string) {
    setAnswers((prev) => {
      const existing = prev[qId]?.selectedOptionIds ?? [];
      const updated = existing.includes(optionId)
        ? existing.filter((id) => id !== optionId)
        : [...existing, optionId];
      return { ...prev, [qId]: { ...prev[qId], questionId: qId, selectedOptionIds: updated } };
    });
  }

  function toggleFlag(questionId: string) {
    setFlagged((prev) => {
      const next = new Set(prev);
      next.has(questionId) ? next.delete(questionId) : next.add(questionId);
      return next;
    });
  }

  function isAnswered(qId: string): boolean {
    const a = answers[qId];
    if (!a) return false;
    return !!(a.selectedOptionId || (a.selectedOptionIds && a.selectedOptionIds.length > 0) || a.textAnswer);
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (autoSubmit = false) => {
    if (submitting) return;
    setSubmitting(true);
    submittingRef.current = true;
    setShowConfirm(false);

    // Stop camera
    streamRef.current?.getTracks().forEach((t) => t.stop());

    try {
      const formattedAnswers: Record<string, string> = {};
      for (const q of questions) {
        const a = answers[q.id];
        if (a?.selectedOptionId) formattedAnswers[q.id] = a.selectedOptionId;
        else if (a?.selectedOptionIds?.length) formattedAnswers[q.id] = a.selectedOptionIds.join(",");
        else if (a?.textAnswer) formattedAnswers[q.id] = a.textAnswer;
      }
      const res = await fetch(`/api/exams/${examPaperId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, answers: formattedAnswers, autoSubmit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      router.push(`/exams/result/${attemptId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit exam");
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [submitting, questions, answers, attemptId, router, examPaperId]);

  // Keep submit ref in sync so recordViolation (defined earlier) can call it
  useEffect(() => { handleSubmitRef.current = handleSubmit; }, [handleSubmit]);

  // Move focus into modals when they open so keyboard users land inside the dialog
  useEffect(() => {
    if (showViolationWarning) violationModalBtnRef.current?.focus();
  }, [showViolationWarning]);

  useEffect(() => {
    if (showConfirm) confirmModalBtnRef.current?.focus();
  }, [showConfirm]);

  const unansweredCount = questions.filter((q) => !isAnswered(q.id)).length;
  const answeredCountActual = questions.length - unansweredCount;

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-950 flex flex-col">
      {/* Hidden canvas for frame analysis */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Screen-reader-only live region for timer threshold announcements.
          Announced only at 30/15/5/1-minute marks, not every second, to avoid
          overwhelming users with constant updates (WCAG 4.1.3). */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {timerAnnouncement}
      </div>

      {/* ── Top bar ── */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2 text-white">
          <Shield className="w-5 h-5 text-primary shrink-0" />
          <span className="font-semibold text-sm truncate max-w-xs">{examTitle}</span>
        </div>

        <div className="flex-1" />

        {/* Proctoring indicator */}
        {requiresProctoring && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-900/40 border border-emerald-700/50 rounded-full px-3 py-1">
            <Eye className="w-3 h-3" />
            Proctored session
          </div>
        )}

        {/* Tab violation counter */}
        {requiresProctoring && tabViolations > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-900/40 border border-red-700/50 rounded-full px-3 py-1">
            <AlertTriangle className="w-3 h-3" />
            {tabViolations}/{tabSwitchLimit} violations
          </div>
        )}

        {/* Camera status */}
        {requiresProctoring && (
          <div className={cn(
            "hidden sm:flex items-center gap-1 text-xs rounded-full px-2.5 py-1",
            cameraStatus === "denied" ? "text-red-400 bg-red-900/30" :
            faceStatus === "ok" ? "text-emerald-400 bg-emerald-900/30" :
            (faceStatus === "absent" || faceStatus === "multiple" || faceStatus === "blocked") ? "text-red-400 bg-red-900/30" :
            (faceStatus === "looking_away" || faceStatus === "talking") ? "text-amber-400 bg-amber-900/30" :
            "text-slate-400 bg-slate-900/30"
          )}>
            {cameraStatus === "denied" ? <><CameraOff className="w-3 h-3" /> No camera</> :
             faceStatus === "absent" ? <><VideoOff className="w-3 h-3" /> No face</> :
             faceStatus === "multiple" ? <><Camera className="w-3 h-3" /> Multi-face!</> :
             faceStatus === "blocked" ? <><VideoOff className="w-3 h-3" /> Blocked</> :
             faceStatus === "looking_away" ? <><Camera className="w-3 h-3" /> Looking away</> :
             faceStatus === "talking" ? <><Camera className="w-3 h-3" /> Talking</> :
             faceStatus === "ok" ? <><Camera className="w-3 h-3" /> 1 face</> :
             <><Camera className="w-3 h-3" /> Starting…</>}
          </div>
        )}

        {/* Timer — role="timer" + aria-label provides semantic meaning; the
            live region above announces threshold warnings without updating every second */}
        <div
          role="timer"
          aria-label={`Time remaining: ${timerDisplay}`}
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 rounded-xl font-mono font-bold text-lg transition",
            isPaused
              ? "bg-amber-900/60 text-amber-300"
              : timerWarning
              ? "bg-red-900/60 text-red-300"
              : "bg-slate-800 text-white"
          )}
        >
          <Clock className="w-4 h-4" aria-hidden="true" />
          <span aria-hidden="true">{timerDisplay}</span>
        </div>

        {/* Fullscreen toggle */}
        {!isFullscreen && (
          <button
            onClick={enterFullscreen}
            aria-label="Enter fullscreen"
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800"
          >
            <Maximize2 className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </header>

      {/* ── Main exam area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Question panel */}
        <main className={cn("flex-1 overflow-y-auto p-6 lg:p-10", isPaused && "pointer-events-none select-none opacity-50")}>
          {/* Question counter */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-slate-400 text-sm">
              Question <span className="text-white font-semibold">{currentIndex + 1}</span> of {questions.length}
            </span>
            <button
              onClick={() => toggleFlag(currentQuestion.id)}
              aria-pressed={flagged.has(currentQuestion.id)}
              aria-label={flagged.has(currentQuestion.id) ? "Remove flag from this question" : "Flag this question for review"}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition font-medium",
                flagged.has(currentQuestion.id)
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-amber-400"
              )}
            >
              <Flag className="w-3.5 h-3.5" aria-hidden="true" />
              {flagged.has(currentQuestion.id) ? "Flagged" : "Flag for review"}
            </button>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <Progress value={(answeredCountActual / questions.length) * 100} className="h-1.5 bg-slate-800" />
            <p className="text-xs text-slate-500 mt-1.5">{answeredCountActual} of {questions.length} answered</p>
          </div>

          {/* Question text */}
          <div className="mb-6">
            <p className="text-white text-lg leading-relaxed font-medium">
              {currentQuestion.questionText}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              {currentQuestion.marks} mark{currentQuestion.marks !== 1 ? "s" : ""}
              {isMultiSelect(currentQuestion.questionType) && (
                <span className="ml-2 text-primary">· Select all that apply</span>
              )}
            </p>
          </div>

          {/* Answer area */}
          <div className="space-y-3">
            {/* MCQ / true-false / mcq_single (single select)
                role="radiogroup" + role="radio" + aria-checked: WCAG 4.1.2
                Screen readers announce "option text, radio button, N of M" */}
            {isChoiceQuestion(currentQuestion.questionType) && !isMultiSelect(currentQuestion.questionType) && (
              currentQuestion.options.length > 0 ? (
                <div role="radiogroup" aria-label={currentQuestion.questionText}>
                  {currentQuestion.options.map((option) => {
                    const selected = answers[currentQuestion.id]?.selectedOptionId === option.id;
                    return (
                      <button
                        key={option.id}
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setAnswer(currentQuestion.id, { selectedOptionId: option.id })}
                        className={cn(
                          "w-full text-left px-5 py-4 rounded-xl border transition text-sm font-medium mb-3 last:mb-0",
                          selected
                            ? "bg-primary/20 border-primary text-white"
                            : "bg-slate-800/50 border-slate-700 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div aria-hidden="true" className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition",
                            selected ? "border-primary bg-primary" : "border-slate-600"
                          )}>
                            {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          {option.text}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-sm italic py-4">No answer options available for this question.</p>
              )
            )}

            {/* mcq_multi (multi-select)
                role="group" + role="checkbox" + aria-checked: WCAG 4.1.2 */}
            {isMultiSelect(currentQuestion.questionType) && (
              currentQuestion.options.length > 0 ? (
                <div role="group" aria-label={`${currentQuestion.questionText} — select all that apply`}>
                  {currentQuestion.options.map((option) => {
                    const selected = (answers[currentQuestion.id]?.selectedOptionIds ?? []).includes(option.id);
                    return (
                      <button
                        key={option.id}
                        role="checkbox"
                        aria-checked={selected}
                        onClick={() => toggleMultiOption(currentQuestion.id, option.id)}
                        className={cn(
                          "w-full text-left px-5 py-4 rounded-xl border transition text-sm font-medium mb-3 last:mb-0",
                          selected
                            ? "bg-primary/20 border-primary text-white"
                            : "bg-slate-800/50 border-slate-700 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div aria-hidden="true" className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition",
                            selected ? "border-primary bg-primary" : "border-slate-600"
                          )}>
                            {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          {option.text}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-sm italic py-4">No answer options available for this question.</p>
              )
            )}

            {currentQuestion.questionType === "fill_blank" && (
              <div>
                {/* sr-only label satisfies WCAG 3.3.2 — placeholder is not a substitute
                    for a label (disappears on input; not re-read on focus) */}
                <label htmlFor={`fill-blank-${currentQuestion.id}`} className="sr-only">
                  Your answer for: {currentQuestion.questionText}
                </label>
                <input
                  id={`fill-blank-${currentQuestion.id}`}
                  type="text"
                  value={answers[currentQuestion.id]?.textAnswer ?? ""}
                  onChange={(e) => setAnswer(currentQuestion.id, { textAnswer: e.target.value })}
                  placeholder="Type your answer here…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-5 py-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-primary text-sm"
                />
              </div>
            )}

            {currentQuestion.questionType === "essay" && (
              <div>
                {/* sr-only label satisfies WCAG 3.3.2 */}
                <label htmlFor={`essay-${currentQuestion.id}`} className="sr-only">
                  Your answer for: {currentQuestion.questionText}
                </label>
                <textarea
                  id={`essay-${currentQuestion.id}`}
                  value={answers[currentQuestion.id]?.textAnswer ?? ""}
                  onChange={(e) => setAnswer(currentQuestion.id, { textAnswer: e.target.value })}
                  placeholder="Write your answer here…"
                  rows={8}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-5 py-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-primary text-sm resize-none"
                />
                <p className="text-xs text-slate-500 mt-1.5" aria-live="polite" aria-atomic="true">
                  {(answers[currentQuestion.id]?.textAnswer ?? "").length} characters · Essay questions are manually graded by an examiner
                </p>
              </div>
            )}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-10">
            <Button
              variant="outline"
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="gap-2 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </Button>

            {currentIndex < questions.length - 1 ? (
              <Button
                onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                className="gap-2"
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={() => setShowConfirm(true)}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <Send className="w-4 h-4" /> Submit Exam
              </Button>
            )}
          </div>
        </main>

        {/* ── Right sidebar: camera + navigator ── */}
        <aside className="hidden lg:flex flex-col w-64 bg-slate-900 border-l border-slate-800 shrink-0">
          {/* Camera feed */}
          {requiresProctoring && (
            <div className="p-3 border-b border-slate-800">
              <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Camera className="w-3 h-3" /> Camera Feed
              </p>
              <div className="relative rounded-lg overflow-hidden bg-slate-950 aspect-video">
                <video
                  ref={videoRef}
                  className={cn(
                    "w-full h-full object-cover",
                    cameraStatus !== "active" && "hidden"
                  )}
                  muted
                  playsInline
                />
                {cameraStatus !== "active" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    {cameraStatus === "denied" ? (
                      <>
                        <CameraOff className="w-6 h-6 text-red-400" />
                        <p className="text-[10px] text-red-400 text-center px-2">Camera access denied</p>
                      </>
                    ) : (
                      <>
                        <Camera className="w-6 h-6 text-slate-500" />
                        <p className="text-[10px] text-slate-500">Starting camera…</p>
                      </>
                    )}
                  </div>
                )}
                {cameraBlocked && cameraStatus === "active" && (
                  <div className="absolute inset-0 bg-red-900/70 flex items-center justify-center">
                    <p className="text-[10px] text-red-200 text-center px-2 font-medium">Camera blocked</p>
                  </div>
                )}
              </div>
              {cameraStatus === "active" && (
                <p className={cn("text-[9px] mt-1 flex items-center gap-1",
                  faceStatus === "ok" ? "text-emerald-400" :
                  faceStatus === "loading" ? "text-slate-400" :
                  faceStatus === "absent" ? "text-red-400" :
                  faceStatus === "multiple" ? "text-red-400" :
                  faceStatus === "looking_away" ? "text-amber-400" :
                  faceStatus === "talking" ? "text-amber-400" :
                  "text-red-400"
                )}>
                  <span className={cn("w-1.5 h-1.5 rounded-full inline-block shrink-0",
                    faceStatus === "ok" ? "bg-emerald-400 animate-pulse" :
                    faceStatus === "loading" ? "bg-slate-500 animate-pulse" :
                    "bg-red-400 animate-pulse"
                  )} />
                  {faceStatus === "loading" && "Loading AI detection…"}
                  {faceStatus === "ok" && "1 face · monitoring active"}
                  {faceStatus === "absent" && "⚠ No face detected"}
                  {faceStatus === "multiple" && "⚠ Multiple faces!"}
                  {faceStatus === "looking_away" && "⚠ Looking away"}
                  {faceStatus === "talking" && "⚠ Talking detected"}
                  {faceStatus === "blocked" && "⚠ Camera covered"}
                </p>
              )}
            </div>
          )}

          {/* Question navigator */}
          <div className="p-4 border-b border-slate-800">
            <p className="text-slate-300 text-xs font-semibold uppercase tracking-wide mb-1">Navigator</p>
            <p className="text-slate-500 text-xs">{answeredCountActual}/{questions.length} answered · {flaggedCount} flagged</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-5 gap-1.5">
              {questions.map((q, i) => {
                const answered = isAnswered(q.id);
                const isFlagged = flagged.has(q.id);
                const isCurrent = i === currentIndex;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(i)}
                    aria-label={`Question ${i + 1}${isFlagged ? ", flagged" : ""}${answered ? ", answered" : ", not answered"}${isCurrent ? ", current" : ""}`}
                    aria-current={isCurrent ? "true" : undefined}
                    className={cn(
                      "aspect-square rounded-lg text-xs font-semibold flex items-center justify-center transition border",
                      isCurrent
                        ? "bg-primary border-primary text-white"
                        : isFlagged
                          ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                          : answered
                            ? "bg-emerald-600/20 border-emerald-500/30 text-emerald-400"
                            : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                    )}
                  >
                    {isFlagged && !isCurrent ? <Flag className="w-2.5 h-2.5" aria-hidden="true" /> : i + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="p-3 border-t border-slate-800 space-y-1.5">
            {[
              { color: "bg-primary", label: "Current" },
              { color: "bg-emerald-600/40 border border-emerald-500/30", label: "Answered" },
              { color: "bg-amber-500/20 border border-amber-500/50", label: "Flagged" },
              { color: "bg-slate-800 border border-slate-700", label: "Not answered" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-slate-400">
                <div className={cn("w-4 h-4 rounded shrink-0", color)} />
                {label}
              </div>
            ))}
          </div>

          {/* Submit button */}
          <div className="p-3 border-t border-slate-800">
            <Button
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setShowConfirm(true)}
              disabled={submitting}
            >
              <Send className="w-4 h-4" />
              {submitting ? "Submitting…" : "Submit Exam"}
            </Button>
          </div>
        </aside>
      </div>

      {/* ── Camera-denied persistent banner ── */}
      {requiresProctoring && cameraStatus === "denied" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-red-950 border-t-2 border-red-700 px-4 py-3 flex items-center gap-3">
          <CameraOff className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-200">Camera access denied — violation recorded</p>
            <p className="text-xs text-red-400 mt-0.5">
              Proctored exams require camera access. This has been recorded as a violation.
              {tabSwitchLimit - tabViolations > 0
                ? ` Violations remaining before termination: ${tabSwitchLimit - tabViolations}.`
                : " Your exam will be terminated."}
            </p>
          </div>
        </div>
      )}

      {/* ── Violation warning modal (exam paused) ── */}
      {showViolationWarning && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="violation-dialog-title"
            className="bg-slate-900 border border-red-700 rounded-2xl p-8 max-w-md w-full shadow-2xl"
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center shrink-0" aria-hidden="true">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 id="violation-dialog-title" className="font-bold text-white text-lg">Exam Paused — Violation Detected</h3>
                <p className="text-slate-400 text-sm mt-1">
                  <strong className="text-red-300">{lastViolationType}</strong> detected — violation {tabViolations} of {tabSwitchLimit}.
                </p>
                <p className="text-slate-500 text-xs mt-1.5">
                  {tabSwitchLimit - tabViolations} more violation{tabSwitchLimit - tabViolations !== 1 ? "s" : ""} will automatically terminate your exam.
                </p>
                <p className="text-slate-600 text-xs mt-1">
                  Violations include: switching browser tabs, switching to other applications, pressing the back button, or covering the camera.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                onClick={() => handleSubmitRef.current(true)}
                disabled={submitting}
              >
                End Exam Now
              </Button>
              <Button
                ref={violationModalBtnRef}
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={() => {
                  setShowViolationWarning(false);
                  isPausedRef.current = false;
                  setIsPaused(false);
                }}
              >
                Resume Exam
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm submit modal ── */}
      {showConfirm && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl"
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0" aria-hidden="true">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 id="confirm-dialog-title" className="font-bold text-white text-lg">Submit Exam?</h3>
                <p className="text-slate-400 text-sm mt-1">This action cannot be undone. Review your answers before submitting.</p>
              </div>
              <button
                onClick={() => setShowConfirm(false)}
                aria-label="Close — continue exam"
                className="ml-auto text-slate-500 hover:text-white transition shrink-0"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="bg-slate-800 rounded-xl p-4 mb-6 space-y-2 text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Total questions</span>
                <span className="font-semibold">{questions.length}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Answered</span>
                <span className={cn("font-semibold", answeredCountActual === questions.length ? "text-emerald-400" : "text-amber-400")}>
                  {answeredCountActual}
                </span>
              </div>
              {unansweredCount > 0 && (
                <div className="flex justify-between text-amber-400">
                  <span>Unanswered</span>
                  <span className="font-semibold">{unansweredCount}</span>
                </div>
              )}
              {flaggedCount > 0 && (
                <div className="flex justify-between text-amber-400">
                  <span>Flagged for review</span>
                  <span className="font-semibold">{flaggedCount}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-300">
                <span>Time remaining</span>
                <span className={cn("font-mono font-semibold", timerWarning ? "text-red-400" : "text-white")}>
                  {timerDisplay}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Pass mark</span>
                <span className="font-semibold">{passMark}%</span>
              </div>
            </div>

            {unansweredCount > 0 && (
              <div className="flex items-start gap-2 bg-amber-900/30 border border-amber-700/40 rounded-xl p-3 mb-6 text-amber-300 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>You have {unansweredCount} unanswered question{unansweredCount !== 1 ? "s" : ""}. Unanswered questions score zero.</span>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                ref={confirmModalBtnRef}
                variant="outline"
                className="flex-1 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
              >
                Continue Exam
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2"
                onClick={() => handleSubmit(false)}
                disabled={submitting}
              >
                <CheckCircle2 className="w-4 h-4" />
                {submitting ? "Submitting…" : "Submit Now"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
