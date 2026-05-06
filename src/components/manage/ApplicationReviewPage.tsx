"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ClipboardList, CheckCircle2, XCircle, User, FileText,
  ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Application = {
  id: string;
  status: string;
  createdAt: string;
  applicationRef: string;
  candidate: { id: string; name: string; email: string };
  scheme: { id: string; name: string; code: string };
  course: { id: string; title: string };
  declarations: {
    declaredExperience: number | null;
    declaredQualification: string | null;
    priorCertNumbers: string[] | null;
    legalDeclarationAt: string | null;
  };
  documents: {
    idDocumentUrl: string | null;
    qualificationDocUrl: string | null;
    employerLetterUrl: string | null;
  };
};

type Props = { applications: Application[] };

function RejectModal({
  onConfirm,
  onClose,
  isPending,
}: {
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-bold text-slate-900">Reject Application</h3>
        <p className="text-sm text-slate-600">
          Provide a clear reason for rejection. The candidate will receive this message and may
          reapply once the issue is resolved.
        </p>
        <textarea
          className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
          rows={4}
          maxLength={1000}
          placeholder="State the reason for rejection…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={!reason.trim() || isPending}
            onClick={() => onConfirm(reason.trim())}
          >
            {isPending ? "Rejecting…" : "Reject Application"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ApplicationCard({ app, onDecision }: { app: Application; onDecision: (id: string, action: "approve" | "reject", reason?: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleApprove() {
    startTransition(() => {
      onDecision(app.id, "approve");
    });
  }

  function handleReject(reason: string) {
    startTransition(() => {
      onDecision(app.id, "reject", reason);
      setRejectOpen(false);
    });
  }

  const hasDocuments =
    app.documents.idDocumentUrl ||
    app.documents.qualificationDocUrl ||
    app.documents.employerLetterUrl;

  return (
    <>
      {rejectOpen && (
        <RejectModal
          onConfirm={handleReject}
          onClose={() => setRejectOpen(false)}
          isPending={isPending}
        />
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">PENDING</Badge>
              <span className="font-mono text-xs text-slate-400">{app.applicationRef}</span>
            </div>
            <p className="font-semibold text-slate-900">{app.candidate.name}</p>
            <p className="text-sm text-slate-500">{app.candidate.email}</p>
            <p className="text-xs text-slate-400">
              {app.scheme.code} — {app.scheme.name} · submitted{" "}
              {format(new Date(app.createdAt), "d MMM yyyy, HH:mm")}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
              disabled={isPending}
              onClick={handleApprove}
            >
              <CheckCircle2 className="w-4 h-4" />
              {isPending ? "…" : "Approve"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
              disabled={isPending}
              onClick={() => setRejectOpen(true)}
            >
              <XCircle className="w-4 h-4" />
              Reject
            </Button>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expandable detail */}
        {expanded && (
          <div className="border-t border-slate-100 p-5 space-y-5 bg-slate-50/50">
            {/* Course */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Course</p>
              <p className="text-sm text-slate-700">{app.course.title}</p>
            </div>

            {/* Declarations */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Declarations</p>
              <div className="space-y-1.5 text-sm text-slate-700">
                {app.declarations.declaredExperience !== null && (
                  <p>
                    <span className="text-slate-500">Experience:</span>{" "}
                    {app.declarations.declaredExperience} year
                    {app.declarations.declaredExperience !== 1 ? "s" : ""}
                  </p>
                )}
                {app.declarations.declaredQualification && (
                  <p>
                    <span className="text-slate-500">Qualification:</span>{" "}
                    {app.declarations.declaredQualification}
                  </p>
                )}
                {app.declarations.priorCertNumbers?.length ? (
                  <p>
                    <span className="text-slate-500">Prior certs:</span>{" "}
                    {app.declarations.priorCertNumbers.join(", ")}
                  </p>
                ) : null}
                {app.declarations.legalDeclarationAt && (
                  <p className="text-xs text-slate-400">
                    Legal declaration signed{" "}
                    {format(new Date(app.declarations.legalDeclarationAt), "d MMM yyyy, HH:mm")}
                  </p>
                )}
              </div>
            </div>

            {/* Documents */}
            {hasDocuments && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Documents</p>
                <div className="space-y-2">
                  {app.documents.idDocumentUrl && (
                    <DocLink label="ID Document" url={app.documents.idDocumentUrl} />
                  )}
                  {app.documents.qualificationDocUrl && (
                    <DocLink label="Qualification Certificate" url={app.documents.qualificationDocUrl} />
                  )}
                  {app.documents.employerLetterUrl && (
                    <DocLink label="Employer Letter" url={app.documents.employerLetterUrl} />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function DocLink({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
    >
      <FileText className="w-4 h-4 shrink-0" />
      {label}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

export default function ApplicationReviewPage({ applications: initial }: Props) {
  const router = useRouter();
  const [applications, setApplications] = useState(initial);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDecision(
    id: string,
    action: "approve" | "reject",
    reason?: string,
  ) {
    setActionError(null);
    try {
      const res = await fetch(`/api/scheme-applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "approve" ? { action } : { action, reason }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setActionError(data.error ?? "Action failed.");
        return;
      }
      // Remove decided application from the list
      setApplications((prev) => prev.filter((a) => a.id !== id));
      router.refresh();
    } catch {
      setActionError("Network error. Please try again.");
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Scheme Applications</h1>
        <p className="text-slate-500 text-sm mt-1">
          Review pending eligibility applications from candidates (ISO 17024 Cl.6.2).
          Auto-approval fires after the configured review window if no decision is made.
        </p>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {applications.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">No pending applications</p>
          <p className="text-sm text-slate-500 mt-1">
            All applications have been reviewed or are pending auto-approval.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {applications.length} pending{" "}
            {applications.length === 1 ? "application" : "applications"} · oldest first
          </p>
          {applications.map((app) => (
            <ApplicationCard key={app.id} app={app} onDecision={handleDecision} />
          ))}
        </div>
      )}

      <div className="pt-4 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-400">
        <User className="w-3.5 h-3.5" />
        <span>
          Decisions are audit-logged. Approvals create a course enrolment for the candidate.
          Rejections notify the candidate by email and allow reapplication.
        </span>
      </div>
    </div>
  );
}
