"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, differenceInDays, isPast } from "date-fns";
import {
  Award, Plus, Clock, CheckCircle2, AlertCircle, BookOpen,
  FileText, Briefcase, GraduationCap, Monitor, PenLine, Users,
  Building2, Upload, ExternalLink, ShieldCheck, TrendingUp, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type CPDRecord = {
  id: string;
  title: string;
  type: string;
  activityType: string;
  hoursLogged: number;
  activityDate: string;
  status: string;
  reviewNote: string | null;
  evidenceUrl: string | null;
  schemeId: string | null;
  schemeName: string | null;
  schemeCode: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

type Scheme = { id: string; name: string; code: string; cpdHoursRequired: number };

type Certificate = {
  id: string;
  certificateNumber: string;
  expiresAt: string | null;
  issuedAt: string;
  schemeId: string | null;
  schemeName: string | null;
  schemeCode: string | null;
  cpdHoursRequired: number;
  validityMonths: number;
  hoursLogged: number;
};

// ── Activity type config ───────────────────────────────────────────────────────

const ACTIVITY_TYPES: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  FORMAL_TRAINING:          { label: "Formal Training",          icon: GraduationCap, color: "text-blue-700",    bg: "bg-blue-100" },
  WEBINAR_ONLINE:           { label: "Webinar / Online Course",  icon: Monitor,       color: "text-purple-700",  bg: "bg-purple-100" },
  WRITING_PUBLISHING:       { label: "Writing & Publishing",     icon: PenLine,       color: "text-amber-700",   bg: "bg-amber-100" },
  MENTORING:                { label: "Mentoring",                icon: Users,         color: "text-emerald-700", bg: "bg-emerald-100" },
  PROFESSIONAL_ASSOCIATION: { label: "Professional Association", icon: Building2,     color: "text-sky-700",     bg: "bg-sky-100" },
  WORK_BASED_LEARNING:      { label: "Work-Based Learning",      icon: Briefcase,     color: "text-orange-700",  bg: "bg-orange-100" },
  READING_SELF_STUDY:       { label: "Reading / Self-Study",     icon: BookOpen,      color: "text-rose-700",    bg: "bg-rose-100" },
};

// Legacy type → activityType map for old records
const LEGACY_MAP: Record<string, string> = {
  course_completion: "FORMAL_TRAINING",
  conference:        "FORMAL_TRAINING",
  self_study:        "READING_SELF_STUDY",
  work_experience:   "WORK_BASED_LEARNING",
  publication:       "WRITING_PUBLISHING",
};

function resolveActivityType(record: CPDRecord): string {
  if (record.activityType && ACTIVITY_TYPES[record.activityType]) return record.activityType;
  return LEGACY_MAP[record.type] ?? "FORMAL_TRAINING";
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  approved: { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2, label: "Approved" },
  pending:  { color: "bg-amber-100 text-amber-700",     icon: Clock,        label: "Pending" },
  rejected: { color: "bg-red-100 text-red-600",         icon: AlertCircle,  label: "Rejected" },
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function CPDLog({
  records,
  schemes,
  schemeTotals,
  certificates,
  hoursThisYear,
}: {
  records: CPDRecord[];
  schemes: Scheme[];
  schemeTotals: Record<string, number>;
  certificates: Certificate[];
  hoursThisYear: number;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preselectedSchemeId, setPreselectedSchemeId] = useState<string>("");

  const [form, setForm] = useState({
    title: "",
    activityType: "FORMAL_TRAINING",
    hoursLogged: "",
    activityDate: format(new Date(), "yyyy-MM-dd"),
    schemeId: "",
    evidenceUrl: "",
    notes: "",
  });

  function openModal(schemeId?: string) {
    setPreselectedSchemeId(schemeId ?? "");
    setForm((f) => ({ ...f, schemeId: schemeId ?? "" }));
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setForm({ title: "", activityType: "FORMAL_TRAINING", hoursLogged: "", activityDate: format(new Date(), "yyyy-MM-dd"), schemeId: "", evidenceUrl: "", notes: "" });
  }

  async function uploadEvidence(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/candidate/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Upload failed");
        return;
      }
      const { url } = await res.json();
      setForm((f) => ({ ...f, evidenceUrl: url }));
      toast.success("Evidence uploaded");
    } catch {
      toast.error("Upload failed — please try again");
    } finally {
      setUploading(false);
    }
  }

  async function logCPD() {
    if (!form.title.trim() || !form.hoursLogged || !form.activityDate) {
      toast.error("Fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/cpd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          activityType: form.activityType,
          hoursLogged: parseFloat(form.hoursLogged),
          activityDate: new Date(form.activityDate).toISOString(),
          schemeId: form.schemeId || null,
          evidenceUrl: form.evidenceUrl || null,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to log activity");
      toast.success("CPD activity logged — pending review");
      closeModal();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalActivities = records.length;
  const pendingCount = records.filter((r) => r.status === "pending").length;

  // Activity type breakdown for this year
  const thisYear = new Date().getFullYear();
  const typeBreakdown: Record<string, number> = {};
  for (const r of records) {
    if (r.status === "approved" && new Date(r.activityDate).getFullYear() === thisYear) {
      const t = resolveActivityType(r);
      typeBreakdown[t] = (typeBreakdown[t] ?? 0) + r.hoursLogged;
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My CPD Portfolio</h1>
          <p className="text-slate-500 text-sm mt-1">Continuing Professional Development — personalised to your certifications</p>
        </div>
        <Button onClick={() => openModal()} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Log CPD Activity
        </Button>
      </div>

      {/* ── Hero stat strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl border border-primary/20 p-5 text-center">
          <p className="text-3xl font-bold text-primary">{hoursThisYear.toFixed(1)}</p>
          <p className="text-xs text-slate-600 mt-1 font-medium">Approved hours this year</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center">
          <p className="text-3xl font-bold text-slate-900">{totalActivities}</p>
          <p className="text-xs text-slate-500 mt-1">Activities logged</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center">
          <p className={cn("text-3xl font-bold", pendingCount > 0 ? "text-amber-600" : "text-slate-400")}>
            {pendingCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">Awaiting review</p>
        </div>
      </div>

      {/* ── Certification progress cards ──────────────────────────────────── */}
      {certificates.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
            Progress toward renewal
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {certificates.map((cert) => {
              const req = cert.cpdHoursRequired;
              const logged = cert.hoursLogged;
              const met = req === 0 || logged >= req;
              const pct = req > 0 ? Math.min(100, (logged / req) * 100) : 100;
              const expiresAt = cert.expiresAt ? new Date(cert.expiresAt) : null;
              const daysLeft = expiresAt ? differenceInDays(expiresAt, new Date()) : null;
              const expired = expiresAt ? isPast(expiresAt) : false;

              return (
                <div
                  key={cert.id}
                  className={cn(
                    "bg-white rounded-2xl border shadow-sm p-5 flex flex-col gap-3",
                    met ? "border-emerald-200" : "border-slate-200"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Badge className="bg-primary/10 text-primary border-0 text-[10px] mb-1.5">{cert.schemeCode}</Badge>
                      <h3 className="font-semibold text-slate-900 text-sm leading-snug">{cert.schemeName}</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">{cert.certificateNumber}</p>
                    </div>
                    {met ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <Award className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    )}
                  </div>

                  {req > 0 ? (
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-500">{logged.toFixed(1)} / {req} hrs</span>
                        <span className={cn("font-semibold", met ? "text-emerald-600" : "text-primary")}>
                          {Math.round(pct)}%
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" />
                      <p className={cn("text-xs mt-1.5", met ? "text-emerald-600 font-medium" : "text-slate-500")}>
                        {met ? "✅ CPD requirement met" : `${(req - logged).toFixed(1)} hrs still needed`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No CPD requirement for this scheme</p>
                  )}

                  {expiresAt && (
                    <p className={cn("text-[10px]", expired ? "text-red-500 font-medium" : daysLeft !== null && daysLeft <= 90 ? "text-amber-600" : "text-slate-400")}>
                      {expired ? "Expired" : daysLeft !== null ? `Expires in ${daysLeft} days — ${format(expiresAt, "d MMM yyyy")}` : ""}
                    </p>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-auto text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                    onClick={() => openModal(cert.schemeId ?? undefined)}
                  >
                    <Plus className="w-3 h-3" /> Log CPD for this certification
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Activity type breakdown ────────────────────────────────────────── */}
      {Object.keys(typeBreakdown).length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
            {new Date().getFullYear()} breakdown by type
          </h2>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {Object.entries(typeBreakdown).map(([type, hours]) => {
                const conf = ACTIVITY_TYPES[type];
                if (!conf) return null;
                const Icon = conf.icon;
                return (
                  <div key={type} className={cn("rounded-xl p-3 flex items-center gap-3", conf.bg)}>
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/60")}>
                      <Icon className={cn("w-4 h-4", conf.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-xs font-semibold truncate", conf.color)}>{conf.label}</p>
                      <p className="text-xs text-slate-700 font-bold">{hours.toFixed(1)} hrs</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Scheme progress (all active schemes) ──────────────────────────── */}
      {schemes.filter((s) => s.cpdHoursRequired > 0).length > 0 && certificates.length === 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Scheme progress</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {schemes.filter((s) => s.cpdHoursRequired > 0).map((scheme) => {
              const hours = schemeTotals[scheme.id] ?? 0;
              const pct = Math.min(100, (hours / scheme.cpdHoursRequired) * 100);
              return (
                <div key={scheme.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <Badge className="bg-primary/10 text-primary border-0 text-xs mb-1">{scheme.code}</Badge>
                      <h3 className="font-semibold text-slate-900 text-sm">{scheme.name}</h3>
                    </div>
                    <TrendingUp className="w-5 h-5 text-primary shrink-0" />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>{hours.toFixed(1)} hrs logged</span>
                    <span className="font-semibold text-primary">{Math.round(pct)}%</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                  <p className="text-xs text-slate-400 mt-1.5">{scheme.cpdHoursRequired} hrs required for renewal</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Activity history ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Activity history</h2>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {records.length === 0 ? (
            <div className="p-14 text-center">
              <Clock className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <p className="text-slate-500 font-medium">No CPD activities logged yet</p>
              <p className="text-slate-400 text-sm mt-1">Start building your professional development record.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => openModal()}>
                Log your first activity
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Activity</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Hours</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Certification</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Evidence</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((record) => {
                    const aType = resolveActivityType(record);
                    const typeConf = ACTIVITY_TYPES[aType] ?? ACTIVITY_TYPES.FORMAL_TRAINING;
                    const statusConf = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.pending;
                    const TypeIcon = typeConf.icon;
                    const StatusIcon = statusConf.icon;

                    return (
                      <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-xs">
                          {format(new Date(record.activityDate), "d MMM yyyy")}
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="font-medium text-slate-900 truncate">{record.title}</p>
                          {record.reviewNote && (
                            <p className="text-xs text-slate-400 italic truncate mt-0.5">{record.reviewNote}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", typeConf.bg)}>
                              <TypeIcon className={cn("w-3.5 h-3.5", typeConf.color)} />
                            </div>
                            <span className="text-xs text-slate-600 hidden sm:block">{typeConf.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-slate-900">{record.hoursLogged}</span>
                          <span className="text-slate-400 text-xs">h</span>
                        </td>
                        <td className="px-4 py-3">
                          {record.schemeCode ? (
                            <Badge className="bg-primary/10 text-primary border-0 text-[10px] px-1.5">
                              {record.schemeCode}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {record.evidenceUrl ? (
                            <a
                              href={record.evidenceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                            >
                              View <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {record.verifiedAt ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                              <ShieldCheck className="w-3 h-3" /> Verified
                            </span>
                          ) : (
                            <span className={cn("inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5", statusConf.color)}>
                              <StatusIcon className="w-3 h-3" /> {statusConf.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Log Activity Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-slate-900 text-lg">Log CPD Activity</h3>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Activity type selector — visual grid */}
              <div>
                <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Activity Type *</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {Object.entries(ACTIVITY_TYPES).map(([key, conf]) => {
                    const Icon = conf.icon;
                    const selected = form.activityType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, activityType: key }))}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all text-sm",
                          selected
                            ? "border-primary bg-primary/5 text-primary font-medium"
                            : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        )}
                      >
                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", selected ? "bg-primary/10" : conf.bg)}>
                          <Icon className={cn("w-3.5 h-3.5", selected ? "text-primary" : conf.color)} />
                        </div>
                        <span className="truncate text-xs">{conf.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Title / Description *</Label>
                <Input
                  className="mt-1.5"
                  placeholder="e.g. ISO 9001 Lead Auditor course, Quality conference 2026…"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>

              {/* Date + Hours */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Date *</Label>
                  <Input
                    type="date"
                    className="mt-1.5"
                    value={form.activityDate}
                    max={format(new Date(), "yyyy-MM-dd")}
                    onChange={(e) => setForm((f) => ({ ...f, activityDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Hours Spent *</Label>
                  <Input
                    type="number"
                    min="0.5"
                    step="0.5"
                    className="mt-1.5"
                    placeholder="e.g. 8"
                    value={form.hoursLogged}
                    onChange={(e) => setForm((f) => ({ ...f, hoursLogged: e.target.value }))}
                  />
                </div>
              </div>

              {/* Related certification */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Related Certification</Label>
                <select
                  className="mt-1.5 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  value={form.schemeId}
                  onChange={(e) => setForm((f) => ({ ...f, schemeId: e.target.value }))}
                >
                  <option value="">General / Other</option>
                  {schemes.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>

              {/* Evidence upload */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Supporting Evidence <span className="text-slate-400 font-normal">(optional — PDF, JPEG, PNG, WebP)</span>
                </Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadEvidence(file);
                    e.target.value = "";
                  }}
                />
                {form.evidenceUrl ? (
                  <div className="mt-1.5 flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-xs text-emerald-700 font-medium flex-1 truncate">Evidence uploaded</span>
                    <button
                      onClick={() => setForm((f) => ({ ...f, evidenceUrl: "" }))}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className={cn(
                      "mt-1.5 w-full border-2 border-dashed rounded-xl px-4 py-5 flex flex-col items-center gap-2 transition-colors text-center",
                      uploading
                        ? "border-slate-200 bg-slate-50 cursor-not-allowed"
                        : "border-slate-200 hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                    )}
                  >
                    <Upload className={cn("w-5 h-5", uploading ? "text-slate-300 animate-pulse" : "text-slate-400")} />
                    <span className="text-xs text-slate-500">
                      {uploading ? "Uploading…" : "Click to upload certificate, attendance record or transcript"}
                    </span>
                  </button>
                )}
              </div>

              {/* Notes */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Notes <span className="text-slate-400 font-normal">(optional)</span>
                </Label>
                <textarea
                  className="mt-1.5 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  rows={3}
                  placeholder="What did you learn? How does this apply to your practice?"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 pb-5 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={closeModal} disabled={saving}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={logCPD} disabled={saving || uploading}>
                {saving ? "Saving…" : "Log Activity"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
