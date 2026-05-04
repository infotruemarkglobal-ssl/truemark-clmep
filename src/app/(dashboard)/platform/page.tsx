import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Building2, Users, CreditCard, BookOpen, TrendingUp, ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Platform Overview — TrueMark Global" };

async function getPlatformStats() {
  const [
    totalOrgs,
    activeOrgs,
    totalUsers,
    activeUsers,
    totalEnrolments,
    completedEnrolments,
    totalPayments,
    revenueResult,
    pendingOrgs,
  ] = await Promise.all([
    db.organisation.count({ where: { isPlatformOwner: false } }),
    db.organisation.count({ where: { isPlatformOwner: false, isActive: true } }),
    db.user.count(),
    db.user.count({ where: { status: "ACTIVE" } }),
    db.enrolment.count(),
    db.enrolment.count({ where: { status: "COMPLETED" } }),
    db.purchase.count({ where: { status: "COMPLETED" } }),
    db.purchase.aggregate({ where: { status: "COMPLETED" }, _sum: { amount: true } }),
    db.organisation.count({ where: { isPlatformOwner: false, verificationStatus: "PENDING" } }),
  ]);

  return {
    totalOrgs,
    activeOrgs,
    totalUsers,
    activeUsers,
    totalEnrolments,
    completedEnrolments,
    totalPayments,
    totalRevenue: revenueResult._sum.amount ?? 0,
    pendingOrgs,
  };
}

async function getRecentOrgs() {
  return db.organisation.findMany({
    where: { isPlatformOwner: false },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, name: true, country: true, verificationStatus: true, isActive: true, createdAt: true },
  });
}

async function getRecentPayments() {
  return db.purchase.findMany({
    where: { status: "COMPLETED" },
    orderBy: { paidAt: "desc" },
    take: 5,
    select: {
      id: true,
      amount: true,
      currency: true,
      description: true,
      paidAt: true,
      userId: true,
      organisationId: true,
    },
  });
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${accent ?? "bg-slate-100"}`}>
        <Icon className="w-5 h-5 text-slate-700" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    VERIFIED: "bg-emerald-50 text-emerald-700",
    PENDING: "bg-amber-50 text-amber-700",
    REJECTED: "bg-red-50 text-red-700",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}

export default async function PlatformOverviewPage() {
  const [stats, recentOrgs, recentPayments] = await Promise.all([
    getPlatformStats(),
    getRecentOrgs(),
    getRecentPayments(),
  ]);

  const completionRate = stats.totalEnrolments > 0
    ? Math.round((stats.completedEnrolments / stats.totalEnrolments) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform Overview</h1>
        <p className="text-sm text-slate-500 mt-1">TrueMark Global — real-time platform metrics</p>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard
          label="Client Organisations"
          value={stats.totalOrgs}
          sub={`${stats.activeOrgs} active · ${stats.pendingOrgs} pending verification`}
          icon={Building2}
          accent="bg-blue-50"
        />
        <StatCard
          label="Platform Users"
          value={stats.totalUsers.toLocaleString()}
          sub={`${stats.activeUsers.toLocaleString()} active accounts`}
          icon={Users}
          accent="bg-violet-50"
        />
        <StatCard
          label="Total Revenue"
          value={`₦${stats.totalRevenue.toLocaleString()}`}
          sub={`${stats.totalPayments} completed payments`}
          icon={CreditCard}
          accent="bg-emerald-50"
        />
        <StatCard
          label="Course Enrolments"
          value={stats.totalEnrolments.toLocaleString()}
          sub={`${stats.completedEnrolments} completed`}
          icon={BookOpen}
          accent="bg-amber-50"
        />
        <StatCard
          label="Completion Rate"
          value={`${completionRate}%`}
          sub="across all enrolments"
          icon={TrendingUp}
          accent="bg-sky-50"
        />
        <StatCard
          label="Pending Verifications"
          value={stats.pendingOrgs}
          sub="organisations awaiting review"
          icon={ShieldCheck}
          accent={stats.pendingOrgs > 0 ? "bg-amber-50" : "bg-slate-100"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent organisations */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Recent Organisations</h2>
            <a href="/platform/organisations" className="text-xs text-primary hover:underline">
              View all
            </a>
          </div>
          <div className="divide-y divide-slate-100">
            {recentOrgs.length === 0 && (
              <p className="px-5 py-4 text-sm text-slate-400">No organisations yet.</p>
            )}
            {recentOrgs.map((org) => (
              <div key={org.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{org.name}</p>
                  <p className="text-xs text-slate-400">{org.country ?? "—"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={org.verificationStatus} />
                  {!org.isActive && (
                    <span className="text-xs text-slate-400">Inactive</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent payments */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Recent Payments</h2>
            <a href="/platform/payments" className="text-xs text-primary hover:underline">
              View all
            </a>
          </div>
          <div className="divide-y divide-slate-100">
            {recentPayments.length === 0 && (
              <p className="px-5 py-4 text-sm text-slate-400">No payments yet.</p>
            )}
            {recentPayments.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {p.description ?? (p.organisationId ? "Organisation purchase" : "Individual purchase")}
                  </p>
                  <p className="text-xs text-slate-400">
                    {p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-GB") : "—"}
                  </p>
                </div>
                <span className="text-sm font-semibold text-slate-700 shrink-0 tabular-nums">
                  {p.currency} {p.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
