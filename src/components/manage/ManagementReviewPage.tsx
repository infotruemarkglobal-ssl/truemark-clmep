"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { FileText, Download, Save, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AuditFinding = { reference: string; title: string; findings: string | null; completedAt: string };

export type ReportData = {
  from: string;
  to: string;
  generatedAt: string;
  sections: {
    certActivity: {
      certsIssued: number;
      certsRevoked: number;
      activeCerts: number;
      examAttempts: number;
      passedAttempts: number;
      passRate: number | null;
    };
    appealsComplaints: {
      appealsReceived: number;
      appealsResolved: number;
      appealsPending: number;
      avgResolutionDays: number | null;
      slaBreaches: number;
      complaintsReceived: number;
      complaintsResolved: number;
    };
    complianceStatus: {
      openNonConformities: number;
      overdueActions: number;
      expiringCerts: number;
    };
    auditProgramme: {
      auditsCompleted: number;
      findings: AuditFinding[];
    };
    recommendations: string[];
  };
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-base font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100">{title}</h3>
      {children}
    </div>
  );
}

function MetricRow({ label, value, flag }: { label: string; value: string; flag?: "red" | "amber" }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={cn(
        "text-sm font-semibold",
        flag === "red" ? "text-red-600" : flag === "amber" ? "text-amber-600" : "text-slate-900",
      )}>
        {value}
      </span>
    </div>
  );
}

export default function ManagementReviewPage({
  defaultFrom,
  defaultTo,
  reportData,
}: {
  defaultFrom: string;
  defaultTo: string;
  reportData: ReportData | null;
}) {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [saving, setSaving] = useState(false);

  function handleGenerate() {
    router.push(`/manage/review?from=${fromDate}&to=${toDate}&generate=1`);
  }

  async function handleSaveRecord() {
    if (!reportData) return;
    setSaving(true);
    try {
      const res = await fetch("/api/manage/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: reportData.from,
          to: reportData.to,
          metrics: reportData.sections,
        }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      toast.success("Review record saved to audit log.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save record");
    } finally {
      setSaving(false);
    }
  }

  const { certActivity: ca, appealsComplaints: ac, complianceStatus: cs, auditProgramme: ap } = reportData?.sections ?? {};

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Management Review Report</h1>
        <p className="text-slate-500 mt-1 text-sm">ISO/IEC 17024:2012 Cl.8.4 — Periodic management review of the certification system</p>
      </div>

      {/* Date range form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <Button onClick={handleGenerate} className="gap-2">
            <FileText className="w-4 h-4" /> Generate Management Review Report
          </Button>
        </div>
      </div>

      {/* Report */}
      {reportData && ca && ac && cs && ap && (
        <>
          {/* Action bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() =>
                window.open(
                  `/api/manage/review/pdf?from=${encodeURIComponent(reportData.from)}&to=${encodeURIComponent(reportData.to)}`,
                  "_blank",
                )
              }
            >
              <Download className="w-4 h-4" /> Export as PDF
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleSaveRecord} disabled={saving}>
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Review Record"}
            </Button>
          </div>

          {/* Report cover header */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Management Review Report</p>
                <h2 className="text-xl font-bold text-slate-900">Truemark Global Standards &amp; Solutions Limited</h2>
                <p className="text-sm text-slate-500 mt-1">ISO/IEC 17024:2012 Cl.8.4 — Periodic Review</p>
              </div>
              <div className="text-right text-xs text-slate-500 space-y-0.5">
                <p>
                  <span className="font-medium">Review Period:</span>{" "}
                  {format(new Date(reportData.from), "d MMM yyyy")} – {format(new Date(reportData.to), "d MMM yyyy")}
                </p>
                <p>
                  <span className="font-medium">Generated:</span>{" "}
                  {format(new Date(reportData.generatedAt), "d MMMM yyyy, HH:mm")}
                </p>
              </div>
            </div>
          </div>

          {/* Section 1 — Certification Activity */}
          <Section title="1. Certification Activity">
            <MetricRow label="Certificates Issued in Period" value={String(ca.certsIssued)} />
            <MetricRow label="Certificates Revoked in Period" value={String(ca.certsRevoked)} flag={ca.certsRevoked > 0 ? "amber" : undefined} />
            <MetricRow label="Active Certificates (total)" value={String(ca.activeCerts)} />
            <MetricRow label="Exam Attempts in Period" value={String(ca.examAttempts)} />
            <MetricRow label="Passed Attempts" value={String(ca.passedAttempts)} />
            <MetricRow label="Pass Rate" value={ca.passRate != null ? `${ca.passRate}%` : "N/A"} flag={ca.passRate != null && ca.passRate < 50 ? "amber" : undefined} />
          </Section>

          {/* Section 2 — Appeals and Complaints */}
          <Section title="2. Appeals and Complaints">
            <MetricRow label="Appeals Received in Period" value={String(ac.appealsReceived)} />
            <MetricRow label="Appeals Resolved in Period" value={String(ac.appealsResolved)} />
            <MetricRow label="Appeals Pending (current)" value={String(ac.appealsPending)} flag={ac.appealsPending > 5 ? "amber" : undefined} />
            <MetricRow
              label="Avg Resolution Time (28-day SLA)"
              value={ac.avgResolutionDays != null ? `${ac.avgResolutionDays.toFixed(1)} days` : "N/A"}
              flag={ac.avgResolutionDays != null && ac.avgResolutionDays > 28 ? "red" : undefined}
            />
            <MetricRow label="SLA Breaches (> 28 days)" value={String(ac.slaBreaches)} flag={ac.slaBreaches > 0 ? "red" : undefined} />
            <MetricRow label="Complaints Received in Period" value={String(ac.complaintsReceived)} />
            <MetricRow label="Complaints Resolved in Period" value={String(ac.complaintsResolved)} />
          </Section>

          {/* Section 3 — Compliance Status */}
          <Section title="3. ISO 17024 Compliance Status">
            <MetricRow label="Open Nonconformities" value={String(cs.openNonConformities)} flag={cs.openNonConformities > 2 ? "red" : cs.openNonConformities > 0 ? "amber" : undefined} />
            <MetricRow label="Overdue Corrective Actions" value={String(cs.overdueActions)} flag={cs.overdueActions > 0 ? "red" : undefined} />
            <MetricRow label="Certificates Expiring (next 90 days)" value={String(cs.expiringCerts)} flag={cs.expiringCerts > 10 ? "amber" : undefined} />
          </Section>

          {/* Section 4 — Audit Programme */}
          <Section title="4. Audit Programme">
            <MetricRow label="Internal Audits Completed in Period" value={String(ap.auditsCompleted)} />
            {ap.findings.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Completed Audits</p>
                {ap.findings.map((f) => (
                  <div key={f.reference} className="bg-slate-50 rounded-xl p-4">
                    <p className="text-sm font-semibold text-slate-800">{f.reference} — {f.title}</p>
                    {f.findings && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-3">{f.findings}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      Completed: {format(new Date(f.completedAt), "d MMM yyyy")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Section 5 — Recommendations */}
          <Section title="5. Recommendations">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Recommendations are auto-generated based on the metrics above. Review with senior management before finalising.
              </p>
            </div>
            <div className="space-y-3">
              {reportData.sections.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-primary font-bold text-sm shrink-0 w-5">{i + 1}.</span>
                  <p className="text-sm text-slate-700">{rec}</p>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
