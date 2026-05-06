"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ClipboardCheck, Plus, ChevronRight, AlertTriangle,
  CheckCircle2, Clock, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Auditor = { id: string; firstName: string; lastName: string };

type AuditRow = {
  id: string;
  reference: string;
  title: string;
  scope: string;
  auditType: string;
  status: string;
  plannedDate: string;
  completedAt: string | null;
  leadAuditor: Auditor;
  nonConformityCount: number;
};

const STATUS_FILTERS = ["ALL", "PLANNED", "IN_PROGRESS", "COMPLETED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_BADGE: Record<string, string> = {
  PLANNED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  PLANNED: Clock,
  IN_PROGRESS: AlertTriangle,
  COMPLETED: CheckCircle2,
  CANCELLED: X,
};

function ScheduleModal({
  auditors,
  onClose,
  onCreated,
}: {
  auditors: Auditor[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [leadAuditorId, setLeadAuditorId] = useState(auditors[0]?.id ?? "");
  const [auditType, setAuditType] = useState("INTERNAL");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/audit-programme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, scope, plannedDate, leadAuditorId, auditType }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to schedule audit");
        onCreated();
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Schedule New Audit</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1">
              Title
            </label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Annual ISO 17024 Surveillance Audit"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1">
              Scope
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              rows={3}
              required
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="Describe the audit scope and objectives…"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1">
                Planned Date
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                required
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1">
                Audit Type
              </label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={auditType}
                onChange={(e) => setAuditType(e.target.value)}
              >
                <option value="INTERNAL">Internal</option>
                <option value="EXTERNAL">External</option>
                <option value="SURVEILLANCE">Surveillance</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1">
              Lead Auditor
            </label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              required
              value={leadAuditorId}
              onChange={(e) => setLeadAuditorId(e.target.value)}
            >
              {auditors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? "Scheduling…" : "Schedule Audit"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AuditProgrammeList({
  audits,
  auditors,
  isSuperAdmin,
  currentStatus,
}: {
  audits: AuditRow[];
  auditors: Auditor[];
  isSuperAdmin: boolean;
  currentStatus: string | null;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  const activeFilter: StatusFilter = (STATUS_FILTERS as readonly string[]).includes(currentStatus ?? "")
    ? (currentStatus as StatusFilter)
    : "ALL";

  function setFilter(f: StatusFilter) {
    const url = f === "ALL" ? "/audit-programme" : `/audit-programme?status=${f}`;
    router.push(url);
  }

  function handleCreated() {
    setModalOpen(false);
    router.refresh();
  }

  return (
    <>
      {modalOpen && (
        <ScheduleModal
          auditors={auditors}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Audit Programme</h1>
            <p className="text-slate-500 text-sm mt-1">
              ISO 17024 Cl.8.7 — scheduled internal audits and surveillance reviews
            </p>
          </div>
          {isSuperAdmin && (
            <Button onClick={() => setModalOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Schedule New Audit
            </Button>
          )}
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                activeFilter === f
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {f === "ALL" ? "All" : f.replace("_", " ")}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {audits.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-700">No audits found</p>
              <p className="text-sm text-slate-500 mt-1">
                {activeFilter === "ALL"
                  ? "No audits have been scheduled yet."
                  : `No audits with status "${activeFilter.replace("_", " ")}".`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {audits.map((audit) => {
                const StatusIcon = STATUS_ICON[audit.status] ?? Clock;
                return (
                  <div key={audit.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                    <StatusIcon className="w-5 h-5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-slate-400">{audit.reference}</span>
                        <Badge className={cn("border-0 text-xs", STATUS_BADGE[audit.status] ?? "bg-slate-100 text-slate-500")}>
                          {audit.status.replace("_", " ")}
                        </Badge>
                        {audit.nonConformityCount > 0 && (
                          <Badge className="border-0 text-xs bg-red-100 text-red-700">
                            {audit.nonConformityCount} NC
                          </Badge>
                        )}
                      </div>
                      <p className="font-semibold text-slate-900 text-sm mt-0.5 truncate">{audit.title}</p>
                      <p className="text-xs text-slate-500 truncate">{audit.scope}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span>{audit.auditType}</span>
                        <span>·</span>
                        <span>
                          {audit.status === "COMPLETED" && audit.completedAt
                            ? `Completed ${format(new Date(audit.completedAt), "d MMM yyyy")}`
                            : `Planned ${format(new Date(audit.plannedDate), "d MMM yyyy")}`}
                        </span>
                        <span>·</span>
                        <span>Lead: {audit.leadAuditor.firstName} {audit.leadAuditor.lastName}</span>
                      </div>
                    </div>
                    <Link
                      href={`/audit-programme/${audit.id}`}
                      className="flex items-center gap-1 text-xs text-primary font-medium hover:underline shrink-0"
                    >
                      View <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
