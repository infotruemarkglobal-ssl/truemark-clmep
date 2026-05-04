"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  BookOpen, CheckCircle2, XCircle, Clock, ExternalLink,
  User, Calendar, Award, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type CPDRecord = {
  id: string;
  title: string;
  type: string;
  hoursLogged: number;
  activityDate: string;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  evidenceUrl: string | null;
  createdAt: string;
  scheme: { id: string; name: string; code: string; cpdHoursRequired: number } | null;
  holder: { id: string; name: string; email: string };
};

const TYPE_LABELS: Record<string, string> = {
  course_completion: "Course Completion",
  conference:        "Conference / Seminar",
  self_study:        "Self Study",
  work_experience:   "Work Experience",
  publication:       "Publication",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:  { label: "Pending Review", color: "bg-amber-100 text-amber-700",    icon: Clock },
  approved: { label: "Approved",       color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected",       color: "bg-red-100 text-red-600",         icon: XCircle },
};

export default function CPDRecordReview({
  record,
  isAdmin,
}: {
  record: CPDRecord;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [reviewNote, setReviewNote] = useState(record.reviewNote ?? "");
  const [saving, setSaving] = useState(false);

  const cfg = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const canReview = isAdmin && record.status === "pending";

  async function submitReview(newStatus: "approved" | "rejected") {
    setSaving(true);
    try {
      const res = await fetch(`/api/cpd/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, reviewNote: reviewNote.trim() || null }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Failed to save review");
        return;
      }
      toast.success(`CPD record ${newStatus}`);
      router.refresh();
    } catch {
      toast.error("Failed to save review");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">{record.title}</h1>
            <p className="text-sm text-gray-500">{TYPE_LABELS[record.type] ?? record.type}</p>
          </div>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium", cfg.color)}>
          <Icon className="w-4 h-4" />
          {cfg.label}
        </span>
      </div>

      {/* Details card */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
          <div className="px-5 py-4">
            <p className="text-xs text-gray-400 mb-0.5">Hours Logged</p>
            <p className="text-2xl font-bold text-gray-900">{record.hoursLogged}h</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-gray-400 mb-0.5">Activity Date</p>
            <p className="font-medium text-gray-900 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-gray-400" />
              {format(new Date(record.activityDate), "d MMMM yyyy")}
            </p>
          </div>
        </div>

        {record.scheme && (
          <div className="px-5 py-4">
            <p className="text-xs text-gray-400 mb-0.5">Scheme</p>
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-900">{record.scheme.name}</span>
              <span className="text-xs font-mono text-gray-400">{record.scheme.code}</span>
              <span className="text-xs text-gray-400">({record.scheme.cpdHoursRequired}h required)</span>
            </div>
          </div>
        )}

        <div className="px-5 py-4">
          <p className="text-xs text-gray-400 mb-0.5">Submitted by</p>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            <span className="font-medium text-gray-900">{record.holder.name}</span>
            <span className="text-xs text-gray-400">{record.holder.email}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Submitted {format(new Date(record.createdAt), "d MMM yyyy, HH:mm")}
          </p>
        </div>

        {record.evidenceUrl && (
          <div className="px-5 py-4">
            <p className="text-xs text-gray-400 mb-1.5">Evidence</p>
            <a
              href={record.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              View evidence document
            </a>
          </div>
        )}
      </div>

      {/* Existing review note (if already reviewed) */}
      {record.reviewNote && !canReview && (
        <div className={cn(
          "rounded-xl border p-4",
          record.status === "approved"
            ? "bg-emerald-50 border-emerald-200"
            : "bg-red-50 border-red-200",
        )}>
          <p className="text-xs font-medium mb-1 text-gray-500">Review Note</p>
          <p className="text-sm text-gray-800">{record.reviewNote}</p>
          {record.reviewedAt && (
            <p className="text-xs text-gray-400 mt-2">
              Reviewed {format(new Date(record.reviewedAt), "d MMM yyyy, HH:mm")}
            </p>
          )}
        </div>
      )}

      {/* Admin review panel */}
      {canReview && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Review Decision</h2>

          <div className="space-y-1.5">
            <Label htmlFor="review-note" className="text-sm">
              Review Note <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <Textarea
              id="review-note"
              placeholder="Add a note for the candidate explaining the decision…"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={saving}
              onClick={() => submitReview("approved")}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              {saving ? "Saving…" : "Approve"}
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
              disabled={saving}
              onClick={() => submitReview("rejected")}
            >
              <XCircle className="w-4 h-4 mr-1.5" />
              Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
