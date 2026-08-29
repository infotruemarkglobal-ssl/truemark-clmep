"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { MessageSquareWarning, Plus, Clock, AlertCircle, RotateCcw, CheckCircle2, XCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Complaint = {
  id: string;
  reference: string;
  type: string;
  description: string;
  evidenceUrls: string | null;
  status: string;
  resolution: string | null;
  resolvedAt: string | null;
  submittedAt: string;
};

function parseEvidenceUrls(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((u): u is string => typeof u === "string" && u.length > 0)
      : [];
  } catch {
    return [];
  }
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  SUBMITTED:    { label: "Submitted",    color: "bg-blue-100 text-blue-700",       icon: Clock },
  ACKNOWLEDGED: { label: "Acknowledged", color: "bg-amber-100 text-amber-700",     icon: AlertCircle },
  UNDER_REVIEW: { label: "Under Review", color: "bg-purple-100 text-purple-700",   icon: RotateCcw },
  RESOLVED:     { label: "Resolved",     color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  CLOSED:       { label: "Closed",       color: "bg-gray-100 text-gray-600",       icon: XCircle },
};

const TYPE_LABELS: Record<string, string> = {
  service_quality: "Service Quality",
  staff_conduct: "Staff Conduct",
  certification_process: "Certification Process",
  billing: "Billing",
  other: "Other",
};

export default function MyComplaintsPage({ complaints }: { complaints: Complaint[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: "service_quality" as string, description: "", evidenceUrls: "" });

  const filtered = complaints.filter(
    (c) =>
      !search ||
      c.reference.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()),
  );

  async function submitComplaint() {
    if (!form.description || form.description.length < 20) {
      toast.error("Please provide at least 20 characters in your description");
      return;
    }
    setSaving(true);
    try {
      const urls = form.evidenceUrls
        ? form.evidenceUrls.split("\n").map((u) => u.trim()).filter(Boolean)
        : [];

      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          description: form.description,
          ...(urls.length ? { evidenceUrls: urls } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to submit complaint");
      toast.success("Complaint submitted. We will acknowledge it shortly.");
      setShowModal(false);
      setForm({ type: "service_quality", description: "", evidenceUrls: "" });
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
          <h1 className="text-2xl font-bold text-slate-900">My Complaints</h1>
          <p className="text-slate-500 text-sm mt-1">Submit and track complaints about the service, staff, or certification process</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="gap-2">
          <Plus className="w-4 h-4" /> File a Complaint
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search complaints…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquareWarning className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">{search ? "No complaints match your search" : "No complaints filed yet"}</p>
            {!search && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowModal(true)}>
                File your first complaint
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((complaint) => {
              const statusConf = STATUS_CONFIG[complaint.status] ?? STATUS_CONFIG.SUBMITTED;
              const StatusIcon = statusConf.icon;
              const evidenceLinks = parseEvidenceUrls(complaint.evidenceUrls);
              return (
                <div key={complaint.id} className="p-4 hover:bg-slate-50 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs text-slate-500">{complaint.reference}</span>
                        <Badge className="bg-slate-100 text-slate-600 border-0 text-[10px]">
                          {TYPE_LABELS[complaint.type] ?? complaint.type}
                        </Badge>
                        <Badge className={cn("border-0 text-[10px] gap-1", statusConf.color)}>
                          <StatusIcon className="w-3 h-3" />
                          {statusConf.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-700 line-clamp-2">{complaint.description}</p>
                      {complaint.resolution && (
                        <p className="text-xs text-slate-500 mt-1 italic">Resolution: {complaint.resolution}</p>
                      )}
                      {evidenceLinks.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-2 items-center">
                          <span className="text-xs text-slate-400">Evidence:</span>
                          {evidenceLinks.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline transition"
                            >
                              Link {i + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 shrink-0">
                      {format(new Date(complaint.submittedAt), "d MMM yyyy")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-xl w-full shadow-2xl max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 text-lg mb-5">File a Complaint</h3>
            <div className="space-y-4">
              <div>
                <Label>Complaint Type *</Label>
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
              <div>
                <Label>Description *</Label>
                <textarea
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
                  rows={5}
                  placeholder="Describe your complaint in detail (minimum 20 characters)…"
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

      {/* Confirmation */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Confirm Complaint Submission</h3>
                <p className="text-slate-500 text-sm mt-1">
                  Once submitted, your complaint cannot be edited. A reference number will be assigned and reviewed by the certification team.
                </p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 mb-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Your complaint</p>
              <p className="text-sm text-slate-700 line-clamp-4">{form.description}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)} disabled={saving}>
                Go Back &amp; Edit
              </Button>
              <Button className="flex-1 bg-primary" onClick={async () => { setShowConfirm(false); await submitComplaint(); }} disabled={saving}>
                {saving ? "Submitting…" : "Yes, Submit Complaint"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
