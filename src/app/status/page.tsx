import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Shield, CheckCircle2, XCircle, AlertTriangle, Database, HardDrive,
  Gauge, Clock3, RefreshCw,
} from "lucide-react";
import { getHealthSnapshot } from "@/lib/health";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "System Status — TrueMark Global",
  description: "Live status of the TrueMark Global certification platform's core services.",
};

export const dynamic = "force-dynamic";

type ComponentRow = {
  label: string;
  icon: React.ElementType;
  status: "connected" | "error" | "not_configured";
  detail: string;
};

function StatusBadge({ status }: { status: "connected" | "error" | "not_configured" }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-semibold">
        <CheckCircle2 className="w-3.5 h-3.5" /> Operational
      </span>
    );
  }
  if (status === "not_configured") {
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full text-xs font-semibold">
        Not configured
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full text-xs font-semibold">
      <XCircle className="w-3.5 h-3.5" /> Down
    </span>
  );
}

export default async function StatusPage() {
  const [snapshot, incidents] = await Promise.all([
    getHealthSnapshot(),
    db.statusIncident.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
      select: { id: true, title: true, message: true, severity: true, status: true, startedAt: true, resolvedAt: true },
    }),
  ]);

  const rows: ComponentRow[] = [
    {
      label: "Database",
      icon: Database,
      status: snapshot.db.status,
      detail: snapshot.db.status === "connected" ? `${snapshot.db.latencyMs}ms response` : "Unreachable",
    },
    {
      label: "File Storage",
      icon: HardDrive,
      status: snapshot.storage.status,
      detail: snapshot.storage.status === "connected" ? `${snapshot.storage.provider} · ${snapshot.storage.latencyMs}ms` : snapshot.storage.provider,
    },
    {
      label: "Rate Limiting / Redis",
      icon: Gauge,
      status: snapshot.redis.status,
      detail: snapshot.redis.status === "connected" ? `${snapshot.redis.latencyMs}ms response` : snapshot.redis.status === "not_configured" ? "Using local fallback (dev)" : "Unreachable",
    },
    {
      label: "Background Jobs",
      icon: Clock3,
      status: snapshot.backgroundJobs.configured ? "connected" : "not_configured",
      detail: snapshot.backgroundJobs.configured ? "Configured" : "Configuration check only — not a live reachability probe",
    },
  ];

  const openIncidents = incidents.filter((i) => i.status !== "resolved");
  const overall = snapshot.status === "ok" && openIncidents.length === 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/about" className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <Shield className="w-5 h-5 text-primary" />
            TrueMark Global
          </Link>
          <Link
            href="/status"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors text-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div
          className={
            overall
              ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-5 flex items-center gap-3"
              : "rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-center gap-3"
          }
        >
          {overall ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
          )}
          <div>
            <p className={overall ? "font-semibold text-emerald-800" : "font-semibold text-amber-800"}>
              {overall ? "All systems operational" : "Some systems are degraded"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Last checked {formatDistanceToNow(new Date(snapshot.timestamp), { addSuffix: true })}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.label} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{row.label}</p>
                    <p className="text-xs text-slate-400">{row.detail}</p>
                  </div>
                </div>
                <StatusBadge status={row.status} />
              </div>
            );
          })}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Recent incidents</h2>
          {incidents.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 border-dashed p-8 text-center text-sm text-slate-400">
              No incidents reported.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
              {incidents.map((incident) => (
                <div key={incident.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900">{incident.title}</p>
                    <span
                      className={
                        incident.status === "resolved"
                          ? "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700"
                          : "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
                      }
                    >
                      {incident.status}
                    </span>
                    <span
                      className={
                        incident.severity === "critical"
                          ? "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"
                          : incident.severity === "major"
                          ? "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700"
                          : "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600"
                      }
                    >
                      {incident.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{incident.message}</p>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Started {formatDistanceToNow(new Date(incident.startedAt), { addSuffix: true })}
                    {incident.resolvedAt && ` · Resolved ${formatDistanceToNow(new Date(incident.resolvedAt), { addSuffix: true })}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
