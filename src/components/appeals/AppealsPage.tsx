"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Scale, Plus, Clock, CheckCircle2, XCircle, AlertCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Appeal = {
  id: string;
  reference: string;
  type: string;
  subjectId: string | null;
  description: string;
  evidenceUrls: string | null;
  status: string;
  resolution: string | null;
  resolvedAt: string | null;
  submittedAt: string;
  user: { firstName: string; lastName: string; email: string };
};

type ExamAttempt = {
  id: string;
  examTitle: string;
  percentageScore: number | null;
  submittedAt: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  SUBMITTED: { label: "Submitted", color: "bg-blue-100 text-blue-700", icon: Clock },
  UNDER_REVIEW: { label: "Under Review", color: "bg-amber-100 text-amber-700", icon: AlertCircle },
  UPHELD: { label: "Upheld", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  REJECTED: { label: "Rejected", color: "bg-red-100 text-red-600", icon: XCircle },
};

const TYPE_LABELS: Record<string, string> = {
  exam_result: "Exam Result",
  certification_decision: "Certification Decision",
  misconduct_finding: "Misconduct Finding",
  other: "Other",
};

export default function AppealsPage({
  appeals,
  examAttempts,
  isAdmin,
}: {
  appeals: Appeal[];
  examAttempts: ExamAttempt[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState<Appeal | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: "exam_result" as string,
    subjectId: "",
    description: "",
    evidenceUrls: "",
  });
  const [resolveForm, setResolveForm] = useState({ status: "UPHELD", resolution: "" });

  const filtered = appeals.filter(
    (a) =>
      !search ||
      a.reference.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase()) ||
      (isAdmin && `${a.user.firstName} ${a.user.lastName}`.toLowerCase().includes(search.toLowerCase()))
  );

  async function submitAppeal() {
    if (!form.description || form.description.length < 20) {
      toast.error("Please provide at least 20 characters in your description");
      return;
    }
    setSaving(true);
    try {
      const urls = form.evidenceUrls
        ? form.evidenceUrls
            .split("\n")
            .map((u) => u.trim())
            .filter(Boolean)
        : [];

      const res = await fetch("/api/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          subjectId: form.subjectId || null,
          description: form.description,
          evidenceUrls: urls,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Appeal submitted successfully");
      setShowModal(false);
      setForm({ type: "exam_result", subjectId: "", description: "", evidenceUrls: "" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function resolveAppeal() {
    if (!showResolveModal) return;
    if (!resolveForm.resolution || resolveForm.resolution.length < 5) {
      toast.error("Please provide a resolution note");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/appeals/${showResolveModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resolveForm),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Appeal updated");
      setShowResolveModal(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appeals</h1>
          <p className="text-slate-500 text-sm mt-1">
            {isAdmin ? "Manage all submitted appeals" : "Submit and track your appeals"}
          </p>
        </div>
        {!isAdmin && (
          <Button onClick={() => setShowModal(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Submit Appeal
          </Button>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: appeals.length, color: "text-slate-900" },
          { label: "Submitted", value: appeals.filter((a) => a.status === "SUBMITTED").length, color: "text-blue-600" },
          { label: "Under Review", value: appeals.filter((a) => a.status === "UNDER_REVIEW").length, color: "text-amber-600" },
          { label: "Resolved", value: appeals.filter((a) => ["UPHELD", "REJECTED"].includes(a.status)).length, color: "text-emerald-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
            <p className={cn("text-2xl font-bold", color)}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search appeals…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Appeals list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Scale className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">{search ? "No appeals match your search" : "No appeals yet"}</p>
            {!isAdmin && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowModal(true)}>
                Submit your first appeal
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((appeal) => {
              const statusConf = STATUS_CONFIG[appeal.status] ?? STATUS_CONFIG.SUBMITTED;
              const StatusIcon = statusConf.icon;
              return (
                <div key={appeal.id} className="p-4 hover:bg-slate-50 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs text-slate-500">{appeal.reference}</span>
                        <Badge className="bg-slate-100 text-slate-600 border-0 text-[10px]">
                          {TYPE_LABELS[appeal.type] ?? appeal.type}
                        </Badge>
                        <Badge className={cn("border-0 text-[10px] gap-1", statusConf.color)}>
                          <StatusIcon className="w-3 h-3" />
                          {statusConf.label}
                        </Badge>
                      </div>
                      {isAdmin && (
                        <p className="text-xs text-slate-500 mb-1">
                          {appeal.user.firstName} {appeal.user.lastName} · {appeal.user.email}
                        </p>
                      )}
                      <p className="text-sm text-slate-700 line-clamp-2">{appeal.description}</p>
                      {appeal.resolution && (
                        <p className="text-xs text-slate-500 mt-1 italic">
                          Resolution: {appeal.resolution}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-400">
                        {format(new Date(appeal.submittedAt), "d MMM yyyy")}
                      </p>
                      {isAdmin && appeal.status !== "UPHELD" && appeal.status !== "REJECTED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            setShowResolveModal(appeal);
                            setResolveForm({ status: "UPHELD", resolution: "" });
                          }}
                        >
                          Review
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit Appeal Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h3 className="font-bold text-slate-900 text-lg mb-5">Submit Appeal</h3>
            <div className="space-y-4">
              <div>
                <Label>Appeal Type *</Label>
                <select
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              {form.type === "exam_result" && examAttempts.length > 0 && (
                <div>
                  <Label>Related Exam Attempt</Label>
                  <select
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={form.subjectId}
                    onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))}
                  >
                    <option value="">Select attempt…</option>
                    {examAttempts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.examTitle} — {a.percentageScore?.toFixed(1) ?? "N/A"}%
                        {a.submittedAt ? ` (${format(new Date(a.submittedAt), "d MMM yyyy")})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Label>Description *</Label>
                <textarea
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
                  rows={5}
                  placeholder="Describe the grounds for your appeal in detail (minimum 20 characters)…"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
                <p className="text-xs text-slate-400 mt-0.5">{form.description.length} characters</p>
              </div>
              <div>
                <Label>Evidence URLs (one per line, optional)</Label>
                <textarea
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
                  rows={3}
                  placeholder="https://…"
                  value={form.evidenceUrls}
                  onChange={(e) => setForm((f) => ({ ...f, evidenceUrls: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (!form.description || form.description.length < 20) {
                    toast.error("Please provide at least 20 characters in your description");
                    return;
                  }
                  setShowConfirm(true);
                }}
                disabled={saving}
              >
                Review &amp; Submit
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation before submitting appeal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Confirm Appeal Submission</h3>
                <p className="text-slate-500 text-sm mt-1">
                  Once submitted, your appeal cannot be edited. A reference number will be assigned and reviewed by the certification team.
                </p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 mb-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Your appeal</p>
              <p className="text-sm text-slate-700 line-clamp-4">{form.description}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)} disabled={saving}>
                Go Back &amp; Edit
              </Button>
              <Button className="flex-1 bg-primary" onClick={async () => { setShowConfirm(false); await submitAppeal(); }} disabled={saving}>
                {saving ? "Submitting…" : "Yes, Submit Appeal"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal (Admin) */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h3 className="font-bold text-slate-900 text-lg mb-1">Review Appeal</h3>
            <p className="text-sm text-slate-500 mb-5">{showResolveModal.reference}</p>
            <div className="bg-slate-50 rounded-xl p-4 mb-4">
              <p className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wide">Appellant&apos;s Description</p>
              <p className="text-sm text-slate-700">{showResolveModal.description}</p>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Decision *</Label>
                <select
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={resolveForm.status}
                  onChange={(e) => setResolveForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="UNDER_REVIEW">Mark as Under Review</option>
                  <option value="UPHELD">Uphold Appeal</option>
                  <option value="REJECTED">Reject Appeal</option>
                </select>
              </div>
              <div>
                <Label>Resolution Note *</Label>
                <textarea
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
                  rows={4}
                  placeholder="Explain the decision…"
                  value={resolveForm.resolution}
                  onChange={(e) => setResolveForm((f) => ({ ...f, resolution: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowResolveModal(null)}>Cancel</Button>
              <Button className="flex-1" onClick={resolveAppeal} disabled={saving}>
                {saving ? "Saving…" : "Save Decision"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
