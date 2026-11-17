"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { format, isPast, type Locale as DateFnsLocale } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import {
  CheckCircle2, XCircle, AlertTriangle, Shield, Award,
  Clock, Copy, ChevronDown, ChevronUp,
  FileCheck, RefreshCw, Ban,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import LanguageSwitcher from "@/components/certificates/LanguageSwitcher";

const DATE_FNS_LOCALES: Record<string, DateFnsLocale> = { en: enUS, fr };

type TimelineEvent = {
  action: "CERTIFICATE_ISSUED" | "CERTIFICATE_RENEWED" | "CERTIFICATE_REVOKED";
  timestamp: string;
  reason: string | null;
};

type CertData = {
  certificateNumber: string;
  status: string;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  holderName: string;
  scheme: {
    name: string;
    code: string;
    description: string | null;
    validityMonths: number;
  };
  qrCodeUrl: string | null;
  openBadgeJson: Record<string, unknown> | null;
  timeline: TimelineEvent[];
  linkedInUrl: string | null;
};

const STATUS_STYLE: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  active: { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  expired: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Clock },
  revoked: { color: "text-red-700", bg: "bg-red-50 border-red-200", icon: XCircle },
  not_found: { color: "text-slate-700", bg: "bg-slate-50 border-slate-200", icon: AlertTriangle },
};

const TIMELINE_STYLE: Record<TimelineEvent["action"], { icon: React.ElementType; color: string }> = {
  CERTIFICATE_ISSUED: { icon: FileCheck, color: "text-emerald-600 bg-emerald-50" },
  CERTIFICATE_RENEWED: { icon: RefreshCw, color: "text-primary bg-primary/10" },
  CERTIFICATE_REVOKED: { icon: Ban, color: "text-red-600 bg-red-50" },
};

