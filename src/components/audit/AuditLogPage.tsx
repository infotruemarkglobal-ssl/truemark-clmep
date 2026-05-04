"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import {
  Shield, ChevronLeft, ChevronRight, Filter, X,
  UserPlus, UserCheck, UserX, LogIn, LogOut,
  Award, ClipboardCheck, Scale, FileText, BookOpen,
  AlertTriangle, Camera, MonitorOff, Eye, Activity,
  ChevronDown, Building2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LogEntry = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: string | null;
  ipAddress: string | null;
  timestamp: string;
  user: { id: string; firstName: string; lastName: string; email: string; role: string } | null;
};

// ── Human-readable descriptions for every action ───────────────────────────

type ActionMeta = {
  label: string;
  color: string;
  icon: React.ElementType;
  /** Build a plain-English sentence from metadata + actor */
  describe: (actor: string, meta: Record<string, unknown>) => string;
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  CERTIFICATION_OFFICER: "Certification Officer",
  EXAMINER: "Examiner",
  TRAINER: "Trainer",
  PROCTOR: "Proctor",
  AUDITOR: "Auditor",
  ORG_MANAGER: "Organisation Manager",
  CANDIDATE: "Candidate",
};

function roleLabel(r: string) { return ROLE_LABELS[r] ?? r.replace(/_/g, " "); }
function str(v: unknown): string { return v ? String(v) : ""; }

