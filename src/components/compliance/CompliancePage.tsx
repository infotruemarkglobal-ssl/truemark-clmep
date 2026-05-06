"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ShieldCheck, FileText, Award, Scale, Users, AlertCircle, CheckCircle2,
  Clock, Database, RefreshCw, ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Metrics = {
  activeSchemes: number;
  activeExamPapers: number;
  totalCerts: number;
  openAppeals: number;
  totalCOI: number;
  openDSR: number;
  openNonConformities: number;
  overdueActions: number;
  expiringCerts: number;
};

type AuditEntry = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string } | null;
};

type ClauseStatus = "green" | "amber" | "red";

type Remediation = {
  text: string;
  href: string;
  linkText: string;
};

const ISO_CLAUSES: Array<{
  clause: string;
  title: string;
  description: string;
  status: (m: Metrics) => ClauseStatus;
  metric: (m: Metrics) => string;
  remediation: (m: Metrics, s: ClauseStatus) => Remediation | null;
}> = [
  {
    clause: "4.1",
    title: "Impartiality",
    description: "Certification body manages impartiality and conflicts of interest",
    status: (m) => (m.totalCOI > 0 ? "green" : "amber"),
    metric: (m) => `${m.totalCOI} COI declarations`,
    remediation: (_m, s) =>
      s !== "green"
        ? {
            text: "Conflict of interest declarations are below recommended levels. All examiners and certification officers should have active declarations on file.",
            href: "/staff",
            linkText: "Manage staff declarations",
          }
        : null,
  },
  {
    clause: "5.1",
    title: "Competence & Qualification",
    description: "Examiners and assessors are qualified",
    status: () => "green",
    metric: () => "Managed via staff roles",
    remediation: () => null,
  },
  {
    clause: "6.1",
    title: "Certification Scheme",
    description: "Active certification schemes with documented requirements",
    status: (m) => (m.activeSchemes > 0 ? "green" : "red"),
    metric: (m) => `${m.activeSchemes} active schemes`,
    remediation: (_m, s) =>
      s !== "green"
        ? {
            text: "No active certification schemes. Create at least one scheme before accepting candidates.",
            href: "/settings",
            linkText: "Create certification scheme",
          }
        : null,
  },
  {
    clause: "6.2",
    title: "Examination Process",
    description: "Active exam papers with marking schemes",
    status: (m) => (m.activeExamPapers > 0 ? "green" : "red"),
    metric: (m) => `${m.activeExamPapers} active papers`,
    remediation: (_m, s) =>
      s !== "green"
        ? {
            text: "No active exam papers. Examiners must create and publish exam papers before candidates can sit assessments.",
            href: "/manage/exams",
            linkText: "Manage exam papers",
          }
        : null,
  },
  {
    clause: "6.3",
    title: "Certificate Issuance",
    description: "Certificates issued and tracked",
    status: (m) => (m.totalCerts > 0 ? "green" : "red"),
    metric: (m) => `${m.totalCerts} certificates issued`,
    remediation: (_m, s) =>
      s !== "green"
        ? {
            text: "No active certificates issued. Verify the certification decision workflow is configured correctly.",
            href: "/manage/decisions",
            linkText: "Review certification workflow",
          }
        : null,
  },
  {
    clause: "7.1",
    title: "Appeals & Complaints",
    description: "Appeals process in place — 28-day SLA per ISO 17024 Cl.7.9",
    status: (m) => (m.openAppeals > 5 ? "red" : m.openAppeals > 0 ? "amber" : "green"),
    metric: (m) => `${m.openAppeals} open appeals`,
    remediation: (m, s) => {
      if (s === "red")
        return {
          text: `${m.openAppeals} appeals have exceeded or are approaching the 28-day ISO 17024 Cl.7.9 SLA. Review and assign officers immediately.`,
          href: "/manage/decisions",
          linkText: "Review appeals",
        };
      if (s === "amber")
        return {
          text: `${m.openAppeals} appeal${m.openAppeals !== 1 ? "s" : ""} pending. Ensure each has an assigned officer and expected resolution date.`,
          href: "/appeals",
          linkText: "View appeals",
        };
      return null;
    },
  },
  {
    clause: "8.1",
    title: "Records Management",
    description: "Immutable audit log maintained",
    status: () => "green",
    metric: () => "Audit log active",
    remediation: () => null,
  },
  {
    clause: "8.2",
    title: "Data Protection (GDPR)",
    description: "Data subject requests tracked and responded to within 45 days",
    status: (m) => (m.openDSR === 0 ? "green" : "red"),
    metric: (m) => `${m.openDSR} pending DSR`,
    remediation: (m, s) =>
      s !== "green"
        ? {
            text: `${m.openDSR} data subject request${m.openDSR !== 1 ? "s are" : " is"} pending. GDPR Art.15–22 requires response within 45 days.`,
            href: "/gdpr/dsr",
            linkText: "Review data requests",
          }
        : null,
  },
  {
    clause: "8.3",
    title: "Nonconformity Management",
    description: "Open nonconformities have corrective actions assigned and tracked",
    status: (m) =>
      m.openNonConformities > 2 ? "red" : m.openNonConformities > 0 ? "amber" : "green",
    metric: (m) => `${m.openNonConformities} open nonconformit${m.openNonConformities !== 1 ? "ies" : "y"}`,
    remediation: (m, s) => {
      if (s === "red")
        return {
          text: `${m.openNonConformities} open nonconformities require corrective action. Review at /manage/nonconformities`,
          href: "/manage/nonconformities",
          linkText: "Manage nonconformities",
        };
      if (s === "amber")
        return {
          text: `${m.openNonConformities} open nonconformit${m.openNonConformities !== 1 ? "ies" : "y"} require corrective action. Review at /manage/nonconformities`,
          href: "/manage/nonconformities",
          linkText: "Review nonconformities",
        };
      return null;
    },
  },
  {
    clause: "8.4",
    title: "Corrective Action Timeliness",
    description: "Corrective actions completed by their due date",
    status: (m) => (m.overdueActions > 0 ? "red" : "green"),
    metric: (m) => `${m.overdueActions} overdue action${m.overdueActions !== 1 ? "s" : ""}`,
    remediation: (m, s) =>
      s !== "green"
        ? {
            text: `${m.overdueActions} corrective action${m.overdueActions !== 1 ? "s are" : " is"} past their due date. Review at /manage/nonconformities`,
            href: "/manage/nonconformities",
            linkText: "Review overdue actions",
          }
        : null,
  },
  {
    clause: "6.7",
    title: "Certificate Expiry Management",
    description: "Active certificates expiring within 90 days are flagged for renewal",
    status: (m) =>
      m.expiringCerts > 5 ? "red" : m.expiringCerts > 0 ? "amber" : "green",
    metric: (m) => `${m.expiringCerts} expiring within 90 days`,
    remediation: (m, s) => {
      if (s === "red")
        return {
          text: `${m.expiringCerts} certificates expire within 90 days. Contact holders to begin renewal at /manage/certificates`,
          href: "/manage/certificates",
          linkText: "Manage certificates",
        };
      if (s === "amber")
        return {
          text: `${m.expiringCerts} certificate${m.expiringCerts !== 1 ? "s" : ""} expire within 90 days. Contact holders to begin renewal at /manage/certificates`,
          href: "/manage/certificates",
          linkText: "Review expiring certificates",
        };
      return null;
    },
  },
];

