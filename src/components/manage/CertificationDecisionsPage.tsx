"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Award, CheckCircle2, XCircle, Clock, AlertCircle, ChevronRight,
  User, FileText, Shield, RotateCcw, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PendingAttempt = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  examTitle: string;
  passMark: number;
  percentageScore: number | null;
  passed: boolean | null;
  submittedAt: string | null;
  scheme: { id: string; name: string; code: string } | null;
};

type RecentDecision = {
  id: string;
  decision: string;
  justification: string;
  decidedAt: string;
  candidateName: string;
  candidateEmail: string;
  examTitle: string;
  scheme: { name: string; code: string } | null;
  officer: string;
  certificate: { id: string; number: string } | null;
};

const DECISION_CONFIG = {
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-600",     icon: XCircle },
  referred: { label: "Referred", color: "bg-amber-100 text-amber-700",  icon: RotateCcw },
};

export default function CertificationDecisionsPage({
  pendingAttempts,
  recentDecisions,
}: {
  pendingAttempts: PendingAttempt[];
  recentDecisions: RecentDecision[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [selected, setSelected] = useState<PendingAttempt | null>(null);
  const [form, setForm] = useState({ decision: "approved" as "approved" | "rejected" | "referred", justification: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filteredPending = pendingAttempts.filter((a) => {
    const q = search.toLowerCase();
    return !search || a.candidateName.toLowerCase().includes(q) || a.candidateEmail.toLowerCase().includes(q) || a.examTitle.toLowerCase().includes(q);
  });

  const filteredHistory = recentDecisions.filter((d) => {
    const q = search.toLowerCase();
    return !search || d.candidateName.toLowerCase().includes(q) || d.examTitle.toLowerCase().includes(q);
  });

  async function submitDecision() {
    if (!selected) return;
    if (form.justification.trim().length < 10) {
      toast.error("Please provide at least 10 characters of justification");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/certificates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: selected.id, decision: form.decision, justification: form.justification }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      if (form.decision === "approved" && data.certificate) {
        toast.success(`Certificate issued: ${data.certificate.certificateNumber}`);
      } else {
        toast.success(`Decision recorded: ${form.decision}`);
      }
      setSelected(null);
      setForm({ decision: "approved", justification: "" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Certification Decisions</h1>
        <p className="text-slate-500 text-sm mt-1">
          Review completed exam attempts and make ISO 17024–compliant certification decisions.
          Only Certification Officers may issue or deny certificates.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{pendingAttempts.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">Awaiting Decision</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">
            {recentDecisions.filter((d) => d.decision === "approved").length}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Approved (recent)</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-red-500">
            {recentDecisions.filter((d) => d.decision === "rejected").length}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Rejected (recent)</p>
        </div>
      </div>

      {/* ISO 17024 notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <Shield className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700">
          <span className="font-semibold">ISO 17024 Cl.9.3:</span> Certification decisions must be made by a person different from those who conducted the assessment. All decisions are permanently recorded in the audit log.
        </p>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition", activeTab === "pending" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            Pending {pendingAttempts.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">{pendingAttempts.length}</span>}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition", activeTab === "history" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            Decision History
          </button>
        </div>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm"
            placeholder="Search by name, exam, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Pending tab */}
      {activeTab === "pending" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {filteredPending.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <p className="font-medium text-slate-600">{search ? "No results" : "No pending decisions"}</p>
              <p className="text-sm text-slate-400 mt-1">{!search && "All completed exam attempts have been reviewed."}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredPending.map((attempt) => {
                const scoreColor = attempt.passed === true ? "text-emerald-600" : attempt.passed === false ? "text-red-500" : "text-slate-500";
                return (
                  <div key={attempt.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-slate-400" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 text-sm">{attempt.candidateName}</p>
                        {attempt.scheme && (
                          <Badge className="bg-primary/10 text-primary border-0 text-[10px]">{attempt.scheme.code}</Badge>
                        )}
                        <Badge className={cn("border-0 text-[10px] gap-1", attempt.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")}>
                          {attempt.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {attempt.passed ? "Passed" : "Failed"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{attempt.examTitle}</span>
                        <span className={cn("font-semibold", scoreColor)}>
                          {attempt.percentageScore !== null ? `${attempt.percentageScore.toFixed(1)}%` : "N/A"}
                          <span className="text-slate-400 font-normal"> (pass: {attempt.passMark}%)</span>
                        </span>
                        {attempt.submittedAt && (
                          <span>{format(new Date(attempt.submittedAt), "d MMM yyyy")}</span>
                        )}
                      </div>
                    </div>

                    {/* Action */}
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelected(attempt);
                        setForm({ decision: attempt.passed ? "approved" : "rejected", justification: "" });
                      }}
                      className="gap-1.5 shrink-0"
                    >
                      Review <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {filteredHistory.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <p className="text-slate-500">{search ? "No results" : "No decisions recorded yet"}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredHistory.map((dec) => {
                const conf = DECISION_CONFIG[dec.decision as keyof typeof DECISION_CONFIG] ?? DECISION_CONFIG.referred;
                const Icon = conf.icon;
                return (
                  <div key={dec.id} className="flex items-center gap-4 px-4 py-3">
                    <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", conf.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 text-sm">{dec.candidateName}</p>
                        <Badge className={cn("border-0 text-[10px]", conf.color)}>{conf.label}</Badge>
                        {dec.scheme && (
                          <Badge className="bg-primary/10 text-primary border-0 text-[10px]">{dec.scheme.code}</Badge>
                        )}
                        {dec.certificate && (
                          <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[10px] gap-1">
                            <Award className="w-3 h-3" /> {dec.certificate.number}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                        <span>{dec.examTitle}</span>
                        <span>by {dec.officer}</span>
                        <span>{format(new Date(dec.decidedAt), "d MMM yyyy")}</span>
                      </div>
                      {dec.justification && (
                        <p className="text-xs text-slate-400 mt-0.5 italic line-clamp-1">{dec.justification}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Decision Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Certification Decision</h3>
                <p className="text-sm text-slate-500 mt-0.5">{selected.candidateName} · {selected.examTitle}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Score summary */}
              <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Exam Score</p>
                  <p className={cn("text-2xl font-bold", selected.passed ? "text-emerald-600" : "text-red-500")}>
                    {selected.percentageScore !== null ? `${selected.percentageScore.toFixed(1)}%` : "N/A"}
                  </p>
                  <p className="text-xs text-slate-500">Pass mark: {selected.passMark}%</p>
                </div>
                <div className="text-right">
                  {selected.scheme && (
                    <>
                      <p className="text-xs text-slate-400">{selected.scheme.code}</p>
                      <p className="text-sm font-medium text-slate-700">{selected.scheme.name}</p>
                    </>
                  )}
                  {selected.submittedAt && (
                    <p className="text-xs text-slate-400 mt-1">{format(new Date(selected.submittedAt), "d MMM yyyy")}</p>
                  )}
                </div>
              </div>

              {/* Decision buttons */}
              <div>
                <Label>Decision *</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(["approved", "rejected", "referred"] as const).map((d) => {
                    const conf = DECISION_CONFIG[d];
                    const Icon = conf.icon;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, decision: d }))}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-sm font-medium transition",
                          form.decision === d
                            ? `${conf.color} border-current`
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        )}
                      >
                        <Icon className="w-5 h-5" />
                        {conf.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Justification */}
              <div>
                <Label>Justification * <span className="text-slate-400 font-normal">(required for audit trail)</span></Label>
                <textarea
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
                  rows={4}
                  placeholder={
                    form.decision === "approved"
                      ? "e.g. Candidate met all requirements for ISO 37001 Lead Implementer certification…"
                      : form.decision === "rejected"
                      ? "e.g. Score below pass mark. Candidate may re-attempt after a 30-day waiting period…"
                      : "e.g. Irregularities detected in exam session. Referred to proctor for review…"
                  }
                  value={form.justification}
                  onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
                />
                <p className="text-xs text-slate-400 mt-0.5">{form.justification.length} characters (min 10)</p>
              </div>

              {form.decision === "approved" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <Award className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-emerald-700">
                    Approving will immediately issue a certificate with a verifiable QR code and Open Badge 3.0 credential.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>Cancel</Button>
              <Button
                className={cn("flex-1", form.decision === "rejected" ? "bg-red-500 hover:bg-red-600" : form.decision === "referred" ? "bg-amber-500 hover:bg-amber-600" : "")}
                onClick={submitDecision}
                disabled={saving}
              >
                {saving ? "Processing…" : `Confirm — ${DECISION_CONFIG[form.decision].label}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
