"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Eye, Clock, CheckCircle2, ArrowUpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Review = {
  id: string;
  riskLevel: string;
  reason: string | null;
  status: string;
  scheduledFor: string;
  completedAt: string | null;
  findings: string | null;
  certificate: { id: string; certificateNumber: string; scheme: { name: string; code: string } };
  user: { firstName: string; lastName: string; email: string };
  reviewer: { firstName: string; lastName: string } | null;
};

const STATUS_FILTERS = ["ALL", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "ESCALATED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  ESCALATED: "bg-red-100 text-red-600",
};

const RISK_BADGE: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-500",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-red-100 text-red-600",
};

function ReviewRow({ review, canManage, onChanged }: { review: Review; canManage: boolean; onChanged: () => void }) {
  const [findingsOpen, setFindingsOpen] = useState(false);
  const [findings, setFindings] = useState("");
  const [busy, setBusy] = useState(false);

  async function transition(status: string, requireFindings: boolean) {
    if (requireFindings && !findings.trim()) {
      setFindingsOpen(true);
      toast.error("Add findings first");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/surveillance-reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(requireFindings ? { findings } : {}) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      toast.success(`Review moved to ${status.replace("_", " ").toLowerCase()}`);
      setFindingsOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-4 border-b border-slate-100 last:border-0">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-slate-900 text-sm">{review.user.firstName} {review.user.lastName}</span>
            <span className="text-xs text-slate-400 font-mono">{review.certificate.certificateNumber}</span>
            <Badge className={cn("border-0 text-[10px]", RISK_BADGE[review.riskLevel])}>{review.riskLevel} risk</Badge>
            <Badge className={cn("border-0 text-[10px]", STATUS_BADGE[review.status])}>{review.status.replace("_", " ")}</Badge>
          </div>
          <p className="text-xs text-slate-500">{review.certificate.scheme.name} ({review.certificate.scheme.code})</p>
          {review.reason && <p className="text-xs text-slate-400 mt-0.5">{review.reason}</p>}
          <div className="flex gap-4 mt-1.5 text-xs text-slate-400">
            <span>Scheduled {format(new Date(review.scheduledFor), "d MMM yyyy")}</span>
            {review.completedAt && <span>Completed {format(new Date(review.completedAt), "d MMM yyyy")}</span>}
            {review.reviewer && <span>by {review.reviewer.firstName} {review.reviewer.lastName}</span>}
          </div>
          {review.findings && <p className="text-xs text-slate-600 mt-1 italic">&ldquo;{review.findings}&rdquo;</p>}
        </div>
        {canManage && (review.status === "SCHEDULED" || review.status === "IN_PROGRESS") && (
          <div className="flex flex-col gap-1.5 shrink-0 items-end">
            <div className="flex gap-1.5">
              {review.status === "SCHEDULED" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => transition("IN_PROGRESS", false)}>
                  Start review
                </Button>
              )}
              <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1" disabled={busy} onClick={() => { setFindingsOpen(true); if (findings.trim()) transition("COMPLETED", true); }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Complete
              </Button>
              <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50 gap-1" disabled={busy} onClick={() => { setFindingsOpen(true); if (findings.trim()) transition("ESCALATED", true); }}>
                <ArrowUpCircle className="w-3.5 h-3.5" /> Escalate
              </Button>
            </div>
            {findingsOpen && (
              <div className="w-72 space-y-1.5">
                <Textarea
                  placeholder="Findings (required to complete or escalate)…"
                  rows={2}
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  className="text-xs"
                />
                <div className="flex gap-1.5 justify-end">
                  <Button size="sm" className="text-xs h-7" disabled={busy} onClick={() => transition("COMPLETED", true)}>
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save & Complete"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SurveillanceReviewsPage({ canManage }: { canManage: boolean }) {
  const [filter, setFilter] = useState<StatusFilter>("SCHEDULED");
  const [reviews, setReviews] = useState<Review[] | null>(null);

  const [reloadToken, setReloadToken] = useState(0);
  const load = useCallback(() => setReloadToken((t) => t + 1), []);

  // react.dev "You Might Not Need an Effect" pattern for data fetching — the
  // fetch itself lives in the effect (not a memoised callback invoked from
  // it), with an `ignore` flag so a stale response from a superseded fetch
  // can't overwrite newer state.
  useEffect(() => {
    let ignore = false;
    const qs = filter === "ALL" ? "" : `?status=${filter}`;
    fetch(`/api/surveillance-reviews${qs}`)
      .then((res) => res.json())
      .then((body) => { if (!ignore) setReviews(body.reviews ?? []); });
    return () => { ignore = true; };
  }, [filter, reloadToken]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Eye className="w-6 h-6 text-primary" /> Surveillance Reviews
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          ISO 17024 Cl.9.4 risk-based surveillance of certificate holders between renewal cycles.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm border transition font-medium",
              filter === s ? "bg-primary text-white border-primary" : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white",
            )}
          >
            {s === "ALL" ? "All" : s.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {reviews === null ? (
          <div className="p-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="font-medium text-slate-600">No reviews</p>
            <p className="text-sm text-slate-400 mt-1">
              Reviews are scheduled automatically for certificates under a scheme with surveillance enabled.
            </p>
          </div>
        ) : (
          reviews.map((r) => <ReviewRow key={r.id} review={r} canManage={canManage} onChanged={load} />)
        )}
      </div>
    </div>
  );
}
