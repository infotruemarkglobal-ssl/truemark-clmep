"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Award, Download, Search, Filter, ChevronRight, AlertTriangle,
  CheckCircle2, Clock, XCircle, ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Certificate = {
  id: string;
  certificateNumber: string;
  status: string;
  issuedAt: string;
  expiresAt: string | null;
  holderName: string;
  holderEmail: string;
  holderId: string;
  schemeName: string;
  schemeCode: string;
};

const STATUS_FILTERS = ["ACTIVE", "EXPIRED", "REVOKED", "SUSPENDED", "LAPSED"];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  ACTIVE:    { label: "Active",    color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  EXPIRED:   { label: "Expired",   color: "bg-amber-100 text-amber-700",     icon: Clock },
  REVOKED:   { label: "Revoked",   color: "bg-red-100 text-red-600",         icon: XCircle },
  SUSPENDED: { label: "Suspended", color: "bg-orange-100 text-orange-700",   icon: AlertTriangle },
  LAPSED:    { label: "Lapsed",    color: "bg-gray-100 text-gray-600",       icon: ShieldOff },
};

export default function ManageCertificatesPage({
  certificates,
  nextCursor,
  currentStatus,
  isReadOnly = false,
}: {
  certificates: Certificate[];
  nextCursor: string | null;
  currentStatus: string | null;
  isReadOnly?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setFilter(status: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cursor");
    if (status) {
      params.set("status", status);
    } else {
      params.delete("status");
    }
    startTransition(() => router.push(`/manage/certificates?${params.toString()}`));
  }

  function loadMore() {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", nextCursor);
    startTransition(() => router.push(`/manage/certificates?${params.toString()}`));
  }

  async function handleDownload(certId: string, certNumber: string) {
    setDownloading(certId);
    try {
      const res = await fetch(`/api/certificates/${certId}/download`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Download failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Certificate-${certNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download certificate");
    } finally {
      setDownloading(null);
    }
  }

  const filtered = search.trim()
    ? certificates.filter(
        (c) =>
          c.holderName.toLowerCase().includes(search.toLowerCase()) ||
          c.holderEmail.toLowerCase().includes(search.toLowerCase()) ||
          c.certificateNumber.toLowerCase().includes(search.toLowerCase()) ||
          c.schemeName.toLowerCase().includes(search.toLowerCase()),
      )
    : certificates;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award className="w-6 h-6 text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Certificates</h1>
            <p className="text-sm text-gray-500">Manage all issued certificates</p>
          </div>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by holder, cert number, or scheme…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter(null)}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              !currentStatus
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300",
            )}
          >
            <Filter className="w-3 h-3" /> All
          </button>
          {STATUS_FILTERS.map((s) => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  currentStatus === s
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300",
                )}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Award className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No certificates found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Certificate</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Holder</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Scheme</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Issued</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Expires</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((cert) => {
                const cfg = STATUS_CONFIG[cert.status] ?? STATUS_CONFIG.LAPSED;
                const Icon = cfg.icon;
                return (
                  <tr key={cert.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-gray-800">{cert.certificateNumber}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{cert.holderName}</p>
                      <p className="text-xs text-gray-400">{cert.holderEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-800">{cert.schemeName}</p>
                      <p className="text-xs text-gray-400 font-mono">{cert.schemeCode}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {format(new Date(cert.issuedAt), "d MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {cert.expiresAt ? format(new Date(cert.expiresAt), "d MMM yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", cfg.color)}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isReadOnly && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            disabled={downloading === cert.id}
                            onClick={() => handleDownload(cert.id, cert.certificateNumber)}
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            {downloading === cert.id ? "…" : "PDF"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => router.push(`/certificates/${cert.id}`)}
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more */}
      {nextCursor && (
        <div className="text-center">
          <Button variant="outline" onClick={loadMore} disabled={isPending}>
            {isPending ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
