"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ClipboardCheck, ArrowLeft, AlertTriangle, CheckCircle2,
  Clock, Save, Plus, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Auditor = { id: string; firstName: string; lastName: string };

type NCRow = {
  id: string;
  reference: string;
  type: string;
  description: string;
  status: string;
  reportedBy: string | null;
  dueDate: string | null;
};

type AuditDetail = {
  id: string;
  reference: string;
  title: string;
  scope: string;
  auditType: string;
  status: string;
  plannedDate: string;
  completedAt: string | null;
  leadAuditor: Auditor;
  findings: string | null;
  nonConformities: NCRow[];
};

const STATUS_BADGE: Record<string, string> = {
  PLANNED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

const NC_STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  CLOSED: "bg-emerald-100 text-emerald-700",
  VERIFIED: "bg-blue-100 text-blue-700",
};

export default function AuditProgrammeDetail({
  audit: initial,
  isSuperAdmin,
  isLeadAuditor,
  auditors,
}: {
  audit: AuditDetail;
  isSuperAdmin: boolean;
  isLeadAuditor: boolean;
  auditors: Auditor[];
}) {
  const router = useRouter();
  const [audit, setAudit] = useState(initial);
  const [isPending, startTransition] = useTransition();

  // Edit form state (SUPER_ADMIN only, PLANNED status)
  const [editTitle, setEditTitle] = useState(audit.title);
  const [editScope, setEditScope] = useState(audit.scope);
  const [editPlannedDate, setEditPlannedDate] = useState(audit.plannedDate.slice(0, 10));
  const [editLeadAuditorId, setEditLeadAuditorId] = useState(audit.leadAuditor.id);
  const [findingsText, setFindingsText] = useState(audit.findings ?? "");
  const [findingsDirty, setFindingsDirty] = useState(false);

  const canEdit = isSuperAdmin && audit.status === "PLANNED";
  const canWriteFindings = (isSuperAdmin || isLeadAuditor) && audit.status === "IN_PROGRESS";

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/audit-programme/${audit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Update failed");
    return data as AuditDetail;
  }

  function handleSaveMetadata() {
    startTransition(async () => {
      try {
        const updated = await patch({
          title: editTitle,
          scope: editScope,
          plannedDate: editPlannedDate,
          leadAuditorId: editLeadAuditorId,
        });
        setAudit(updated);
        toast.success("Audit updated");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  function handleStatusChange(newStatus: string) {
    startTransition(async () => {
      try {
        const updated = await patch({ status: newStatus });
        setAudit(updated);
        toast.success(`Status updated to ${newStatus.replace("_", " ")}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  function handleSaveFindings() {
    startTransition(async () => {
      try {
        const updated = await patch({ findings: findingsText });
        setAudit(updated);
        setFindingsDirty(false);
        toast.success("Findings saved");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  const StatusIcon = audit.status === "COMPLETED" ? CheckCircle2 : audit.status === "IN_PROGRESS" ? AlertTriangle : Clock;

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      {/* Back link */}
      <Link href="/audit-programme" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Audit Programme
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-400">{audit.reference}</span>
              <Badge className={cn("border-0 text-xs", STATUS_BADGE[audit.status] ?? "bg-slate-100 text-slate-500")}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {audit.status.replace("_", " ")}
              </Badge>
              <Badge className="border-0 text-xs bg-slate-100 text-slate-600">{audit.auditType}</Badge>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">{audit.title}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{audit.scope}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Planned Date</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">
              {format(new Date(audit.plannedDate), "d MMM yyyy")}
            </p>
          </div>
          {audit.completedAt && (
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Completed</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">
                {format(new Date(audit.completedAt), "d MMM yyyy")}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Lead Auditor</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">
              {audit.leadAuditor.firstName} {audit.leadAuditor.lastName}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Nonconformities</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">{audit.nonConformities.length}</p>
          </div>
        </div>

        {/* Status transition buttons */}
        {(isSuperAdmin || isLeadAuditor) && audit.status !== "COMPLETED" && audit.status !== "CANCELLED" && (
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            {audit.status === "PLANNED" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                disabled={isPending}
                onClick={() => handleStatusChange("IN_PROGRESS")}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Mark In Progress
              </Button>
            )}
            {audit.status === "IN_PROGRESS" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                disabled={isPending}
                onClick={() => handleStatusChange("COMPLETED")}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark Complete
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Edit metadata (SUPER_ADMIN, PLANNED only) */}
      {canEdit && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Edit Audit Details</h2>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Title</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Scope</label>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              rows={3}
              value={editScope}
              onChange={(e) => setEditScope(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Planned Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={editPlannedDate}
                onChange={(e) => setEditPlannedDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Lead Auditor</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={editLeadAuditorId}
                onChange={(e) => setEditLeadAuditorId(e.target.value)}
              >
                {auditors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.firstName} {a.lastName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Button
            onClick={handleSaveMetadata}
            disabled={isPending}
            className="gap-2"
            size="sm"
          >
            <Save className="w-3.5 h-3.5" />
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      )}

      {/* Findings */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
        <h2 className="font-semibold text-slate-900">Audit Findings</h2>

        {canWriteFindings ? (
          <>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              rows={6}
              placeholder="Document audit findings, observations, and conclusions…"
              value={findingsText}
              onChange={(e) => {
                setFindingsText(e.target.value);
                setFindingsDirty(true);
              }}
            />
            {findingsDirty && (
              <Button
                size="sm"
                onClick={handleSaveFindings}
                disabled={isPending}
                className="gap-2"
              >
                <Save className="w-3.5 h-3.5" />
                {isPending ? "Saving…" : "Save Findings"}
              </Button>
            )}
          </>
        ) : audit.findings ? (
          <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
            {audit.findings}
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">
            {audit.status === "PLANNED"
              ? "Findings will be recorded once the audit is in progress."
              : audit.status === "COMPLETED"
              ? "No findings were recorded for this audit."
              : "No findings recorded yet."}
          </p>
        )}
      </div>

      {/* Nonconformities */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">
            Nonconformities ({audit.nonConformities.length})
          </h2>
          {isSuperAdmin && (
            <Link
              href={`/manage/nonconformities/new?auditId=${audit.id}`}
              className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Nonconformity
            </Link>
          )}
        </div>

        {audit.nonConformities.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No nonconformities linked to this audit.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {audit.nonConformities.map((nc) => (
              <div key={nc.id} className="flex items-start gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-slate-400">{nc.reference}</span>
                    <Badge className={cn("border-0 text-xs", NC_STATUS_BADGE[nc.status] ?? "bg-slate-100 text-slate-500")}>
                      {nc.status}
                    </Badge>
                    <Badge className="border-0 text-xs bg-slate-100 text-slate-600">{nc.type}</Badge>
                  </div>
                  <p className="text-sm text-slate-700 mt-1 line-clamp-2">{nc.description}</p>
                  <div className="flex gap-3 mt-1 text-xs text-slate-400">
                    {nc.reportedBy && <span>Reported by {nc.reportedBy}</span>}
                    {nc.dueDate && <span>· Due {format(new Date(nc.dueDate), "d MMM yyyy")}</span>}
                  </div>
                </div>
                <Link
                  href={`/manage/nonconformities/${nc.id}`}
                  className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