export default function CertificateVerification({
  result,
  certNumber,
  certificate,
}: {
  result: "active" | "expired" | "revoked" | "not_found";
  certNumber: string;
  certificate: CertData | null;
}) {
  const [showBadgeJson, setShowBadgeJson] = useState(false);
  const t = useTranslations("Verify");
  const locale = useLocale();
  const dateFnsLocale = DATE_FNS_LOCALES[locale] ?? enUS;
  const style = STATUS_STYLE[result];
  const StatusIcon = style.icon;

  // The root layout (shared by every other page in the app) stays hardcoded
  // lang="en" — this is the only page with translated content, so it
  // corrects its own document language instead of making that layout
  // locale-aware for everyone.
  useEffect(() => {
    document.documentElement.lang = locale;
    return () => { document.documentElement.lang = "en"; };
  }, [locale]);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard"));
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Trust bar */}
      <div className="bg-slate-900 text-white py-3 px-4 text-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center justify-center gap-2 flex-1 min-w-0">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">{t("trustBar")}</span>
          </div>
          <LanguageSwitcher />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        {/* Verification status banner */}
        <div className={cn("rounded-2xl border p-6 text-center", style.bg)}>
          <StatusIcon className={cn("w-16 h-16 mx-auto mb-3", style.color)} />
          <h1 className={cn("text-2xl font-bold", style.color)}>{t(`status.${result}.label`)}</h1>
          <p className="text-slate-600 text-sm mt-2 max-w-sm mx-auto">{t(`status.${result}.description`)}</p>

          <div className="mt-4 bg-white/60 rounded-xl px-4 py-2 inline-flex items-center gap-2 font-mono text-sm text-slate-700">
            {certNumber}
            <button
              onClick={() => copyToClipboard(certNumber)}
              className="text-slate-400 hover:text-slate-700 transition"
              title={t("copyCertNumber")}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            {t("verifiedAt", { time: format(new Date(), "d MMMM yyyy, HH:mm", { locale: dateFnsLocale }) })}
          </p>

          {result === "revoked" && certificate?.revocationReason && (
            <div className="mt-4 bg-white/70 border border-red-200 rounded-xl px-4 py-3 text-left">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">{t("revocationReasonLabel")}</p>
              <p className="text-sm text-slate-700">{certificate.revocationReason}</p>
              {certificate.revokedAt && (
                <p className="text-xs text-slate-400 mt-1.5">
                  {t("revokedOn", { date: format(new Date(certificate.revokedAt), "d MMMM yyyy", { locale: dateFnsLocale }) })}
                </p>
              )}
            </div>
          )}
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
                <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">{t("certificateOfCompetence")}</p>
                <h2 className="text-white text-xl font-bold">{certificate.scheme.name}</h2>
                <p className="text-slate-300 text-sm mt-1">{certificate.scheme.code}</p>
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <p className="text-slate-400 text-xs">{t("awardedTo")}</p>
                  <p className="text-white text-2xl font-bold mt-1">{certificate.holderName}</p>
                </div>
                <div className="mt-4 inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-xs px-3 py-1 rounded-full border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  {t("accreditedBadge")}
                </div>
              </div>

              {/* Details grid */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    { label: t("details.certificateNumber"), value: certificate.certificateNumber, mono: true },
                    {
                      label: t("details.status"),
                      value: certificate.status,
                      badge: true,
                      badgeColor: certificate.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600",
                    },
                    { label: t("details.issued"), value: format(new Date(certificate.issuedAt), "d MMMM yyyy", { locale: dateFnsLocale }) },
                    ...(certificate.expiresAt ? [{
                      label: t("details.expires"),
                      value: format(new Date(certificate.expiresAt), "d MMMM yyyy", { locale: dateFnsLocale }),
                      highlight: isPast(new Date(certificate.expiresAt)) ? "text-red-500" : "",
                    }] : []),
                    { label: t("details.validityPeriod"), value: t("details.validityMonths", { months: certificate.scheme.validityMonths }) },
                    { label: t("details.certificationBody"), value: t("details.certificationBodyName") },
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
                    <p className="text-xs text-slate-400 mb-1">{t("aboutCertification")}</p>
                    <p className="text-sm text-slate-600">{certificate.scheme.description}</p>
                  </div>
                )}

                {certificate.linkedInUrl && (
                  <div className="pt-4 border-t border-slate-100">
                    <a
                      href={certificate.linkedInUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-white bg-[#0A66C2] hover:bg-[#004182] transition-colors rounded-lg px-4 py-2"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                        <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z" />
                      </svg>
                      {t("addToLinkedIn")}
                    </a>
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
                    <p className="font-medium text-slate-800 mb-1">{t("qrVerification")}</p>
                    <p>{t("qrDescription")}</p>
                    <button
                      onClick={() => copyToClipboard(typeof window !== "undefined" ? window.location.href : "")}
                      className="flex items-center gap-1.5 text-primary text-xs mt-2 hover:underline"
                    >
                      <Copy className="w-3 h-3" /> {t("copyVerificationUrl")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Status history */}
            {certificate.timeline.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <p className="font-medium text-slate-900 text-sm mb-4">{t("statusHistory")}</p>
                <ol className="space-y-4">
                  {certificate.timeline.map((event, i) => {
                    const meta = TIMELINE_STYLE[event.action];
                    const EventIcon = meta.icon;
                    return (
                      <li key={i} className="flex gap-3">
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", meta.color)}>
                          <EventIcon className="w-4 h-4" />
                        </div>
                        <div className="pt-1">
                          <p className="text-sm font-medium text-slate-800">{t(`timeline.${event.action}`)}</p>
                          <p className="text-xs text-slate-400">{format(new Date(event.timestamp), "d MMMM yyyy, HH:mm", { locale: dateFnsLocale })} UTC</p>
                          {event.reason && (
                            <p className="text-sm text-slate-600 mt-1">{event.reason}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {/* Open Badge JSON */}
            {certificate.openBadgeJson && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowBadgeJson((v) => !v)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition text-left"
                >
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-primary" />
                    <span className="font-medium text-slate-900 text-sm">{t("openBadgeCredential")}</span>
                    <Badge className="bg-primary/10 text-primary border-0 text-xs">{t("verifiableCredential")}</Badge>
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
                        title={t("copyJson")}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-4 border-t border-slate-100">
                      <p className="text-xs text-slate-500">{t("openBadgeDescription")}</p>
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
            <span>{t("footerTagline")}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {t("enquiriesPrefix")} <a href="mailto:certificates@truemarkglobal.com" className="text-primary hover:underline">certificates@truemarkglobal.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
