"use client";

import { Award, Users, BookOpen, FileText, TrendingUp, BarChart3, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Stats = {
  totalUsers: number;
  newUsersLast30: number;
  totalEnrolments: number;
  activeEnrolments: number;
  completedEnrolments: number;
  totalAttempts: number;
  passedAttempts: number;
  passRate: number;
  totalCerts: number;
  activeCerts: number;
  expiredCerts: number;
  revokedCerts: number;
  suspendedCerts: number;
  pendingCPD: number;
};

type SchemeStats = {
  id: string;
  name: string;
  code: string;
  certificates: number;
  examPapers: number;
};

type MonthlyData = { month: string; count: number };

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-600 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ReportsPage({
  stats,
  schemeStats,
  monthlyEnrolments,
}: {
  stats: Stats;
  schemeStats: SchemeStats[];
  monthlyEnrolments: MonthlyData[];
}) {
  const maxMonthly = Math.max(...monthlyEnrolments.map((m) => m.count), 1);

  function formatMonth(key: string) {
    const [year, month] = key.split("-");
    const d = new Date(Number(year), Number(month) - 1);
    return d.toLocaleString("default", { month: "short", year: "2-digit" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports &amp; Analytics</h1>
        <p className="text-slate-500 text-sm mt-1">Platform-wide performance overview</p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Users" value={stats.totalUsers} sub={`+${stats.newUsersLast30} last 30 days`} icon={Users} color="bg-blue-100 text-blue-600" />
        <StatCard label="Total Enrolments" value={stats.totalEnrolments} sub={`${stats.activeEnrolments} active, ${stats.completedEnrolments} completed`} icon={BookOpen} color="bg-primary/10 text-primary" />
        <StatCard label="Certificates Issued" value={stats.totalCerts} sub={`${stats.activeCerts} active, ${stats.expiredCerts} expired, ${stats.revokedCerts} revoked`} icon={Award} color="bg-emerald-100 text-emerald-600" />
        <StatCard label="Exam Pass Rate" value={`${stats.passRate}%`} sub={`${stats.passedAttempts} of ${stats.totalAttempts} attempts`} icon={TrendingUp} color="bg-amber-100 text-amber-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly enrolments chart */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-5 h-5 text-slate-400" />
            <h2 className="font-semibold text-slate-900">Enrolments — Last 6 Months</h2>
          </div>
          {monthlyEnrolments.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No enrolment data</p>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {monthlyEnrolments.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-slate-500 font-medium">{m.count}</span>
                  <div
                    className="w-full bg-primary rounded-t-md transition-all"
                    style={{ height: `${Math.max(4, (m.count / maxMonthly) * 120)}px` }}
                  />
                  <span className="text-[10px] text-slate-400">{formatMonth(m.month)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CPD & Status snapshot */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Quick Status</h2>
          <div className="space-y-4">
            {[
              { label: "Active Certificates", value: stats.activeCerts, total: stats.totalCerts, color: "bg-emerald-500", icon: CheckCircle2, iconColor: "text-emerald-600" },
              { label: "Active Enrolments", value: stats.activeEnrolments, total: stats.totalEnrolments, color: "bg-primary", icon: BookOpen, iconColor: "text-primary" },
              { label: "Pending CPD Reviews", value: stats.pendingCPD, total: stats.pendingCPD + 1, color: "bg-amber-400", icon: Clock, iconColor: "text-amber-600" },
              { label: "Expired Certificates", value: stats.expiredCerts, total: stats.totalCerts, color: "bg-red-400", icon: AlertCircle, iconColor: "text-red-600" },
              { label: "Revoked / Suspended", value: stats.revokedCerts + stats.suspendedCerts, total: stats.totalCerts, color: "bg-slate-400", icon: AlertCircle, iconColor: "text-slate-600" },
            ].map(({ label, value, total, color, icon: Icon, iconColor }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className={cn("w-4 h-4", iconColor)} />
                    <span className="text-slate-700">{label}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{value}</span>
                </div>
                <Progress value={total > 0 ? Math.min(100, (value / total) * 100) : 0} className={cn("h-1.5", color)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scheme breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-900">Certification Schemes</h2>
        </div>
        {schemeStats.length === 0 ? (
          <p className="p-8 text-center text-slate-400">No schemes found</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {schemeStats.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                <Badge className="bg-primary/10 text-primary border-0 shrink-0">{s.code}</Badge>
                <p className="flex-1 text-sm font-medium text-slate-800 min-w-0 truncate">{s.name}</p>
                <div className="flex gap-6 text-sm text-right shrink-0">
                  <div>
                    <p className="font-semibold text-slate-900">{s.certificates}</p>
                    <p className="text-xs text-slate-400">certificates</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{s.examPapers}</p>
                    <p className="text-xs text-slate-400">exam papers</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
