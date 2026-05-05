import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cacheQuery, CACHE_TAGS } from "@/lib/cache";
import Link from "next/link";
import {
  Users, Award, FileText, AlertTriangle, TrendingUp,
  Clock, ChevronRight, BookOpen, ClipboardList, Package,
  BarChart3, ShieldCheck, FolderOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import type { UserRole } from "@/lib/constants";

type QuickAction = {
  label: string;
  href: string;
  icon: React.ElementType;
  color: string;
};

type StatCard = {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bg: string;
};

export default async function AdminDashboard({ role }: { role: UserRole }) {
  const session = await auth();
  const firstName = session!.user.name?.split(" ")[0] ?? "there";

  // ── Fetch only the data relevant to this role ─────────────────────────────
  const isAdminish = role === "SUPER_ADMIN" || role === "CERTIFICATION_OFFICER";
  const isAuditor = role === "AUDITOR";
  const isExaminer = role === "EXAMINER";
  const isTrainer = role === "TRAINER";
  const isProctor = role === "PROCTOR";
  const showAuditLog = isAdminish || isAuditor;

  const [
    totalUsers,
    activeCerts,
    pendingDecisions,
    openAppeals,
    activeCourses,
    pendingExamPapers,
    activeExamSessions,
  ] = await Promise.all([
    isAdminish
      ? cacheQuery(() => db.user.count({ where: { status: "ACTIVE" } }), [`admin-dash-users-${role}`], [CACHE_TAGS.user], 30)
      : Promise.resolve(0),
    (isAdminish || isAuditor)
      ? cacheQuery(() => db.certificate.count({ where: { status: "ACTIVE" } }), [`admin-dash-certs-${role}`], [CACHE_TAGS.certificate], 30)
      : Promise.resolve(0),
    isAdminish
      ? cacheQuery(() => db.certificationDecision.count({ where: { decision: "referred" } }), [`admin-dash-decisions-${role}`], [CACHE_TAGS.certificate], 30)
      : Promise.resolve(0),
    (isAdminish || isAuditor)
      ? cacheQuery(() => db.appeal.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }), [`admin-dash-appeals-${role}`], [CACHE_TAGS.compliance], 30)
      : Promise.resolve(0),
    (isTrainer || isAdminish)
      ? cacheQuery(() => db.course.count({ where: { status: "PUBLISHED" } }), [`admin-dash-courses-${role}`], [CACHE_TAGS.course], 30)
      : Promise.resolve(0),
    isExaminer
      ? cacheQuery(() => db.examPaper.count({ where: { isActive: true } }), [`admin-dash-exams-${role}`], [CACHE_TAGS.exam], 30)
      : Promise.resolve(0),
    isProctor
      ? cacheQuery(() => db.proctoringSession.count({ where: { status: "active" } }), [`admin-dash-proctoring-${role}`], [CACHE_TAGS.exam], 30)
      : isExaminer
      ? cacheQuery(() => db.examAttempt.count({ where: { status: "IN_PROGRESS" } }), [`admin-dash-attempts-${role}`], [CACHE_TAGS.exam], 30)
      : Promise.resolve(0),
  ]);

  type AuditLogWithUser = {
    id: string;
    action: string;
    timestamp: Date;
    user: { firstName: string; lastName: string; role: string } | null;
  };
  const recentAuditLogs: AuditLogWithUser[] = showAuditLog
    ? (await db.auditLog.findMany({
        include: { user: { select: { firstName: true, lastName: true, role: true } } },
        orderBy: { timestamp: "desc" },
        take: 8,
      })) as AuditLogWithUser[]
    : [];

  // ── Role-specific stat cards ───────────────────────────────────────────────
  let stats: StatCard[] = [];

  if (isAdminish) {
    stats = [
      { label: "Active Users", value: totalUsers, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
      { label: "Active Certificates", value: activeCerts, icon: Award, color: "text-emerald-600", bg: "bg-emerald-50" },
      { label: "Pending Decisions", value: pendingDecisions, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
      { label: "Open Appeals", value: openAppeals, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
    ];
  } else if (isAuditor) {
    stats = [
      { label: "Active Certificates", value: activeCerts, icon: Award, color: "text-emerald-600", bg: "bg-emerald-50" },
      { label: "Open Appeals", value: openAppeals, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
    ];
  } else if (isExaminer) {
    stats = [
      { label: "Active Exam Papers", value: pendingExamPapers, icon: ClipboardList, color: "text-blue-600", bg: "bg-blue-50" },
      { label: "In-Progress Attempts", value: activeExamSessions, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    ];
  } else if (isTrainer) {
    stats = [
      { label: "Published Courses", value: activeCourses, icon: BookOpen, color: "text-emerald-600", bg: "bg-emerald-50" },
    ];
  } else if (isProctor) {
    stats = [
      { label: "Active Proctoring Sessions", value: activeExamSessions, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    ];
  }

  // ── Role-specific quick actions ────────────────────────────────────────────
  let quickActions: QuickAction[] = [];

  if (role === "SUPER_ADMIN") {
    quickActions = [
      { label: "Review Pending Decisions", href: "/manage/decisions", icon: FileText, color: "bg-amber-50 text-amber-700 border-amber-200" },
      { label: "View Open Appeals", href: "/appeals", icon: AlertTriangle, color: "bg-red-50 text-red-700 border-red-200" },
      { label: "Manage Users", href: "/staff", icon: Users, color: "bg-blue-50 text-blue-700 border-blue-200" },
      { label: "Generate Report", href: "/reports", icon: TrendingUp, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    ];
  } else if (role === "CERTIFICATION_OFFICER") {
    quickActions = [
      { label: "Review Pending Decisions", href: "/manage/decisions", icon: FileText, color: "bg-amber-50 text-amber-700 border-amber-200" },
      { label: "View Open Appeals", href: "/appeals", icon: AlertTriangle, color: "bg-red-50 text-red-700 border-red-200" },
      { label: "Manage Courses", href: "/manage/courses", icon: BookOpen, color: "bg-blue-50 text-blue-700 border-blue-200" },
      { label: "Generate Report", href: "/reports", icon: TrendingUp, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    ];
  } else if (role === "EXAMINER") {
    quickActions = [
      { label: "Exam Papers", href: "/manage/exams", icon: ClipboardList, color: "bg-blue-50 text-blue-700 border-blue-200" },
      { label: "Exam Sessions", href: "/exams", icon: FileText, color: "bg-amber-50 text-amber-700 border-amber-200" },
      { label: "Documents", href: "/documents", icon: FolderOpen, color: "bg-slate-50 text-slate-700 border-slate-200" },
    ];
  } else if (role === "TRAINER") {
    quickActions = [
      { label: "Course Builder", href: "/manage/courses", icon: BookOpen, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
      { label: "SCORM Packages", href: "/manage/scorm", icon: Package, color: "bg-blue-50 text-blue-700 border-blue-200" },
      { label: "Documents", href: "/documents", icon: FolderOpen, color: "bg-slate-50 text-slate-700 border-slate-200" },
    ];
  } else if (role === "PROCTOR") {
    quickActions = [
      { label: "Exam Sessions", href: "/exams", icon: FileText, color: "bg-amber-50 text-amber-700 border-amber-200" },
    ];
  } else if (role === "AUDITOR") {
    quickActions = [
      { label: "Reports", href: "/reports", icon: BarChart3, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
      { label: "Compliance", href: "/compliance", icon: ShieldCheck, color: "bg-blue-50 text-blue-700 border-blue-200" },
      { label: "Certificates", href: "/certificates", icon: Award, color: "bg-amber-50 text-amber-700 border-amber-200" },
      { label: "Documents", href: "/documents", icon: FolderOpen, color: "bg-slate-50 text-slate-700 border-slate-200" },
    ];
  }

  // ── Role descriptions ──────────────────────────────────────────────────────
  const roleSubtitles: Partial<Record<UserRole, string>> = {
    SUPER_ADMIN: "Platform overview and pending actions.",
    CERTIFICATION_OFFICER: "Certification decisions and platform overview.",
    EXAMINER: "Your exam papers and upcoming sessions.",
    TRAINER: "Your courses and content library.",
    PROCTOR: "Exam sessions assigned for proctoring.",
    AUDITOR: "Compliance reports and audit activity.",
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Good day, {firstName}</h1>
        <p className="text-slate-500 mt-1">{roleSubtitles[role] ?? "Welcome to your dashboard."}</p>
      </div>

      {/* Stats */}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className={showAuditLog ? "grid lg:grid-cols-2 gap-6" : ""}>
        {/* Recent audit log — admins and auditors only */}
        {showAuditLog && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Recent Audit Activity</CardTitle>
                <Link href="/audit" className="text-xs text-primary flex items-center gap-1 hover:underline">
                  Full log <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentAuditLogs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No recent activity.</p>
              ) : (
                recentAuditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs py-1.5 border-b border-slate-50 last:border-0">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-slate-700">{log.action}</span>
                      {log.user && (
                        <span className="text-slate-400 ml-1">
                          — {log.user.firstName} {log.user.lastName}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 shrink-0">
                      {formatDistanceToNow(log.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick actions */}
        {quickActions.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {quickActions.map(({ label, href, icon: Icon, color }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition hover:opacity-80 ${color}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-xs leading-tight">{label}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