const STATUS_ICON = {
  green: CheckCircle2,
  amber: AlertCircle,
  red: AlertCircle,
} as const;

const STATUS_ICON_COLOR = {
  green: "text-emerald-500",
  amber: "text-amber-500",
  red: "text-red-500",
} as const;

const STATUS_BADGE_COLOR = {
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
} as const;

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
  checkedAt,
}: {
  metrics: Metrics;
  recentAudits: AuditEntry[];
  checkedAt: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const passing = ISO_CLAUSES.filter((c) => c.status(metrics) === "green").length;
  const pct = Math.round((passing / ISO_CLAUSES.length) * 100);

  function handleRefresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ISO 17024 Compliance</h1>
          <p className="text-slate-500 text-sm mt-1">Certification body compliance monitoring</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Last checked: {format(new Date(checkedAt), "d MMM yyyy 'at' HH:mm")}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isPending}
            className="gap-2"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isPending && "animate-spin")} />
            {isPending ? "Refreshing…" : "Refresh"}
          </Button>
          <div className="text-right">
            <p className="text-3xl font-bold text-primary">{pct}%</p>
            <p className="text-xs text-slate-500">compliance score</p>
          </div>
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
            const status = clause.status(metrics);
            const StatusIcon = STATUS_ICON[status];
            const remediation = clause.remediation(metrics, status);
            return (
              <div key={clause.clause}>
                <div className="flex items-start gap-4 px-4 py-3">
                  <StatusIcon className={cn("w-5 h-5 shrink-0 mt-0.5", STATUS_ICON_COLOR[status])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">{clause.clause}</span>
                      <span className="font-semibold text-slate-900 text-sm">{clause.title}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{clause.description}</p>
                  </div>
                  <Badge className={cn("shrink-0 border-0 text-xs", STATUS_BADGE_COLOR[status])}>
                    {clause.metric(metrics)}
                  </Badge>
                </div>

                {remediation && (
                  <div
                    className={cn(
                      "mx-4 mb-3 rounded-xl px-4 py-3",
                      status === "red"
                        ? "bg-red-50 border border-red-100 text-red-800"
                        : "bg-amber-50 border border-amber-100 text-amber-800"
                    )}
                  >
                    <p className="text-xs leading-relaxed">{remediation.text}</p>
                    <Link
                      href={remediation.href}
                      className={cn(
                        "inline-flex items-center gap-1 text-xs mt-2 font-medium hover:underline",
                        status === "red" ? "text-red-700" : "text-amber-700"
                      )}
                    >
                      {remediation.linkText}
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}
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