const ACTION_META: Record<string, ActionMeta> = {
  USER_CREATED: {
    label: "User created", color: "bg-emerald-100 text-emerald-700", icon: UserPlus,
    describe: (actor, m) => `${actor} created a new ${roleLabel(str(m.role))} account for ${str(m.email) || "a user"}.`,
  },
  USER_UPDATED: {
    label: "User updated", color: "bg-blue-100 text-blue-700", icon: UserCheck,
    describe: (actor, m) => `${actor} updated profile details for ${str(m.targetName) || str(m.targetEmail) || "a user"}.`,
  },
  USER_SUSPENDED: {
    label: "Account suspended", color: "bg-red-100 text-red-700", icon: UserX,
    describe: (actor, m) => `${actor} suspended the account of ${str(m.targetName) || str(m.targetEmail) || "a user"}${m.reason ? ` — reason: ${m.reason}` : ""}.`,
  },
  USER_ACTIVATED: {
    label: "Account activated", color: "bg-emerald-100 text-emerald-700", icon: UserCheck,
    describe: (actor, m) => `${actor} reactivated the account of ${str(m.targetName) || str(m.targetEmail) || "a user"}.`,
  },
  LOGIN: {
    label: "Signed in", color: "bg-slate-100 text-slate-600", icon: LogIn,
    describe: (actor) => `${actor} signed in to the platform.`,
  },
  LOGOUT: {
    label: "Signed out", color: "bg-slate-100 text-slate-500", icon: LogOut,
    describe: (actor) => `${actor} signed out.`,
  },
  CERTIFICATE_ISSUED: {
    label: "Certificate issued", color: "bg-primary/10 text-primary", icon: Award,
    describe: (actor, m) => `${actor} issued certificate ${str(m.certNumber) || ""} for ${str(m.schemeCode) || "a scheme"} to candidate ${str(m.candidateId)?.slice(0, 8) || ""}.`,
  },
  CERTIFICATION_DECISION: {
    label: "Certification decision", color: "bg-primary/10 text-primary", icon: ClipboardCheck,
    describe: (actor, m) => {
      const d = str(m.decision);
      const verb = d === "approved" ? "approved" : d === "rejected" ? "rejected" : "referred";
      return `${actor} ${verb} the certification application for attempt ${str(m.attemptId)?.slice(0, 8) || ""}${m.justification ? ` — "${m.justification}"` : ""}.`;
    },
  },
  APPEAL_SUBMITTED: {
    label: "Appeal submitted", color: "bg-amber-100 text-amber-700", icon: Scale,
    describe: (actor, m) => `${actor} submitted an appeal${m.reference ? ` (ref: ${m.reference})` : ""}${m.type ? ` regarding ${str(m.type).replace(/_/g, " ")}` : ""}.`,
  },
  APPEAL_UPDATED: {
    label: "Appeal reviewed", color: "bg-amber-100 text-amber-700", icon: Scale,
    describe: (actor, m) => `${actor} updated appeal ${str(m.reference) || ""} — status changed to ${str(m.status) || "unknown"}.`,
  },
  EXAM_STARTED: {
    label: "Exam started", color: "bg-blue-100 text-blue-700", icon: FileText,
    describe: (actor, m) => `${actor} started exam "${str(m.examTitle) || str(m.examPaperId)?.slice(0, 8) || ""}".`,
  },
  EXAM_SUBMITTED: {
    label: "Exam submitted", color: "bg-blue-100 text-blue-600", icon: FileText,
    describe: (actor, m) => {
      const score = m.percentageScore !== undefined ? ` — scored ${m.percentageScore}%` : m.score !== undefined ? ` — scored ${m.score}%` : "";
      const violations = (m.totalViolations as number) > 0 ? `, ${m.totalViolations} proctoring violation${(m.totalViolations as number) !== 1 ? "s" : ""}` : "";
      const result = m.passed === true ? " (PASSED)" : m.passed === false ? " (FAILED)" : m.hasManualQuestions ? " (pending manual grading)" : "";
      return `${actor} submitted exam "${str(m.examTitle) || ""}"${score}${result}${violations}.`;
    },
  },
  EXAM_TERMINATED: {
    label: "Exam terminated", color: "bg-red-100 text-red-600", icon: MonitorOff,
    describe: (actor, m) => `${actor}'s exam was automatically terminated due to ${str(m.reason) || "proctoring violations"}.`,
  },
  CPD_ACTIVITY_LOGGED: {
    label: "CPD activity logged", color: "bg-purple-100 text-purple-700", icon: BookOpen,
    describe: (actor, m) => `${actor} logged ${str(m.hours) || ""}${m.hours ? " CPD hour(s)" : "a CPD activity"} for "${str(m.title) || "an activity"}".`,
  },
  TAB_VIOLATION: {
    label: "Tab switch violation", color: "bg-red-100 text-red-600", icon: AlertTriangle,
    describe: (actor, m) => `${actor} triggered a tab-switch violation during exam (violation ${str(m.count) || ""} of ${str(m.limit) || ""}).`,
  },
  PROCTORING_INCIDENT: {
    label: "Proctoring incident", color: "bg-red-100 text-red-600", icon: Camera,
    describe: (actor, m) => {
      const types: Record<string, string> = {
        tab_switch: "switched browser tab",
        window_switch: "switched to another application",
        camera_blocked: "covered the camera",
        no_face: "was not visible on camera",
        multiple_faces: "had multiple people in frame",
        talking_detected: "was detected talking",
        looking_away: "was looking away from the screen",
        navigation_attempt: "attempted to navigate away",
        navigation_exit: "navigated away from the exam",
        fullscreen_exit: "exited fullscreen mode",
        camera_denied: "denied camera access",
      };
      const desc = types[str(m.type)] ?? str(m.type).replace(/_/g, " ");
      return `${actor} ${desc} during a proctored exam.`;
    },
  },
  COURSE_CREATED: {
    label: "Course created", color: "bg-emerald-100 text-emerald-700", icon: BookOpen,
    describe: (actor, m) => `${actor} created a new course: "${str(m.title) || ""}".`,
  },
  COURSE_PUBLISHED: {
    label: "Course published", color: "bg-emerald-100 text-emerald-700", icon: Eye,
    describe: (actor, m) => `${actor} published course "${str(m.title) || ""}".`,
  },
  ENROLMENT_CREATED: {
    label: "Enrolment", color: "bg-blue-100 text-blue-700", icon: BookOpen,
    describe: (actor, m) => `${actor} enrolled in course "${str(m.courseTitle) || ""}".`,
  },
  COURSE_ENROLMENT: {
    label: "Enrolment", color: "bg-blue-100 text-blue-700", icon: BookOpen,
    describe: (actor, m) => `${actor} enrolled in course "${str(m.courseTitle) || ""}".`,
  },
  USER_LOGIN: {
    label: "Signed in", color: "bg-slate-100 text-slate-600", icon: LogIn,
    describe: (actor, m) => `${actor} signed in${m.method ? ` via ${m.method}` : ""}.`,
  },
  USER_LOGOUT: {
    label: "Signed out", color: "bg-slate-100 text-slate-500", icon: LogOut,
    describe: (actor) => `${actor} signed out.`,
  },
  USER_REGISTERED: {
    label: "Account created", color: "bg-emerald-100 text-emerald-700", icon: UserPlus,
    describe: (actor, m) => `${actor} created a ${m.role === "ORG_MANAGER" ? "organisation" : "candidate"} account.`,
  },
  ORG_REGISTERED: {
    label: "Organisation registered", color: "bg-blue-100 text-blue-700", icon: Building2,
    describe: (actor, m) => `${actor} registered organisation "${str(m.orgName) || ""}".`,
  },
  ORGANISATION_UPDATED: {
    label: "Organisation updated", color: "bg-blue-100 text-blue-700", icon: Building2,
    describe: (actor, m) => `${actor} updated organisation "${str(m.orgName) || ""}".`,
  },
  ORG_MEMBER_ADDED: {
    label: "Member added", color: "bg-emerald-100 text-emerald-700", icon: UserPlus,
    describe: (actor, m) => `${actor} added ${str(m.memberEmail) || "a user"} to organisation "${str(m.orgName) || ""}".`,
  },
  ORG_MEMBER_REMOVED: {
    label: "Member removed", color: "bg-red-100 text-red-700", icon: UserX,
    describe: (actor, m) => `${actor} removed ${str(m.memberEmail) || "a user"} from the organisation.`,
  },
  MEMBER_REMINDER_SENT: {
    label: "Reminder sent", color: "bg-amber-100 text-amber-700", icon: Activity,
    describe: (actor, m) => `${actor} sent a course reminder to ${str(m.memberEmail) || "a member"} for "${str(m.courseTitle) || ""}".`,
  },
  ORG_COURSE_ASSIGNED: {
    label: "Course assigned", color: "bg-purple-100 text-purple-700", icon: BookOpen,
    describe: (actor, m) => `${actor} assigned course "${str(m.courseTitle) || ""}" to ${str(m.enrolled) || "0"} member(s).`,
  },
  PAYMENT_CONFIRMED: {
    label: "Payment confirmed", color: "bg-emerald-100 text-emerald-700", icon: Activity,
    describe: (actor, m) => `${actor} completed payment of ${str(m.currency) || ""} ${str(m.amount) || ""} for "${str(m.courseTitle) || "a course"}".`,
  },
};

