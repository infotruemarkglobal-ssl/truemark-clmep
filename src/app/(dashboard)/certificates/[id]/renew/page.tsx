"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";

type RenewalData = {
  certificate: {
    id: string;
    certificateNumber: string;
    status: string;
    issuedAt: string;
    expiresAt: string | null;
    holder: { id: string; firstName: string; lastName: string; email: string };
    scheme: { id: string; name: string; code: string; validityMonths: number; cpdHoursRequired: number };
  };
  cpd: { required: number; logged: number; met: boolean; measuredSince: string };
  exam?: { required: boolean; met: boolean; windowMonths: number | null };
  renewal: {
    windowOpensAt: string | null;
    inRenewalWindow: boolean;
    canRequest: boolean;
    canIssue: boolean;
    lastRenewal: string | null;
  };
};

export default function CertificateRenewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<RenewalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetch(`/api/certificates/${id}/renew`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json as RenewalData);
      })
      .catch(() => setError("Failed to load renewal information."));
  }, [id]);

  function handleAction(action: "request" | "issue") {
    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const res = await fetch(`/api/certificates/${id}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: notes.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error ?? "An error occurred.");
      } else if (action === "issue") {
        router.push(`/certificates/${json.certificate.id}?renewed=1`);
      } else {
        setActionSuccess("Your renewal request has been sent to the Certification Officer.");
      }
    });
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/2" />
          <div className="h-32 bg-slate-200 rounded" />
          <div className="h-24 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  const { certificate: cert, cpd, renewal } = data;
  const expiresAt = cert.expiresAt ? new Date(cert.expiresAt) : null;
  const daysUntilExpiry = expiresAt
    ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const isExpired = cert.status === "EXPIRED" || (daysUntilExpiry !== null && daysUntilExpiry < 0);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Certificate Renewal</h1>
        <p className="text-slate-500 text-sm mt-1">{cert.scheme.name}</p>
      </div>

      {/* Certificate summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Certificate</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="text-slate-500">Number</span>
            <p className="font-mono font-semibold text-slate-800">{cert.certificateNumber}</p>
          </div>
          <div>
            <span className="text-slate-500">Status</span>
            <p>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                cert.status === "ACTIVE" ? "bg-green-100 text-green-700"
                : cert.status === "EXPIRED" ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-600"
              }`}>{cert.status}</span>
            </p>
          </div>
          <div>
            <span className="text-slate-500">Issued</span>
            <p className="font-medium text-slate-800">{new Date(cert.issuedAt).toLocaleDateString()}</p>
          </div>
          <div>
            <span className="text-slate-500">Expires</span>
            <p className={`font-medium ${isExpired ? "text-red-600" : daysUntilExpiry !== null && daysUntilExpiry <= 30 ? "text-amber-600" : "text-slate-800"}`}>
              {expiresAt ? expiresAt.toLocaleDateString() : "—"}
              {daysUntilExpiry !== null && !isExpired && (
                <span className="ml-1 text-xs text-slate-400">({daysUntilExpiry}d remaining)</span>
              )}
              {isExpired && <span className="ml-1 text-xs text-red-400">(expired)</span>}
            </p>
          </div>
        </div>
        {cert.scheme.validityMonths > 0 && (
          <p className="text-xs text-slate-400 pt-1">
            Renewal grants a new {cert.scheme.validityMonths}-month certificate from the date of issue.
          </p>
        )}
      </div>

      {/* CPD progress */}
      {cpd.required > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">CPD Requirement</h2>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold text-slate-900">{cpd.logged}<span className="text-lg font-normal text-slate-400">h</span></p>
              <p className="text-sm text-slate-500">logged of {cpd.required}h required</p>
            </div>
            {cpd.met
              ? <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">Requirement met</span>
              : <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">{(cpd.required - cpd.logged).toFixed(1)}h short</span>
            }
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${cpd.met ? "bg-green-500" : "bg-amber-400"}`}
              style={{ width: `${Math.min(100, (cpd.logged / cpd.required) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">
            CPD measured from {new Date(cpd.measuredSince).toLocaleDateString()}
            {renewal.lastRenewal ? " (date of last renewal)" : " (date of original certification)"}.
          </p>
        </div>
      )}

      {/* Renewal window status */}
      {!renewal.inRenewalWindow && renewal.windowOpensAt && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          Renewal requests open {new Date(renewal.windowOpensAt).toLocaleDateString()} — 180 days before expiry.
        </div>
      )}

      {/* Exam re-sit requirement not met — blocks renewal */}
      {data.exam?.required && !data.exam?.met && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-3">
          <p className="text-sm font-semibold text-red-800">New examination required for renewal (ISO 17024 Cl.6.8)</p>
          <p className="text-sm text-red-700">
            This certification scheme requires a new passed examination for renewal. You must pass an examination
            for <strong>{cert.scheme.name}</strong> within the last{" "}
            <strong>{data.exam.windowMonths} months</strong>.
          </p>
          <a
            href="/exams"
            className="inline-flex items-center gap-1 text-sm font-semibold text-red-800 underline hover:text-red-900 transition-colors"
          >
            View available exams →
          </a>
        </div>
      )}

      {/* CPD requirement not met — blocks renewal request */}
      {!renewal.canRequest && renewal.inRenewalWindow && cpd.required > 0 && !cpd.met && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
          <p className="text-sm font-semibold text-amber-800">CPD hours required before you can renew</p>
          <p className="text-sm text-amber-700">
            You need <strong>{(cpd.required - cpd.logged).toFixed(1)}h</strong> more CPD hours before you can
            request renewal. You have logged {cpd.logged}h of {cpd.required}h required.
          </p>
          <a
            href="/cpd"
            className="inline-flex items-center gap-1 text-sm font-semibold text-amber-800 underline hover:text-amber-900 transition-colors"
          >
            Log CPD Hours →
          </a>
        </div>
      )}

      {/* Action */}
      {(renewal.canRequest || renewal.canIssue) && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Renewal Notes</h2>
          <textarea
            className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
            placeholder="Optional: add any notes for the Certification Officer (CPD context, re-examination details, etc.)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
          />

          {actionError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div>
          )}
          {actionSuccess && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{actionSuccess}</div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            {renewal.canIssue && (
              <button
                onClick={() => handleAction("issue")}
                disabled={isPending}
                className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Issuing…" : "Issue Renewal Certificate"}
              </button>
            )}
            {renewal.canRequest && !renewal.canIssue && !actionSuccess && (
              <button
                onClick={() => handleAction("request")}
                disabled={isPending}
                className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Sending…" : "Request Renewal Review"}
              </button>
            )}
          </div>

          {renewal.canIssue && !cpd.met && cpd.required > 0 && (
            <p className="text-xs text-amber-600">
              CPD requirement not fully met. As Certification Officer you may still issue the renewal — ensure you have reviewed and approved the candidate's CPD record before proceeding.
            </p>
          )}
        </div>
      )}

      {["REVOKED", "SUSPENDED"].includes(cert.status) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          This certificate is {cert.status.toLowerCase()} and cannot be renewed through this workflow.
          Contact your Certification Officer.
        </div>
      )}
    </div>
  );
}
