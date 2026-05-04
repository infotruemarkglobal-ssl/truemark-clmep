"use client";

import { useRouter } from "next/navigation";
import { format, isPast, differenceInDays } from "date-fns";
import {
  Award, CheckCircle2, XCircle, AlertTriangle, Clock,
  Download, ExternalLink, QrCode, Shield, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

export default function CertificateList({ certificates }: { certificates: Certificate[] }) {
  const router = useRouter();

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
                      {/* Status conveyed by text label, not colour alone — WCAG 1.4.1 */}
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
                    aria-label={`Download PDF certificate for ${cert.scheme.name} (opens in new tab)`}
                    onClick={() => window.open(`/api/certificates/${cert.id}/download`, "_blank")}
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" /> Download PDF
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
  );
}
