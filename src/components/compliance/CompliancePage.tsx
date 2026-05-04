"use client";

import { format } from "date-fns";
import { ShieldCheck, FileText, Award, Scale, Users, AlertCircle, CheckCircle2, Clock, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Metrics = {
  activeSchemes: number;
  activeExamPapers: number;
  totalCerts: number;
  openAppeals: number;
  totalCOI: number;
  openDSR: number;
};

type AuditEntry = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string } | null;
};

const ISO_CLAUSES = [
  { clause: "4.1", title: "Impartiality", description: "Certification body manages impartiality and conflicts of interest", check: (m: Metrics) => m.totalCOI > 0, metric: (m: Metrics) => `${m.totalCOI} COI declarations` },
  { clause: "5.1", title: "Competence & Qualification", description: "Examiners and assessors are qualified", check: () => true, metric: () => "Managed via staff roles" },
  { clause: "6.1", title: "Certification Scheme", description: "Active certification schemes with documented requirements", check: (m: Metrics) => m.activeSchemes > 0, metric: (m: Metrics) => `${m.activeSchemes} active schemes` },
  { clause: "6.2", title: "Examination Process", description: "Active exam papers with marking schemes", check: (m: Metrics) => m.activeExamPapers > 0, metric: (m: Metrics) => `${m.activeExamPapers} active papers` },
  { clause: "6.3", title: "Certificate Issuance", description: "Certificates issued and tracked", check: (m: Metrics) => m.totalCerts >= 0, metric: (m: Metrics) => `${m.totalCerts} certificates issued` },
  { clause: "7.1", title: "Appeals & Complaints", description: "Appeals process in place", check: () => true, metric: (m: Metrics) => `${m.openAppeals} open appeals` },
  { clause: "8.1", title: "Records Management", description: "Immutable audit log maintained", check: () => true, metric: () => "Audit log active" },
  { clause: "8.2", title: "Data Protection (GDPR)", description: "Data subject requests tracked", check: (m: Metrics) => m.openDSR === 0, metric: (m: Metrics) => `${m.openDSR} pending DSR` },
];

const ACTION_COLOR: Record<string, string> = {
  USER_CREATED: "bg-emerald-100 text-emerald-700",
  USER_UPDATED: "bg-blue-100 text-blue-700",
  CERTIFICATE_ISSUED: "bg-primary/10 text-primary",
  APPEAL_SUBMITTED: "bg-amber-100 text-amber-700",
  APPEAL_UPDATED: "bg-amber-100 text-amber-700",
  EXAM_STARTED: "bg-blue-100 text-blue-700",
  EXAM_SUBMITTED: "bg-slate-100 text-slate-600",
  CPD_ACTIVITY_LOGGED: "bg-purple-100 text-purple-700",
};

export default function CompliancePage({
  metrics,
  recentAudits,
}: {
  metrics: Metrics;
  recentAudits: AuditEntry[];
}) {
  const passing = ISO_CLAUSES.filter((c) => c.check(metrics)).length;
  const pct = Math.round((passing / ISO_CLAUSES.length) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ISO 17024 Compliance</h1>
          <p className="text-slate-500 text-sm mt-1">Certification body compliance monitoring</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-primary">{pct}%</p>
          <p className="text-xs text-slate-500">compliance score</p>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: "Active Schemes", value: metrics.activeSchemes, icon: FileText, color: "text-primary" },
          { label: "Exam Papers", value: metrics.activeExamPapers, icon: Database, color: "text-blue-600" },
          { label: "Certificates", value: metrics.totalCerts, icon: Award, color: "text-emerald-600" },
          { label: "Open Appeals", value: metrics.openAppeals, icon: Scale, color: metrics.openAppeals > 5 ? "text-red-600" : "text-amber-600" },
          { label: "COI Declarations", value: metrics.totalCOI, icon: Users, color: "text-slate-700" },
          { label: "Pending DSR", value: metrics.openDSR, icon: AlertCircle, color: metrics.openDSR > 0 ? "text-amber-600" : "text-emerald-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
            <Icon className={cn("w-5 h-5 mx-auto mb-1", color)} />
            <p className={cn("text-xl font-bold", color)}>{value}</p>
            <p className="text-[11px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* ISO Clauses */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-slate-900">ISO 17024 Clause Status</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {ISO_CLAUSES.map((clause) => {
            const ok = clause.check(metrics);
            return (
              <div key={clause.clause} className="flex items-start gap-4 px-4 py-3">
                {ok ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">{clause.clause}</span>
                    <span className="font-semibold text-slate-900 text-sm">{clause.title}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{clause.description}</p>
                </div>
                <Badge className={cn("shrink-0 border-0 text-xs", ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                  {clause.metric(metrics)}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>

      {/* Audit trail */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-400" />
          <h2 className="font-semibold text-slate-900">Recent Audit Trail</h2>
        </div>
        {recentAudits.length === 0 ? (
          <p className="p-8 text-center text-slate-400">No audit entries</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentAudits.map((entry) => {
              const colorClass = ACTION_COLOR[entry.action] ?? "bg-slate-100 text-slate-600";
              return (
                <div key={entry.id} className="flex items-center gap-4 px-4 py-3">
                  <Badge className={cn("shrink-0 border-0 text-[10px]", colorClass)}>
                    {entry.action.replace(/_/g, " ")}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    {entry.entityType && (
                      <p className="text-xs text-slate-500 truncate">
                        {entry.entityType} {entry.entityId ? `· ${entry.entityId.slice(0, 8)}…` : ""}
                      </p>
                    )}
                    {entry.user && (
                      <p className="text-xs text-slate-400 truncate">
                        {entry.user.firstName} {entry.user.lastName}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 shrink-0">
                    {format(new Date(entry.createdAt), "d MMM HH:mm")}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
