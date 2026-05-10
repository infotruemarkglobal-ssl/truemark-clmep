"use client";

import { useState } from "react";
import {
  ChevronDown, Shield, TabletSmartphone, Monitor, MessageCircle,
  UserX, Users, Minimize, XCircle, Printer, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Incident metadata ─────────────────────────────────────────────────────────

const INCIDENT_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  tab_switch:        { icon: TabletSmartphone, label: "Tab Switch",          color: "text-amber-600" },
  window_switch:     { icon: Monitor,          label: "Window Switch",        color: "text-amber-600" },
  talking_detected:  { icon: MessageCircle,    label: "Talking Detected",     color: "text-orange-600" },
  audio_anomaly:     { icon: MessageCircle,    label: "Audio Anomaly",        color: "text-orange-600" },
  face_not_detected: { icon: UserX,            label: "Face Not Detected",    color: "text-red-600" },
  no_face:           { icon: UserX,            label: "Face Not Detected",    color: "text-red-600" },
  face_multiple:     { icon: Users,            label: "Multiple Faces",       color: "text-red-600" },
  multiple_faces:    { icon: Users,            label: "Multiple Faces",       color: "text-red-600" },
  fullscreen_exit:   { icon: Minimize,         label: "Fullscreen Exit",      color: "text-amber-600" },
  exam_terminated:   { icon: XCircle,          label: "Exam Terminated",      color: "text-red-600" },
  phone_detected:    { icon: TabletSmartphone, label: "Phone Detected",       color: "text-red-600" },
  gaze_away:         { icon: UserX,            label: "Gaze Away",            color: "text-amber-600" },
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  low:    { label: "LOW",    color: "bg-slate-100 text-slate-600",  dot: "bg-slate-400"  },
  medium: { label: "MEDIUM", color: "bg-amber-100 text-amber-700",  dot: "bg-amber-400"  },
  high:   { label: "HIGH",   color: "bg-red-100 text-red-600",      dot: "bg-red-500"    },
};

