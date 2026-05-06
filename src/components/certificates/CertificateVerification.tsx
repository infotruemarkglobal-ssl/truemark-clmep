"use client";

import { useState } from "react";
import { format, isPast } from "date-fns";
import {
  CheckCircle2, XCircle, AlertTriangle, Shield, Award,
  Calendar, Clock, ExternalLink, Copy, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CertData = {
  certificateNumber: string;
  status: string;
  issuedAt: string;
  expiresAt: string | null;
  holderName: string;
  scheme: {
    name: string;
    code: string;
    description: string | null;
    validityMonths: number;
  };
  qrCodeUrl: string | null;
  openBadgeJson: Record<string, unknown> | null;
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: React.ElementType; description: string }> = {
  valid: {
    label: "Valid Certificate",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    icon: CheckCircle2,
    description: "This certificate is authentic and currently valid.",
  },
  invalid: {
    label: "Certificate Invalid",
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
    icon: XCircle,
    description: "This certificate exists but is not currently valid (expired, suspended, or revoked).",
  },
  not_found: {
    label: "Certificate Not Found",
    color: "text-slate-700",
    bg: "bg-slate-50 border-slate-200",
    icon: AlertTriangle,
    description: "No certificate with this number was found in our registry.",
  },
};

export default function CertificateVerification({
  result,
  certNumber,
  certificate,
}: {
  result: "valid" | "invalid" | "not_found";
  certNumber: string;
  certificate: CertData | null;
}) {
  const [showBadgeJson, setShowBadgeJson] = useState(false);
  const status = STATUS_MAP[result];
  const StatusIcon = status.icon;

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard"));
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Trust bar */}
      <div className="bg-slate-900 text-white py-3 px-4 text-center text-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-center gap-2">
          <Shield className="w-4 h-4 text-primary shrink-0" />
          <span>Official Truemark Global Certificate Registry · All certificates are digitally verified</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        {/* Verification status banner */}
        <div className={cn("rounded-2xl border p-6 text-center", status.bg)}>
          <StatusIcon className={cn("w-16 h-16 mx-auto mb-3", status.color)} />
          <h1 className={cn("text-2xl font-bold", status.color)}>{status.label}</h1>
          <p className="text-slate-600 text-sm mt-2 max-w-sm mx-auto">{status.description}</p>

          <div className="mt-4 bg-white/60 rounded-xl px-4 py-2 inline-flex items-center gap-2 font-mono text-sm text-slate-700">
            {certNumber}
            <button
              onClick={() => copyToClipboard(certNumber)}
              className="text-slate-400 hover:text-slate-700 transition"
              title="Copy certificate number"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            Verified at {format(new Date(), "d MMMM yyyy, HH:mm")} UTC
          </p>
        </div>

        {/* Certificate details */}
        {certificate && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Certificate preview header */}
              <div className="bg-linear-to-br from-slate-900 to-slate-800 p-8 text-center">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Award className="w-8 h-8 text-primary" />
                </div>
                <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Certificate of Competence</p>
                <h2 className="text-white text-xl font-bold">{certificate.scheme.name}</h2>
                <p className="text-slate-300 text-sm mt-1">{certificate.scheme.code}</p>
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <p className="text-slate-400 text-xs">Awarded to</p>
                  <p className="text-white text-2xl font-bold mt-1">{certificate.holderName}</p>
                </div>
                <div className="mt-4 inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-xs px-3 py-1 rounded-full border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  Truemark Global · ISO/IEC 17024 Accredited
                </div>
              </div>

              {/* Details grid */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    { label: "Certificate Number", value: certificate.certificateNumber, mono: true },
                    {
                      label: "Status",
                      value: certificate.status,
                      badge: true,
                      badgeColor: certificate.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600",
                    },
                    { label: "Issued", value: format(new Date(certificate.issuedAt), "d MMMM yyyy") },
                    ...(certificate.expiresAt ? [{
                      label: "Expires",
                      value: format(new Date(certificate.expiresAt), "d MMMM yyyy"),
                      highlight: isPast(new Date(certificate.expiresAt)) ? "text-red-500" : "",
                    }] : []),
                    { label: "Validity Period", value: `${certificate.scheme.validityMonths} months` },
                    { label: "Certification Body", value: "Truemark Global" },
                  ].map(({ label, value, mono, badge, badgeColor, highlight }) => (
                    <div key={label} className="space-y-1">
                      <p className="text-xs text-slate-400">{label}</p>
                      {badge ? (
                        <Badge className={cn("border-0 text-xs font-semibold", badgeColor)}>{value}</Badge>
                      ) : (
                        <p className={cn("font-semibold text-slate-900", mono && "font-mono text-xs", highlight)}>
                          {value}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {certificate.scheme.description && (
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-400 mb-1">About this certification</p>
                    <p className="text-sm text-slate-600">{certificate.scheme.description}</p>
                  </div>
                )}
              </div>

              {/* QR code */}
              {certificate.qrCodeUrl && (
                <div className="px-6 pb-6 flex items-center gap-4">
                  <div className="border border-slate-200 rounded-xl p-2 bg-white shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={certificate.qrCodeUrl}
                      alt="Certificate QR code"
                      className="w-24 h-24"
                    />
                  </div>
                  <div className="text-sm text-slate-600">
                    <p className="font-medium text-slate-800 mb-1">QR Verification</p>
                    <p>Scan this QR code to verify this certificate online. The QR code links directly to this verification page.</p>
                    <button
                      onClick={() => copyToClipboard(typeof window !== "undefined" ? window.location.href : "")}
                      className="flex items-center gap-1.5 text-primary text-xs mt-2 hover:underline"
                    >
                      <Copy className="w-3 h-3" /> Copy verification URL
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Open Badge JSON */}
            {certificate.openBadgeJson && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowBadgeJson((v) => !v)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition text-left"
                >
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-primary" />
                    <span className="font-medium text-slate-900 text-sm">Open Badge 3.0 Credential</span>
                    <Badge className="bg-primary/10 text-primary border-0 text-xs">Verifiable Credential</Badge>
                  </div>
                  {showBadgeJson
                    ? <ChevronUp className="w-4 h-4 text-slate-400" />
                    : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {showBadgeJson && (
                  <div className="border-t border-slate-100">
                    <div className="relative">
                      <pre className="p-4 text-xs text-slate-600 overflow-x-auto bg-slate-50 max-h-80">
                        {JSON.stringify(certificate.openBadgeJson, null, 2)}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(certificate.openBadgeJson, null, 2))}
                        className="absolute top-2 right-2 p-1.5 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700 transition"
                        title="Copy JSON"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-4 border-t border-slate-100">
                      <p className="text-xs text-slate-500">
                        This Open Badge 3.0 verifiable credential is signed by Truemark Global and can be
                        verified by any Open Badges-compatible platform or employer. The badge is compliant
                        with the IMS Global Open Badges 3.0 specification.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Powered by footer */}
        <div className="text-center pt-4">
          <div className="inline-flex items-center gap-2 text-slate-400 text-xs">
            <Shield className="w-4 h-4 text-primary" />
            <span>Truemark Global Certification Registry · ISO/IEC 17024:2012 Accredited</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            For enquiries: <a href="mailto:certificates@truemarkglobal.com" className="text-primary hover:underline">certificates@truemarkglobal.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
