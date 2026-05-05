"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Eye, AlertTriangle, RefreshCw, User, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Incident = {
  id: string;
  type: string;
  severity: string;
  timestamp: string;
};

type Session = {
  id: string;
  flagCount: number;
  startedAt: string;
  candidateName: string;
  examTitle: string;
  incidents: Incident[];
};

const SEVERITY_COLOR: Record<string, string> = {
  low:      "bg-amber-100 text-amber-700",
  medium:   "bg-orange-100 text-orange-700",
  high:     "bg-red-100 text-red-700",
  critical: "bg-red-200 text-red-900",
};

const INCIDENT_LABELS: Record<string, string> = {
  tab_switch:      "Tab switch",
  window_switch:   "Window switch",
  navigation_exit: "Navigation exit",
  no_face:         "No face",
  multiple_faces:  "Multiple faces",
  audio_anomaly:   "Audio anomaly",
  phone_detected:  "Phone detected",
  gaze_away:       "Gaze away",
};

export default function ProctorMonitorPage({ sessions: initial }: { sessions: Session[] }) {
  const [sessions, setSessions] = useState(initial);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/exams/proctoring", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json() as Session[];
        setSessions(data);
        setLastRefresh(new Date());
      }
    } catch {
      // silently ignore — stale data still shown
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(function poll() {
      void refresh();
      setTimeout(poll, 30_000);
    }, 30_000);
    return () => clearTimeout(id);
  }, [refresh]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Eye className="w-6 h-6 text-indigo-600" />
            Live Exam Monitoring
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Active proctoring sessions · auto-refreshes every 30 s
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Last updated {formatDistanceToNow(lastRefresh, { addSuffix: true })}
          </span>
          <button
            onClick={() => void refresh()}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Empty state */}
      {sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
          <Eye className="w-10 h-10 opacity-40" />
          <p className="text-sm font-medium">No active exam sessions</p>
          <p className="text-xs text-slate-400">Active sessions will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={cn(
                "bg-white rounded-2xl border shadow-sm p-5 space-y-4 transition",
                s.flagCount > 0 ? "border-red-200" : "border-slate-200",
              )}
            >
              {/* Session header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                    <p className="font-semibold text-slate-900 truncate">{s.candidateName}</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 pl-6">{s.examTitle}</p>
                </div>
                {s.flagCount > 0 && (
                  <span className="flex items-center gap-1 shrink-0 bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-3 h-3" />
                    {s.flagCount} flag{s.flagCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Started */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5" />
                Started {formatDistanceToNow(new Date(s.startedAt), { addSuffix: true })}
              </div>

              {/* Recent incidents */}
              {s.incidents.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Recent incidents
                  </p>
                  {s.incidents.map((inc) => (
                    <div
                      key={inc.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-xs text-slate-700 truncate">
                        {INCIDENT_LABELS[inc.type] ?? inc.type}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                            SEVERITY_COLOR[inc.severity] ?? "bg-slate-100 text-slate-600",
                          )}
                        >
                          {inc.severity}
                        </span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {formatDistanceToNow(new Date(inc.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* View details */}
              <div className="pt-1 border-t border-slate-100">
                <Link
                  href={`/proctor/${s.id}`}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
                >
                  View full session →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
