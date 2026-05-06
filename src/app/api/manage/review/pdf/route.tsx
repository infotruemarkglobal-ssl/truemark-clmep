import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { format, subMonths, startOfDay, endOfDay } from "date-fns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const G = "#065f46";
const GREY = "#6b7280";
const DARK = "#1f2937";
const BODY = "#374151";
const LINE = "#e5e7eb";
const RED = "#dc2626";
const AMBER = "#d97706";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.SUPER_ADMIN)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const from = fromParam ? startOfDay(new Date(fromParam)) : subMonths(new Date(), 12);
  const to = toParam ? endOfDay(new Date(toParam)) : new Date();

  const [
    certsIssued, certsRevoked, activeCerts, examAttempts, passedAttempts,
    appealsReceived, appealsResolved, appealsPending, resolvedAppealsTiming,
    complaintsReceived, complaintsResolved,
    openNonConformities, overdueActions, expiringCerts,
    auditsCompleted,
  ] = await Promise.all([
    db.certificate.count({ where: { issuedAt: { gte: from, lte: to } } }),
    db.auditLog.count({ where: { action: "CERTIFICATE_REVOKED", timestamp: { gte: from, lte: to } } }),
    db.certificate.count({ where: { status: "ACTIVE" } }),
    db.examAttempt.count({ where: { createdAt: { gte: from, lte: to }, status: "COMPLETED" } }),
    db.examAttempt.count({ where: { createdAt: { gte: from, lte: to }, status: "COMPLETED", passed: true } }),
    db.appeal.count({ where: { submittedAt: { gte: from, lte: to } } }),
    db.appeal.count({ where: { status: "RESOLVED", resolvedAt: { gte: from, lte: to } } }),
    db.appeal.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "ACKNOWLEDGED"] } } }),
    db.appeal.findMany({ where: { status: "RESOLVED", resolvedAt: { gte: from, lte: to } }, select: { submittedAt: true, resolvedAt: true } }),
    db.complaint.count({ where: { submittedAt: { gte: from, lte: to } } }),
    db.complaint.count({ where: { status: "RESOLVED", resolvedAt: { gte: from, lte: to } } }),
    db.nonConformity.count({ where: { status: "OPEN" } }),
    db.correctiveAction.count({ where: { completedAt: null, dueDate: { lt: new Date() } } }),
    db.certificate.count({ where: { status: "ACTIVE", expiresAt: { gt: new Date(), lt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) } } }),
    db.internalAudit.count({ where: { status: "COMPLETED", completedAt: { gte: from, lte: to } } }),
  ]);

  const passRate = examAttempts > 0 ? Math.round((passedAttempts / examAttempts) * 100) : null;
  const avgResolutionDays = resolvedAppealsTiming.length > 0
    ? resolvedAppealsTiming.reduce((sum, a) => sum + (a.resolvedAt!.getTime() - a.submittedAt.getTime()) / (1000 * 60 * 60 * 24), 0) / resolvedAppealsTiming.length
    : null;
  const slaBreaches = resolvedAppealsTiming.filter(
    (a) => a.resolvedAt && (a.resolvedAt.getTime() - a.submittedAt.getTime()) > 28 * 24 * 60 * 60 * 1000,
  ).length;

  const recommendations: string[] = [];
  if (certsIssued > 0 && appealsReceived > certsIssued * 0.1)
    recommendations.push(`High appeal rate (${appealsReceived} of ${certsIssued} certificates). Review assessment processes.`);
  if (overdueActions > 0)
    recommendations.push(`${overdueActions} corrective action${overdueActions > 1 ? "s" : ""} overdue. Immediate management attention required.`);
  if (expiringCerts > 10)
    recommendations.push(`${expiringCerts} certificates expire within 90 days. Proactively contact holders.`);
  if (slaBreaches > 0)
    recommendations.push(`${slaBreaches} appeal${slaBreaches > 1 ? "s" : ""} exceeded the 28-day SLA. Review appeals handling capacity.`);
  if (recommendations.length === 0)
    recommendations.push("No significant issues identified. Maintain current operational standards.");

  const { renderToBuffer, Document, Page, View, Text, StyleSheet } = await import("@react-pdf/renderer");

  const S = StyleSheet.create({
    page: { fontFamily: "Helvetica", padding: 48, fontSize: 10, color: DARK },
    header: { marginBottom: 24, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: G },
    org: { fontSize: 14, fontFamily: "Helvetica-Bold", color: G },
    title: { fontSize: 11, color: GREY, marginTop: 2 },
    meta: { fontSize: 9, color: GREY, marginTop: 6 },
    sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: G, marginBottom: 8, marginTop: 20, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: LINE },
    row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: LINE },
    label: { color: BODY, flex: 1 },
    value: { fontFamily: "Helvetica-Bold", textAlign: "right" },
    valueRed: { fontFamily: "Helvetica-Bold", textAlign: "right", color: RED },
    valueAmber: { fontFamily: "Helvetica-Bold", textAlign: "right", color: AMBER },
    rec: { flexDirection: "row", marginBottom: 6 },
    recNum: { color: G, fontFamily: "Helvetica-Bold", marginRight: 6, minWidth: 16 },
    recText: { color: BODY, flex: 1 },
    footer: { position: "absolute", bottom: 32, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: GREY },
  });

  function Row({ label, val, flag }: { label: string; val: string; flag?: "red" | "amber" }) {
    return (
      <View style={S.row}>
        <Text style={S.label}>{label}</Text>
        <Text style={flag === "red" ? S.valueRed : flag === "amber" ? S.valueAmber : S.value}>{val}</Text>
      </View>
    );
  }

  const periodStr = `${format(from, "d MMM yyyy")} – ${format(to, "d MMM yyyy")}`;
  const generatedStr = format(new Date(), "d MMMM yyyy, HH:mm");

  const doc = (
    <Document title="Management Review Report" author="Truemark Global Standards & Solutions Limited">
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <Text style={S.org}>TRUEMARK GLOBAL STANDARDS &amp; SOLUTIONS LIMITED</Text>
          <Text style={S.title}>Management Review Report — ISO/IEC 17024:2012 Cl.8.4</Text>
          <Text style={S.meta}>Review Period: {periodStr}   |   Generated: {generatedStr}</Text>
        </View>

        <Text style={S.sectionTitle}>1. Certification Activity</Text>
        <Row label="Certificates Issued in Period" val={String(certsIssued)} />
        <Row label="Certificates Revoked in Period" val={String(certsRevoked)} flag={certsRevoked > 0 ? "amber" : undefined} />
        <Row label="Active Certificates (total)" val={String(activeCerts)} />
        <Row label="Exam Attempts in Period" val={String(examAttempts)} />
        <Row label="Pass Rate" val={passRate != null ? `${passRate}%` : "N/A"} />

        <Text style={S.sectionTitle}>2. Appeals and Complaints</Text>
        <Row label="Appeals Received" val={String(appealsReceived)} />
        <Row label="Appeals Resolved" val={String(appealsResolved)} />
        <Row label="Appeals Pending" val={String(appealsPending)} flag={appealsPending > 5 ? "amber" : undefined} />
        <Row label="Avg Resolution Time (28-day SLA)" val={avgResolutionDays != null ? `${avgResolutionDays.toFixed(1)} days` : "N/A"} flag={avgResolutionDays != null && avgResolutionDays > 28 ? "red" : undefined} />
        <Row label="SLA Breaches" val={String(slaBreaches)} flag={slaBreaches > 0 ? "red" : undefined} />
        <Row label="Complaints Received" val={String(complaintsReceived)} />
        <Row label="Complaints Resolved" val={String(complaintsResolved)} />

        <Text style={S.sectionTitle}>3. ISO 17024 Compliance Status</Text>
        <Row label="Open Nonconformities" val={String(openNonConformities)} flag={openNonConformities > 2 ? "red" : openNonConformities > 0 ? "amber" : undefined} />
        <Row label="Overdue Corrective Actions" val={String(overdueActions)} flag={overdueActions > 0 ? "red" : undefined} />
        <Row label="Certificates Expiring (next 90 days)" val={String(expiringCerts)} flag={expiringCerts > 10 ? "amber" : undefined} />

        <Text style={S.sectionTitle}>4. Audit Programme</Text>
        <Row label="Internal Audits Completed in Period" val={String(auditsCompleted)} />

        <Text style={S.sectionTitle}>5. Recommendations</Text>
        {recommendations.map((rec, i) => (
          <View key={i} style={S.rec}>
            <Text style={S.recNum}>{i + 1}.</Text>
            <Text style={S.recText}>{rec}</Text>
          </View>
        ))}

        <View style={S.footer}>
          <Text>Truemark Global Standards &amp; Solutions Limited — Confidential</Text>
          <Text>ISO/IEC 17024:2012 Cl.8.4 — Management Review</Text>
        </View>
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Management-Review-${format(new Date(), "yyyy-MM-dd")}.pdf"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
