"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, CheckCircle2, AlertCircle, Clock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type SessionData = {
  id: string;
  completionStatus: string;
  successStatus: string | null;
  scoreRaw: number | null;
  totalTime: string | null;
  suspendData: string | null;
  entry: string;
  cmiData: Record<string, unknown>;
};

// Convert seconds to SCORM HH:MM:SS
function secondsToScormTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Add two SCORM time strings HH:MM:SS
function addScormTimes(t1: string, t2: string): string {
  function toSec(t: string) {
    const parts = t.split(":").map(Number);
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  }
  return secondsToScormTime(toSec(t1) + toSec(t2));
}

export default function ScormPlayer({
  packageId,
  title,
  version,
  launchUrl,
  existingSession,
  userId,
  userName,
}: {
  packageId: string;
  title: string;
  version: string;
  launchUrl: string;
  existingSession: SessionData | null;
  userId: string;
  userName: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sessionIdRef = useRef<string | null>(existingSession?.id ?? null);
  const cmiRef = useRef<Record<string, string>>({});
  const sessionStartRef = useRef<number>(Date.now());
  const initializedRef = useRef(false);
  const [status, setStatus] = useState(existingSession?.completionStatus ?? "not attempted");
  const [score, setScore] = useState<number | null>(existingSession?.scoreRaw ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Commit CMI data to server
  const commitToServer = useCallback(async (finish = false) => {
    const id = sessionIdRef.current;
    if (!id) return;

    const sessionSecs = Math.floor((Date.now() - sessionStartRef.current) / 1000);
    const sessionTime = secondsToScormTime(sessionSecs);
    const prevTotal = (existingSession?.totalTime ?? "00:00:00");
    const newTotal = addScormTimes(prevTotal, sessionTime);

    const cmi = cmiRef.current;
    const completionStatus =
      cmi["cmi.core.lesson_status"] ??         // SCORM 1.2
      cmi["cmi.completion_status"] ??           // SCORM 2004
      "incomplete";
    const successStatus =
      cmi["cmi.success_status"] ?? null;        // SCORM 2004 only
    const rawScore =
      cmi["cmi.core.score.raw"] ??             // SCORM 1.2
      cmi["cmi.score.raw"] ?? null;            // SCORM 2004
    const suspendData =
      cmi["cmi.suspend_data"] ??
      cmi["cmi.core.lesson_location"] ?? null;

    const payload = {
      completionStatus,
      successStatus,
      scoreRaw: rawScore !== null ? parseFloat(String(rawScore)) : null,
      scoreMin: cmi["cmi.core.score.min"] ? parseFloat(cmi["cmi.core.score.min"]) : null,
      scoreMax: cmi["cmi.core.score.max"] ? parseFloat(cmi["cmi.core.score.max"]) : null,
      totalTime: newTotal,
      suspendData,
      entry: "resume",
      cmiData: cmi,
    };

    setSaving(true);
    try {
      await fetch(`/api/scorm/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setStatus(completionStatus);
      if (rawScore !== null) setScore(parseFloat(String(rawScore)));
    } catch {
      // Silently fail — content continues playing
    } finally {
      setSaving(false);
    }
  }, [existingSession]);

  useEffect(() => {
    // Pre-populate CMI from existing session
    if (existingSession?.cmiData) {
      const data = existingSession.cmiData as Record<string, string>;
      cmiRef.current = { ...data };
    }

    // ─── SCORM 1.2 API ──────────────────────────────────────────────────────
    const API12 = {
      LMSInitialize(_: string): string {
        if (initializedRef.current) return "true";
        initializedRef.current = true;

        // Seed initial CMI values for SCORM 1.2
        const cmi = cmiRef.current;
        if (!cmi["cmi.core.student_id"]) cmi["cmi.core.student_id"] = userId;
        if (!cmi["cmi.core.student_name"]) cmi["cmi.core.student_name"] = userName;
        if (!cmi["cmi.core.lesson_status"]) cmi["cmi.core.lesson_status"] = "not attempted";
        if (!cmi["cmi.core.entry"]) {
          cmi["cmi.core.entry"] = existingSession?.entry ?? "ab-initio";
        }
        if (!cmi["cmi.core.total_time"]) {
          cmi["cmi.core.total_time"] = existingSession?.totalTime ?? "00:00:00";
        }
        if (!cmi["cmi.suspend_data"] && existingSession?.suspendData) {
          cmi["cmi.suspend_data"] = existingSession.suspendData;
        }
        if (!cmi["cmi.launch_data"]) cmi["cmi.launch_data"] = "";

        // Create session if not exists
        if (!sessionIdRef.current) {
          fetch("/api/scorm/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packageId }),
          })
            .then((r) => r.json())
            .then((d) => { sessionIdRef.current = d.id; })
            .catch(() => {});
        }
        return "true";
      },

      LMSFinish(_: string): string {
        commitToServer(true);
        initializedRef.current = false;
        return "true";
      },

      LMSGetValue(element: string): string {
        return String(cmiRef.current[element] ?? "");
      },

      LMSSetValue(element: string, value: string): string {
        cmiRef.current[element] = String(value);
        // Live update status display
        if (element === "cmi.core.lesson_status") setStatus(value);
        if (element === "cmi.core.score.raw") setScore(parseFloat(value));
        return "true";
      },

      LMSCommit(_: string): string {
        commitToServer(false);
        return "true";
      },

      LMSGetLastError(): string { return "0"; },
      LMSGetErrorString(_: string): string { return "No error"; },
      LMSGetDiagnostic(_: string): string { return "No error"; },
    };

    // ─── SCORM 2004 API ─────────────────────────────────────────────────────
    const API2004 = {
      Initialize(_: string): string {
        if (initializedRef.current) return "true";
        initializedRef.current = true;

        const cmi = cmiRef.current;
        if (!cmi["cmi.learner_id"]) cmi["cmi.learner_id"] = userId;
        if (!cmi["cmi.learner_name"]) cmi["cmi.learner_name"] = userName;
        if (!cmi["cmi.completion_status"]) cmi["cmi.completion_status"] = "not attempted";
        if (!cmi["cmi.success_status"]) cmi["cmi.success_status"] = "unknown";
        if (!cmi["cmi.entry"]) {
          cmi["cmi.entry"] = existingSession?.entry === "resume" ? "resume" : "ab-initio";
        }
        if (!cmi["cmi.total_time"]) {
          cmi["cmi.total_time"] = existingSession?.totalTime ?? "PT0S";
        }
        if (!cmi["cmi.suspend_data"] && existingSession?.suspendData) {
          cmi["cmi.suspend_data"] = existingSession.suspendData;
        }

        if (!sessionIdRef.current) {
          fetch("/api/scorm/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packageId }),
          })
            .then((r) => r.json())
            .then((d) => { sessionIdRef.current = d.id; })
            .catch(() => {});
        }
        return "true";
      },

      Terminate(_: string): string {
        commitToServer(true);
        initializedRef.current = false;
        return "true";
      },

      GetValue(element: string): string {
        return String(cmiRef.current[element] ?? "");
      },

      SetValue(element: string, value: string): string {
        cmiRef.current[element] = String(value);
        if (element === "cmi.completion_status") setStatus(value);
        if (element === "cmi.score.raw") setScore(parseFloat(value));
        return "true";
      },

      Commit(_: string): string {
        commitToServer(false);
        return "true";
      },

      GetLastError(): string { return "0"; },
      GetErrorString(_: string): string { return "No error"; },
      GetDiagnostic(_: string): string { return "No error"; },
    };

    // Attach both APIs to the window so the iframe's parent search finds them
    (window as unknown as Record<string, unknown>).API = API12;
    (window as unknown as Record<string, unknown>).API_1484_11 = API2004;

    // Auto-commit every 30 seconds
    const autoCommit = setInterval(() => {
      if (initializedRef.current) commitToServer(false);
    }, 30_000);

    // Commit on page unload
    const handleUnload = () => {
      if (initializedRef.current) commitToServer(true);
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(autoCommit);
      window.removeEventListener("beforeunload", handleUnload);
      delete (window as unknown as Record<string, unknown>).API;
      delete (window as unknown as Record<string, unknown>).API_1484_11;
    };
  }, [packageId, userId, userName, commitToServer, existingSession]);

  const statusColor =
    status === "passed" || status === "completed"
      ? "text-emerald-600 bg-emerald-50"
      : status === "failed"
      ? "text-red-600 bg-red-50"
      : "text-amber-600 bg-amber-50";

  const StatusIcon =
    status === "passed" || status === "completed"
      ? CheckCircle2
      : status === "failed"
      ? AlertCircle
      : Clock;

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      {/* Top bar */}
      <div className="flex items-center justify-between h-12 px-4 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-sm font-semibold text-white truncate">{title}</h1>
          <span className="text-[10px] text-slate-400 shrink-0">SCORM {version}</span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Status badge */}
          <div className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg", statusColor)}>
            <StatusIcon className="w-3.5 h-3.5" />
            <span className="capitalize">{status.replace(/_/g, " ")}</span>
            {score !== null && <span>· {score.toFixed(0)}%</span>}
          </div>

          {/* Saving indicator */}
          {saving && (
            <span className="text-xs text-slate-400 animate-pulse">Saving…</span>
          )}

          {/* Manual save */}
          <button
            type="button"
            onClick={() => commitToServer(false)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            title="Save progress"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={() => {
              if (initializedRef.current) commitToServer(true);
              window.close();
              history.back();
            }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/50 border-b border-red-700 px-4 py-2 text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* SCORM iframe
          sandbox breakdown:
            allow-scripts      — SCORM JS must run
            allow-same-origin  — content calls window.parent.API (same-origin property access)
            allow-forms        — some SCORM packages submit forms for navigation
            allow-popups       — packages may open glossary / help windows
          Intentionally OMITTED:
            allow-top-navigation — prevents content from redirecting the top window (clickjacking)
            allow-popups-to-escape-sandbox — opened windows stay sandboxed

          ARCHITECTURAL NOTE: because /scorm-content/ is same-origin with the LMS,
          allow-same-origin means SCORM HTML/JS retains access to document.cookie and
          localStorage. The only full mitigation is to serve SCORM content from a
          separate origin (e.g. scorm-content.example.com). This is a known trade-off
          documented for future infrastructure work. */}
      <iframe
        ref={iframeRef}
        src={`/api/scorm/content/${packageId}/${launchUrl}`}
        className="flex-1 w-full border-0 bg-white"
        title={title}
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerPolicy="no-referrer"
        onError={() => setError("Failed to load SCORM content. Check that the package was uploaded correctly.")}
      />
    </div>
  );
}