function formatOffset(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Incident = {
  id: string;
  type: string;
  severity: string;
  description: string | null;
  timestamp: string;
  offsetSeconds: number;
  reviewed: boolean;
  reviewNote: string | null;
};

type SessionSummary = {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  flagCount: number;
  integrityScore: number;
};

type ReportData =
  | { hasSession: false }
  | {
      hasSession: true;
      session: SessionSummary;
      incidents: Incident[];
      counts: Record<string, number>;
      totalViolations: number;
    };

// ── Print helper ──────────────────────────────────────────────────────────────

function buildPrintHtml(data: Extract<ReportData, { hasSession: true }>, attemptId: string): string {
  const rows = data.incidents
    .map(
      (i) =>
        `<tr>
          <td>${formatOffset(i.offsetSeconds)}</td>
          <td>${INCIDENT_CONFIG[i.type]?.label ?? i.type}</td>
          <td>${i.severity.toUpperCase()}</td>
          <td>${i.description ?? "—"}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><title>Proctoring Report — ${attemptId}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 2rem; }
  h1  { font-size: 18px; margin-bottom: 4px; }
  .meta { color: #64748b; font-size: 11px; margin-bottom: 1.5rem; }
  .summary { display: flex; gap: 2.5rem; margin-bottom: 1.5rem; }
  .stat-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; margin-bottom: 2px; }
  .stat-value { font-size: 16px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  th  { background: #f1f5f9; text-align: left; padding: 6px 8px; font-size: 11px; }
  td  { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
  .empty { text-align: center; color: #94a3b8; padding: 1rem; }
</style></head><body>
<h1>Proctoring Report</h1>
<div class="meta">Attempt ID: ${attemptId} · Generated ${new Date().toLocaleString()}</div>
<div class="summary">
  <div><div class="stat-label">Status</div><div class="stat-value">${data.session.status.toUpperCase()}</div></div>
  <div><div class="stat-label">Duration</div><div class="stat-value">${data.session.durationMinutes !== null ? `${data.session.durationMinutes} min` : "N/A"}</div></div>
  <div><div class="stat-label">Integrity Score</div><div class="stat-value">${data.session.integrityScore}%</div></div>
  <div><div class="stat-label">Total Violations</div><div class="stat-value">${data.totalViolations}</div></div>
</div>
<table>
  <thead><tr><th>Time</th><th>Incident</th><th>Severity</th><th>Description</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="4" class="empty">No violations recorded</td></tr>`}</tbody>
</table>
</body></html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProctoringReportPanel({ attemptId }: { attemptId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function load() {
    if (data !== null) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/exams/proctoring/${attemptId}/report`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load");
      setData(await res.json() as ReportData);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load proctoring data");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  function handlePrint() {
    if (!data || !data.hasSession) return;
    const html = buildPrintHtml(data, attemptId);
    const w = window.open("", "_blank", "width=820,height=600");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  // ── Integrity colour helpers ──
  const score = data?.hasSession ? data.session.integrityScore : null;
  const integrityColor =
    score === null ? "" : score >= 90 ? "text-emerald-600" : score >= 70 ? "text-amber-600" : "text-red-600";
  const integrityBg =
    score === null ? "" : score >= 90 ? "bg-emerald-50 border-emerald-200" : score >= 70 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  const integrityLabel =
    score === null
      ? ""
      : score >= 90
      ? "High integrity — no significant violations"
      : score >= 70
      ? "Moderate — some violations recorded"
      : "Significant violations — review recommended";

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Toggle trigger */}
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition text-sm font-medium text-slate-700 gap-2"
      >
        <span className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-slate-400" />
          View Proctoring Report
        </span>
        <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {/* Panel body */}
      {open && (
        <div className="p-4 space-y-4 border-t border-slate-200 bg-white">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading proctoring data…</span>
            </div>
          )}

          {/* Error */}
          {fetchError && (
            <p className="text-sm text-red-500 text-center py-4">{fetchError}</p>
          )}

          {/* No session */}
          {data && !data.hasSession && (
            <div className="bg-slate-50 rounded-xl px-4 py-8 text-center">
              <Shield className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">This exam was not proctored</p>
              <p className="text-xs text-slate-400 mt-0.5">No proctoring session was started for this attempt.</p>
            </div>
          )}

          {/* Report */}
          {data?.hasSession && (
            <>
              {/* Session summary grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: "Session Start",
                    value: format(new Date(data.session.startedAt), "d MMM yyyy, HH:mm"),
                  },
                  {
                    label: "Duration",
                    value: data.session.durationMinutes !== null
                      ? `${data.session.durationMinutes} min`
                      : "In progress",
                  },
                  {
                    label: "Status",
                    value: null,
                    badge: (
                      <Badge
                        className={cn(
                          "text-[10px] border-0",
                          data.session.status === "active"
                            ? "bg-blue-100 text-blue-700"
                            : data.session.status === "ended"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-red-100 text-red-600",
                        )}
                      >
                        {data.session.status.toUpperCase()}
                      </Badge>
                    ),
                  },
                  {
                    label: "Integrity Score",
                    value: null,
                    badge: (
                      <span className={cn("text-lg font-bold", integrityColor)}>
                        {data.session.integrityScore}%
                      </span>
                    ),
                  },
                ].map(({ label, value, badge }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                    {badge ?? <p className="text-sm font-medium text-slate-800">{value}</p>}
                  </div>
                ))}
              </div>

              {/* Integrity assessment */}
              <div className={cn("rounded-xl px-4 py-3 border flex items-start gap-2", integrityBg)}>
                <Shield className={cn("w-4 h-4 mt-0.5 shrink-0", integrityColor)} />
                <div>
                  <p className={cn("text-sm font-semibold", integrityColor)}>{integrityLabel}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {data.totalViolations} violation{data.totalViolations !== 1 ? "s" : ""} recorded
                    {" · "}Score = 100 − (violations × 10)
                  </p>
                </div>
              </div>

              {/* Violation breakdown */}
              {Object.keys(data.counts).length > 0 && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">Violation Breakdown</p>
                  <div className="space-y-1">
                    {Object.entries(data.counts).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">{INCIDENT_CONFIG[type]?.label ?? type}</span>
                        <span className="font-semibold text-slate-800">{count}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs border-t border-slate-200 pt-1 mt-1">
                      <span className="font-semibold text-slate-700">Total violations</span>
                      <span className="font-bold text-slate-900">{data.totalViolations}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Violation timeline */}
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-3">Violation Timeline</p>
                {data.incidents.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-2">No violations recorded</p>
                ) : (
                  <div className="relative pl-5">
                    {/* vertical guide line */}
                    <div className="absolute left-1.5 top-2 bottom-2 w-px bg-slate-200" />
                    <div className="space-y-4">
                      {data.incidents.map((inc) => {
                        const conf = INCIDENT_CONFIG[inc.type] ?? {
                          icon: Shield,
                          label: inc.type,
                          color: "text-slate-500",
                        };
                        const sev = SEVERITY_CONFIG[inc.severity] ?? {
                          label: inc.severity.toUpperCase(),
                          color: "bg-slate-100 text-slate-500",
                          dot: "bg-slate-400",
                        };
                        const Icon = conf.icon;
                        return (
                          <div key={inc.id} className="relative flex items-start gap-3">
                            {/* timeline dot */}
                            <div
                              className={cn(
                                "absolute -left-[14px] top-1.5 w-2 h-2 rounded-full border-2 border-white",
                                sev.dot,
                              )}
                            />
                            <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", conf.color)} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-mono text-slate-400">
                                  {formatOffset(inc.offsetSeconds)}
                                </span>
                                <span className="text-xs font-semibold text-slate-800">{conf.label}</span>
                                <Badge className={cn("text-[9px] border-0 px-1.5 py-0", sev.color)}>
                                  {sev.label}
                                </Badge>
                              </div>
                              {inc.description && (
                                <p className="text-xs text-slate-500 mt-0.5">{inc.description}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Export */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2 text-slate-600"
                onClick={handlePrint}
              >
                <Printer className="w-4 h-4" />
                Export Proctoring Report
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
