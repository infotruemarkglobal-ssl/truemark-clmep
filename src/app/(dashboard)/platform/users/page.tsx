import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Manage Users — TrueMark Platform" };

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  CERTIFICATION_OFFICER: "Cert. Officer",
  EXAMINER: "Examiner",
  TRAINER: "Trainer",
  PROCTOR: "Proctor",
  AUDITOR: "Auditor",
  ORG_MANAGER: "Org Manager",
  CANDIDATE: "Candidate",
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-red-50 text-red-700",
  CERTIFICATION_OFFICER: "bg-violet-50 text-violet-700",
  EXAMINER: "bg-blue-50 text-blue-700",
  TRAINER: "bg-sky-50 text-sky-700",
  PROCTOR: "bg-indigo-50 text-indigo-700",
  AUDITOR: "bg-orange-50 text-orange-700",
  ORG_MANAGER: "bg-amber-50 text-amber-700",
  CANDIDATE: "bg-slate-100 text-slate-600",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PENDING_VERIFICATION: "bg-amber-50 text-amber-700",
  SUSPENDED: "bg-red-50 text-red-700",
  INACTIVE: "bg-slate-100 text-slate-500",
};

async function getUsers() {
  const platformOrg = await db.organisation.findFirst({
    where: { isPlatformOwner: true },
    select: { id: true },
  });
  if (!platformOrg) return [];

  const members = await db.organisationMember.findMany({
    where: { organisationId: platformOrg.id },
    select: { userId: true },
    distinct: ["userId"],
  });
  const userIds = members.map((m) => m.userId);

  return db.user.findMany({
    where: { id: { in: userIds } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      _count: { select: { enrolments: true } },
    },
  });
}

export default async function PlatformUsersPage() {
  const users = await getUsers();

  const byRole = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">All Users</h1>
        <p className="text-sm text-slate-500 mt-1">TrueMark Global internal accounts · {users.length} total</p>
      </div>

      {/* Role breakdown */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(byRole).map(([role, count]) => (
          <span
            key={role}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[role] ?? "bg-slate-100 text-slate-600"}`}
          >
            {ROLE_LABELS[role] ?? role}
            <span className="font-bold">{count}</span>
          </span>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left font-medium text-slate-500">Name</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Email</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Role</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Status</th>
                <th className="px-5 py-3 text-right font-medium text-slate-500">Enrolments</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Last Login</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Joined</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">No users found.</td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-3 font-medium text-slate-800 whitespace-nowrap">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="px-5 py-3 text-slate-600 truncate max-w-xs">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[u.role] ?? "bg-slate-100 text-slate-600"}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[u.status] ?? "bg-slate-100 text-slate-500"}`}>
                      {u.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{u._count.enrolments}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-GB") : "Never"}
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {u.createdAt.toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/staff`} className="text-xs text-primary hover:underline">
                      View
                    </Link>
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
