import type { Metadata } from "next";
import { db } from "@/lib/db";
import { BookOpen, Users, UserCheck, Building2 } from "lucide-react";

export const metadata: Metadata = { title: "Registrations — TrueMark Platform" };

async function getRegistrationStats() {
  const [total, selfEnrolled, orgAssigned, completed] = await Promise.all([
    db.enrolment.count(),
    db.enrolment.count({ where: { registrationSource: "SELF" } }),
    db.enrolment.count({ where: { registrationSource: "ORG_ASSIGNED" } }),
    db.enrolment.count({ where: { status: "COMPLETED" } }),
  ]);
  return { total, selfEnrolled, orgAssigned, completed };
}

async function getEnrolments() {
  return db.enrolment.findMany({
    orderBy: { enroledAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      progress: true,
      registrationSource: true,
      enroledAt: true,
      completedAt: true,
      user: { select: { firstName: true, lastName: true, email: true } },
      course: { select: { title: true, slug: true } },
      organisation: { select: { name: true } },
    },
  });
}

const SOURCE_LABELS: Record<string, string> = {
  SELF: "Self",
  ORG_ASSIGNED: "Org Assigned",
};

const SOURCE_COLORS: Record<string, string> = {
  SELF: "bg-blue-50 text-blue-700",
  ORG_ASSIGNED: "bg-violet-50 text-violet-700",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  COMPLETED: "bg-slate-100 text-slate-600",
  EXPIRED: "bg-red-50 text-red-700",
  CANCELLED: "bg-red-50 text-red-600",
};

export default async function PlatformRegistrationsPage() {
  const [stats, enrolments] = await Promise.all([getRegistrationStats(), getEnrolments()]);

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Course Registrations</h1>
        <p className="text-sm text-slate-500 mt-1">All enrolments across the platform</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Enrolments", value: stats.total, icon: BookOpen, color: "bg-blue-50" },
          { label: "Self-Enrolled", value: stats.selfEnrolled, icon: UserCheck, color: "bg-sky-50" },
          { label: "Org Assigned", value: stats.orgAssigned, icon: Building2, color: "bg-violet-50" },
          { label: `Completed (${completionRate}%)`, value: stats.completed, icon: Users, color: "bg-emerald-50" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${s.color}`}>
              <s.icon className="w-4 h-4 text-slate-700" />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left font-medium text-slate-500">Candidate</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Course</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Source</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Organisation</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Status</th>
                <th className="px-5 py-3 text-right font-medium text-slate-500">Progress</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Enrolled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrolments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">No enrolments yet.</td>
                </tr>
              )}
              {enrolments.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800 whitespace-nowrap">
                      {e.user.firstName} {e.user.lastName}
                    </p>
                    <p className="text-xs text-slate-400 truncate max-w-[160px]">{e.user.email}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-700 max-w-[200px] truncate">
                    {e.course.title}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS[e.registrationSource] ?? "bg-slate-100 text-slate-600"}`}>
                      {SOURCE_LABELS[e.registrationSource] ?? e.registrationSource}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600 text-xs">
                    {e.organisation?.name ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[e.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {Math.round(e.progress)}%
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {e.enroledAt.toLocaleDateString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
