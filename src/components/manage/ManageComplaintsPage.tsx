"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  MessageSquareWarning, Search, Filter, ChevronDown, ChevronUp, Clock,
  CheckCircle2, AlertCircle, XCircle, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Complaint = {
  id: string;
  reference: string;
  type: string;
  description: string;
  status: string;
  resolution: string | null;
  resolvedAt: string | null;
  submittedAt: string;
  updatedAt: string;
  submitterName: string;
  submitterEmail: string | null;
  userId: string | null;
};

const STATUS_FILTERS = ["SUBMITTED", "ACKNOWLEDGED", "UNDER_REVIEW", "RESOLVED", "CLOSED"];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  SUBMITTED:    { label: "Submitted",    color: "bg-blue-100 text-blue-700",    icon: Clock },
  ACKNOWLEDGED: { label: "Acknowledged", color: "bg-amber-100 text-amber-700",  icon: AlertCircle },
  UNDER_REVIEW: { label: "Under Review", color: "bg-purple-100 text-purple-700", icon: RotateCcw },
  RESOLVED:     { label: "Resolved",     color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  CLOSED:       { label: "Closed",       color: "bg-gray-100 text-gray-600",    icon: XCircle },
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED:    ["ACKNOWLEDGED", "UNDER_REVIEW", "CLOSED"],
  ACKNOWLEDGED: ["UNDER_REVIEW", "RESOLVED", "CLOSED"],
  UNDER_REVIEW: ["RESOLVED", "CLOSED"],
  ESCALATED:    ["UNDER_REVIEW", "RESOLVED", "CLOSED"],
};

export default function ManageComplaintsPage({
  complaints,
  nextCursor,
  currentStatus,
}: {
  complaints: Complaint[];
  nextCursor: string | null;
  currentStatus: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [isPending, startTransition] = useTransition();

  function setFilter(status: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cursor");
    if (status) params.set("status", status); else params.delete("status");
    startTransition(() => router.push(`/manage/complaints?${params.toString()}`));
  }

  function loadMore() {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", nextCursor);
    startTransition(() => router.push(`/manage/complaints?${params.toString()}`));
  }

  async function updateStatus(complaintId: string, newStatus: string) {
    setUpdating(complaintId);
    try {
      const body: Record<string, string> = { status: newStatus };
      if (newStatus === "RESOLVED" && resolution.trim()) {
        body.resolution = resolution.trim();
      }

      const res = await fetch(`/api/manage/complaints?id=${complaintId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Update failed");
        return;
      }

      toast.success(`Complaint moved to ${STATUS_CONFIG[newStatus]?.label ?? newStatus}`);
      setExpanded(null);
      setResolution("");
      router.refresh();
    } catch {
      toast.error("Failed to update complaint");
    } finally {
      setUpdating(null);
    }
  }

  const filtered = search.trim()
    ? complaints.filter(
        (c) =>
          c.reference.toLowerCase().includes(search.toLowerCase()) ||
          c.submitterName.toLowerCase().includes(search.toLowerCase()) ||
          (c.submitterEmail ?? "").toLowerCase().includes(search.toLowerCase()) ||
          c.type.toLowerCase().includes(search.toLowerCase()),
      )
    : complaints;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <MessageSquareWarning className="w-6 h-6 text-emerald-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Complaints</h1>
          <p className="text-sm text-gray-500">Review and resolve submitted complaints</p>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by reference, submitter, or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
          {STATUS_FILTERS.map((s) => (
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
              {STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <MessageSquareWarning className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No complaints found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((complaint) => {
            const cfg = STATUS_CONFIG[complaint.status] ?? STATUS_CONFIG.SUBMITTED;
            const Icon = cfg.icon;
            const isOpen = expanded === complaint.id;
            const transitions = ALLOWED_TRANSITIONS[complaint.status] ?? [];

            return (
              <div key={complaint.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  className="w-full px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : complaint.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-medium text-gray-500">
                          {complaint.reference}
                        </span>
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", cfg.color)}>
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">{complaint.type.replace(/_/g, " ")}</span>
                      </div>
                      <p className="font-medium text-gray-900 truncate">{complaint.submitterName}</p>
                      {complaint.submitterEmail && (
                        <p className="text-xs text-gray-400">{complaint.submitterEmail}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">
                        {format(new Date(complaint.submittedAt), "d MMM yyyy")}
                      </p>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-gray-400 mt-1 ml-auto" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400 mt-1 ml-auto" />
                      )}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                    <p className="text-sm text-gray-700 leading-relaxed">{complaint.description}</p>

                    {complaint.resolution && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-emerald-700 mb-1">Resolution</p>
                        <p className="text-sm text-emerald-800">{complaint.resolution}</p>
                        {complaint.resolvedAt && (
                          <p className="text-xs text-emerald-500 mt-1">
                            Resolved {format(new Date(complaint.resolvedAt), "d MMM yyyy")}
                          </p>
                        )}
                      </div>
                    )}

                    {transitions.length > 0 && (
                      <div className="space-y-3">
                        {transitions.includes("RESOLVED") && (
                          <Textarea
                            placeholder="Resolution notes (required when resolving)…"
                            value={resolution}
                            onChange={(e) => setResolution(e.target.value)}
                            rows={3}
                            className="text-sm"
                          />
                        )}
                        <div className="flex gap-2 flex-wrap">
                          {transitions.map((t) => (
                            <Button
                              key={t}
                              size="sm"
                              variant={t === "CLOSED" ? "outline" : "default"}
                              className={cn("text-xs", t !== "CLOSED" && "bg-emerald-600 hover:bg-emerald-700")}
                              disabled={updating === complaint.id}
                              onClick={() => updateStatus(complaint.id, t)}
                            >
                              {updating === complaint.id ? "Saving…" : `→ ${STATUS_CONFIG[t]?.label ?? t}`}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