function getFallback(action: string): ActionMeta {
  return {
    label: action.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase()),
    color: "bg-slate-100 text-slate-600",
    icon: Activity,
    describe: (actor) => `${actor} performed action: ${action.replace(/_/g, " ").toLowerCase()}.`,
  };
}

function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

function MetaDetail({ meta }: { meta: Record<string, unknown> }) {
  // Render metadata as readable key-value pairs, not raw JSON
  const SKIP = new Set(["id", "userId", "courseId", "examPaperId", "attemptId", "proctoringSessionId"]);
  const LABELS: Record<string, string> = {
    email: "Email",
    role: "Role",
    targetName: "Affected user",
    targetEmail: "Affected email",
    certNumber: "Certificate number",
    schemeCode: "Scheme",
    schemeName: "Scheme name",
    decision: "Decision",
    justification: "Justification",
    reference: "Reference",
    type: "Type",
    status: "Status",
    reason: "Reason",
    hours: "CPD hours",
    title: "Title",
    score: "Score",
    percentageScore: "Score (%)",
    rawScore: "Raw score",
    count: "Violation count",
    limit: "Violation limit",
    totalViolations: "Total violations",
    flagCount: "Flag count",
    totalQuestions: "Total questions",
    durationMins: "Duration (mins)",
    hasManualQuestions: "Has manual questions",
    passed: "Result",
    examTitle: "Exam",
    courseTitle: "Course",
    amount: "Amount",
    currency: "Currency",
    candidateId: "Candidate ID",
    ipAddress: "IP address",
    free: "Free enrolment",
  };

  // Render violation breakdown separately
  const violationsByType = meta.violationsByType as Record<string, number> | undefined;

  const entries = Object.entries(meta).filter(([k, v]) =>
    !SKIP.has(k) && k !== "violationsByType" && v !== null && v !== undefined && v !== "" &&
    typeof v !== "object"
  );

  if (entries.length === 0 && !violationsByType) return null;

  return (
    <div className="px-4 pb-3 pt-1">
      <div className="bg-slate-50 rounded-xl p-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-start gap-2 text-xs">
            <span className="text-slate-400 shrink-0 w-32">{LABELS[k] ?? k.replace(/([A-Z])/g, " $1").trim()}</span>
            <span className="text-slate-800 font-medium break-all">
              {k === "role" ? roleLabel(String(v)) :
               k === "decision" ? String(v).charAt(0).toUpperCase() + String(v).slice(1) :
               k === "passed" ? (v === true ? "Passed" : v === false ? "Failed" : "Pending") :
               k === "hasManualQuestions" ? (v ? "Yes" : "No") :
               k === "free" ? (v ? "Yes" : "No") :
               String(v)}
            </span>
          </div>
        ))}
        {violationsByType && Object.keys(violationsByType).length > 0 && (
          <div className="sm:col-span-2 flex items-start gap-2 text-xs mt-1 border-t border-slate-200 pt-2">
            <span className="text-slate-400 shrink-0 w-32">Violations breakdown</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(violationsByType).map(([type, count]) => (
                <span key={type} className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  {type.replace(/_/g, " ")}: {count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuditLogPage({
  logs,
  total,
  page,
  pageSize,
  actions,
  currentAction,
  currentUserId,
}: {
  logs: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  actions: string[];
  currentAction?: string;
  currentUserId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalPages = Math.ceil(total / pageSize);

  function navigate(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    if (params.page) sp.set("page", params.page);
    if (params.action) sp.set("action", params.action);
    if (params.userId) sp.set("userId", params.userId);
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <Shield className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-slate-500 text-sm">{total.toLocaleString()} entries · tamper-evident record</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-slate-400 shrink-0" />
        <select
          value={currentAction ?? ""}
          onChange={(e) => navigate({ action: e.target.value || undefined, page: "1", userId: currentUserId })}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white min-w-50"
        >
          <option value="">All activity types</option>
          {actions.map((a) => {
            const m = ACTION_META[a] ?? getFallback(a);
            return <option key={a} value={a}>{m.label}</option>;
          })}
        </select>

        {(currentAction || currentUserId) && (
          <button
            onClick={() => navigate({ page: "1" })}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 transition"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
        </span>
      </div>

      {/* Log list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">No activity found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => {
              const meta = parseMeta(log.metadata);
              const am = ACTION_META[log.action] ?? getFallback(log.action);
              const Icon = am.icon;
              const actorName = log.user
                ? `${log.user.firstName} ${log.user.lastName}`
                : "The system";
              const sentence = am.describe(actorName, meta);
              const expanded = expandedId === log.id;
              const hasMeta = Object.keys(meta).length > 0;

              return (
                <div key={log.id} className="hover:bg-slate-50/60 transition">
                  <div className="flex items-start gap-3 px-5 py-3.5">
                    {/* Icon */}
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", am.color)}>
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      {/* Plain-English sentence */}
                      <p className="text-sm text-slate-800 leading-snug">{sentence}</p>

                      {/* Sub-line: role + email + time */}
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {log.user && (
                          <span className="text-xs text-slate-400">{roleLabel(log.user.role)} · {log.user.email}</span>
                        )}
                        {log.ipAddress && (
                          <span className="text-xs text-slate-300 font-mono">{log.ipAddress}</span>
                        )}
                      </div>
                    </div>

                    {/* Right: time + expand */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <p className="text-xs text-slate-500 whitespace-nowrap">
                        {format(new Date(log.timestamp), "d MMM yyyy, HH:mm")}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                      </p>
                      {hasMeta && (
                        <button
                          onClick={() => setExpandedId(expanded ? null : log.id)}
                          className="flex items-center gap-0.5 text-[10px] text-primary hover:underline mt-0.5"
                        >
                          {expanded ? "Hide" : "Details"}
                          <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
                        </button>
                      )}
                    </div>
                  </div>

                  {expanded && <MetaDetail meta={meta} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1 || isPending}
            onClick={() => navigate({ page: String(page - 1), action: currentAction, userId: currentUserId })}
            className="gap-1.5">
            <ChevronLeft className="w-4 h-4" /> Previous
          </Button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages || isPending}
            onClick={() => navigate({ page: String(page + 1), action: currentAction, userId: currentUserId })}
            className="gap-1.5">
            Next <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
