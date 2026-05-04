import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { Building2, CheckCircle2, Clock, XCircle, Users } from "lucide-react";

export const metadata: Metadata = { title: "Manage Organisations — TrueMark Platform" };

async function getOrganisations() {
  return db.organisation.findMany({
    where: { isPlatformOwner: false },
    include: {
      _count: { select: { members: true, enrolments: true, purchases: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

function VerificationBadge({ status }: { status: string }) {
  if (status === "VERIFIED") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">
      <CheckCircle2 className="w-3 h-3" /> Verified
    </span>
  );
  if (status === "PENDING") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
      <XCircle className="w-3 h-3" /> Rejected
    </span>
  );
}

export default async function PlatformOrganisationsPage() {
  const orgs = await getOrganisations();

  const verified = orgs.filter((o) => o.verificationStatus === "VERIFIED").length;
  const pending = orgs.filter((o) => o.verificationStatus === "PENDING").length;
  const inactive = orgs.filter((o) => !o.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client Organisations</h1>
          <p className="text-sm text-slate-500 mt-1">
            {orgs.length} total · {verified} verified · {pending} pending · {inactive} inactive
          </p>
        </div>
        <Link
          href="/organisations/new"
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition shrink-0"
        >
          + New Organisation
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Verified", value: verified, color: "text-emerald-700 bg-emerald-50" },
          { label: "Pending", value: pending, color: "text-amber-700 bg-amber-50" },
          { label: "Inactive", value: inactive, color: "text-slate-600 bg-slate-100" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
            <p className="text-2xl font-bold tabular-nums">{s.value}</p>
            <p className="text-xs font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left font-medium text-slate-500">Organisation</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Country</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Status</th>
                <th className="px-5 py-3 text-right font-medium text-slate-500">Members</th>
                <th className="px-5 py-3 text-right font-medium text-slate-500">Enrolments</th>
                <th className="px-5 py-3 text-right font-medium text-slate-500">Purchases</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Joined</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    No client organisations yet.
                  </td>
                </tr>
              )}
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <div>
                        <p className="font-medium text-slate-800">{org.name}</p>
                        {org.registrationNo && (
                          <p className="text-xs text-slate-400">{org.registrationNo}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{org.country ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col gap-1">
                      <VerificationBadge status={org.verificationStatus} />
                      {!org.isActive && (
                        <span className="text-xs text-slate-400">Inactive</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    <span className="flex items-center justify-end gap-1">
                      <Users className="w-3 h-3 text-slate-400" />
                      {org._count.members}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{org._count.enrolments}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{org._count.purchases}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {org.createdAt.toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/organisations/${org.id}`}
                      className="text-xs text-primary hover:underline"
                    >
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
