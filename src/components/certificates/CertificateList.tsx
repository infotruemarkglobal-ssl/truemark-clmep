"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, isPast, differenceInDays } from "date-fns";
import {
  Award, CheckCircle2, XCircle, AlertTriangle, Clock,
  Download, ExternalLink, QrCode, Shield, ChevronRight,
  FileText, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Certificate = {
  id: string;
  certificateNumber: string;
  status: string;
  issuedAt: string;
  expiresAt: string;
  qrCodeUrl: string | null;
  scheme: { name: string; code: string; validityMonths: number };
  renewals: { id: string }[];
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  ACTIVE: { label: "Active", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  EXPIRED: { label: "Expired", color: "bg-red-100 text-red-600", icon: XCircle },
  SUSPENDED: { label: "Suspended", color: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  REVOKED: { label: "Revoked", color: "bg-red-100 text-red-700", icon: XCircle },
  LAPSED: { label: "Lapsed", color: "bg-slate-100 text-slate-600", icon: Clock },
};

// ── Terms of Use modal ────────────────────────────────────────────────────────

function TermsModal({
  certId,
  schemeName,
  dpoEmail,
  onAccept,
  onClose,
}: {
  certId: string;
  schemeName: string;
  dpoEmail: string;
  onAccept: () => void;
  onClose: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleAccept() {
    if (!agreed || isPending) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/certificates/${certId}/terms-ack`, { method: "POST" });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to record acknowledgement");
        }
        onAccept();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "An error occurred");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary shrink-0" />
            <h2 className="font-bold text-slate-900">Certificate Terms of Use</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <p className="text-sm text-slate-600">
            By downloading your <strong>{schemeName}</strong> certificate, you agree to the
            following terms:
          </p>

          <ol className="space-y-2.5 text-sm text-slate-700">
            {[
              "This certificate is the property of TrueMark Global Standards and Solutions Limited.",
              "It may only be used to represent the specific certification for which it was issued.",
              "It must not be altered, defaced, or misrepresented.",
              "The scope of certification is limited to the programme detailed on the certificate.",
              "You must notify TrueMark Global if your circumstances change in a way that affects your eligibility.",
              "Misuse of this certificate may result in revocation and legal proceedings.",
            ].map((term, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{term}</span>
              </li>
            ))}
          </ol>

          <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
            For certificate verification, direct enquiries to:{" "}
            <a href={`mailto:${dpoEmail}`} className="text-primary hover:underline font-medium">
              {dpoEmail}
            </a>
          </p>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 space-y-4 shrink-0">
          <label className="flex items-start gap-3 cursor-pointer group" htmlFor="terms-agree">
            <span className="relative shrink-0 mt-0.5">
              <input
                type="checkbox"
                id="terms-agree"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "block w-5 h-5 rounded border-2 flex items-center justify-center transition",
                  agreed ? "bg-primary border-primary" : "border-slate-300 group-hover:border-primary"
                )}
              >
                {agreed && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </span>
            </span>
            <span className="text-sm text-slate-700">
              I agree to the Certificate Terms of Use
            </span>
          </label>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2"
              disabled={!agreed || isPending}
              onClick={handleAccept}
            >
              <Download className="w-4 h-4" />
              {isPending ? "Processing…" : "Accept and Download"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CertificateList({
  certificates,
  dpoEmail,
}: {
  certificates: Certificate[];
  dpoEmail: string;
}) {
  const router = useRouter();

  // Track which certificate IDs have been acknowledged in this session.
  // Avoids a round-trip on every subsequent download after the first acceptance.
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [modalState, setModalState] = useState<{
    certId: string;
    schemeName: string;
  } | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  async function handleDownloadClick(cert: Certificate) {
    if (checking) return;

    // Already acknowledged in this session — download immediately.
    if (acknowledgedIds.has(cert.id)) {
      window.open(`/api/certificates/${cert.id}/download`, "_blank");
      return;
    }

    // Check DB for an existing acknowledgement.
    setChecking(cert.id);
    try {
      const res = await fetch(`/api/certificates/${cert.id}/terms-ack`);
      const data = (await res.json()) as { acknowledged?: boolean; error?: string };

      if (!res.ok) throw new Error(data.error ?? "Check failed");

      if (data.acknowledged) {
        setAcknowledgedIds((prev) => new Set([...prev, cert.id]));
        window.open(`/api/certificates/${cert.id}/download`, "_blank");
      } else {
        setModalState({ certId: cert.id, schemeName: cert.scheme.name });
      }
    } catch {
      toast.error("Could not verify terms status. Please try again.");
    } finally {
      setChecking(null);
    }
  }

  function handleAccepted() {
    if (!modalState) return;
    const { certId } = modalState;
    setAcknowledgedIds((prev) => new Set([...prev, certId]));
    setModalState(null);
    window.open(`/api/certificates/${certId}/download`, "_blank");
  }

  if (certificates.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Certificates</h1>
          <p className="text-slate-500 text-sm mt-1">Your earned certifications</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center">
          <Award className="w-16 h-16 mx-auto mb-4 text-slate-200" />
          <p className="font-semibold text-slate-700 text-lg">No certificates yet</p>
          <p className="text-slate-500 text-sm mt-1">Pass a certification exam to earn your first certificate.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push("/courses")}>
            Browse Courses
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {modalState && (
        <TermsModal
          certId={modalState.certId}
          schemeName={modalState.schemeName}
          dpoEmail={dpoEmail}
          onAccept={handleAccepted}
          onClose={() => setModalState(null)}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Certificates</h1>
            <p className="text-slate-500 text-sm mt-1">{certificates.length} certificate{certificates.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        <div className="space-y-4">
          {certificates.map((cert) => {
            const statusConf = STATUS_CONFIG[cert.status] ?? STATUS_CONFIG.ACTIVE;
            const StatusIcon = statusConf.icon;
            const expiresAt = new Date(cert.expiresAt);
            const issuedAt = new Date(cert.issuedAt);
            const daysLeft = differenceInDays(expiresAt, new Date());
            const isExpiringSoon = daysLeft > 0 && daysLeft <= 90;
            const totalDays = differenceInDays(expiresAt, issuedAt);
            const validityProgress = Math.max(0, Math.min(100, ((totalDays - daysLeft) / totalDays) * 100));
            const isChecking = checking === cert.id;

            return (
              <div
                key={cert.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Certificate card header */}
                <div className="bg-linear-to-r from-primary/5 to-transparent border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0" aria-hidden="true">
                      <Award className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-primary/10 text-primary border-0 text-xs">{cert.scheme.code}</Badge>
                        <Badge className={cn("border-0 text-xs gap-1", statusConf.color)}>
                          <StatusIcon className="w-3 h-3" aria-hidden="true" />
                          {statusConf.label}
                        </Badge>
                        {isExpiringSoon && (
                          <Badge className="bg-amber-100 text-amber-700 border-0 text-xs gap-1">
                            <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Expiring soon
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-slate-900 mt-1">{cert.scheme.name}</h3>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{cert.certificateNumber}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={() => router.push(`/verify/${cert.certificateNumber}`)}
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View
                  </Button>
                </div>

                {/* Validity details */}
                <div className="px-6 py-4">
                  <div className="flex flex-wrap gap-6 text-sm text-slate-600 mb-4">
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Issued</p>
                      <p className="font-medium">{format(issuedAt, "d MMM yyyy")}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Expires</p>
                      <p className={cn("font-medium", isPast(expiresAt) ? "text-red-500" : isExpiringSoon ? "text-amber-600" : "")}>
                        {format(expiresAt, "d MMM yyyy")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Validity</p>
                      <p className="font-medium">{cert.scheme.validityMonths} months</p>
                    </div>
                    {cert.status === "ACTIVE" && !isPast(expiresAt) && (
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5">Days remaining</p>
                        <p className={cn("font-medium", isExpiringSoon ? "text-amber-600" : "text-slate-700")}>
                          {daysLeft} days
                        </p>
                      </div>
                    )}
                  </div>

                  {cert.status === "ACTIVE" && (
                    <div>
                      <Progress value={validityProgress} className="h-1.5" />
                      <p className="text-xs text-slate-400 mt-1">
                        {isPast(expiresAt) ? "Expired" : `${Math.round(validityProgress)}% of validity period used`}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => router.push(`/verify/${cert.certificateNumber}`)}
                    >
                      <QrCode className="w-3.5 h-3.5" /> Verify / Share
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={isChecking}
                      aria-label={`Download PDF certificate for ${cert.scheme.name}`}
                      onClick={() => handleDownloadClick(cert)}
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      {isChecking ? "Checking…" : "Download PDF"}
                    </Button>
                    {(isExpiringSoon || isPast(expiresAt)) && cert.renewals.length === 0 && (
                      <Button
                        size="sm"
                        className="gap-1.5 bg-amber-500 hover:bg-amber-600"
                        onClick={() => router.push(`/certificates/${cert.id}/renew`)}
                      >
                        <Shield className="w-3.5 h-3.5" /> Renew Certificate
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Open Badge info */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" /> Open Badges 3.0
          </h2>
          <p className="text-sm text-slate-600">
            All Truemark Global certificates are issued as verifiable Open Badges 3.0 credentials.
            Share your badge on LinkedIn and other professional platforms to showcase your certifications.
            Each badge is digitally signed and can be verified by any employer or third party.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push("/profile/badges")}>
            Manage Badges
          </Button>
        </div>
      </div>
    </>
  );
}
