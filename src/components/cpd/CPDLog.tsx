"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Award, Plus, Clock, CheckCircle2, AlertCircle, BookOpen, FileText, Briefcase, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type CPDRecord = {
  id: string;
  title: string;
  type: string;
  hoursLogged: number;
  activityDate: string;
  status: string;
  reviewNote: string | null;
  evidenceUrl: string | null;
  schemeId: string | null;
  schemeName: string | null;
  schemeCode: string | null;
};

type Scheme = { id: string; name: string; code: string; cpdHoursRequired: number };

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  course_completion: { label: "Course", icon: BookOpen, color: "bg-blue-100 text-blue-700" },
  conference: { label: "Conference", icon: Award, color: "bg-purple-100 text-purple-700" },
  self_study: { label: "Self Study", icon: FileText, color: "bg-amber-100 text-amber-700" },
  work_experience: { label: "Work Experience", icon: Briefcase, color: "bg-emerald-100 text-emerald-700" },
  publication: { label: "Publication", icon: GraduationCap, color: "bg-rose-100 text-rose-700" },
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
  approved: { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  pending: { color: "bg-amber-100 text-amber-700", icon: Clock },
  rejected: { color: "bg-red-100 text-red-600", icon: AlertCircle },
};

export default function CPDLog({
  records,
  schemes,
  schemeTotals,
}: {
  records: CPDRecord[];
  schemes: Scheme[];
  schemeTotals: Record<string, number>;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "conference",
    hoursLogged: "",
    activityDate: format(new Date(), "yyyy-MM-dd"),
    schemeId: schemes[0]?.id ?? "",
    evidenceUrl: "",
  });

  const totalHours = records.filter((r) => r.status === "approved").reduce((s, r) => s + r.hoursLogged, 0);

  async function logCPD() {
    if (!form.title || !form.hoursLogged || !form.activityDate) {
      toast.error("Fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/cpd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          hoursLogged: parseFloat(form.hoursLogged),
          activityDate: new Date(form.activityDate).toISOString(),
          schemeId: form.schemeId || null,
          evidenceUrl: form.evidenceUrl || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("CPD activity logged");
      setShowModal(false);
      setForm({ title: "", type: "conference", hoursLogged: "", activityDate: format(new Date(), "yyyy-MM-dd"), schemeId: schemes[0]?.id ?? "", evidenceUrl: "" });
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
          <h1 className="text-2xl font-bold text-slate-900">CPD Log</h1>
          <p className="text-slate-500 text-sm mt-1">Continuing Professional Development tracker</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Log Activity
        </Button>
      </div>

      {/* Scheme progress */}
      {schemes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {schemes.map((scheme) => {
            const hours = schemeTotals[scheme.id] ?? 0;
            const pct = scheme.cpdHoursRequired > 0 ? Math.min(100, (hours / scheme.cpdHoursRequired) * 100) : 100;
            return (
              <div key={scheme.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <Badge className="bg-primary/10 text-primary border-0 text-xs mb-1">{scheme.code}</Badge>
                    <h3 className="font-semibold text-slate-900 text-sm">{scheme.name}</h3>
                  </div>
                  <Award className="w-6 h-6 text-primary shrink-0" />
                </div>
                <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                  <span>{hours} hrs logged</span>
                  <span className="font-medium text-primary">{Math.round(pct)}%</span>
                </div>
                <Progress value={pct} className="h-2" />
                <p className="text-xs text-slate-400 mt-1.5">
                  {scheme.cpdHoursRequired} hrs required for renewal
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Approved Hours", value: totalHours.toFixed(1), color: "text-emerald-600" },
          { label: "Activities Logged", value: records.length, color: "text-slate-900" },
          { label: "Pending Review", value: records.filter((r) => r.status === "pending").length, color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
            <p className={cn("text-2xl font-bold", color)}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Records list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">Activity History</h2>
        </div>
        {records.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">No CPD activities logged yet</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowModal(true)}>Log your first activity</Button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {records.map((record) => {
              const typeConf = TYPE_CONFIG[record.type] ?? { label: record.type, icon: FileText, color: "bg-slate-100 text-slate-600" };
              const statusConf = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.pending;
              const TypeIcon = typeConf.icon;
              const StatusIcon = statusConf.icon;
              return (
                <div key={record.id} className="flex items-center gap-4 px-4 py-3">
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", typeConf.color)}>
                    <TypeIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm truncate">{record.title}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-slate-500">{format(new Date(record.activityDate), "d MMM yyyy")}</span>
                      {record.schemeCode && <Badge className="bg-primary/10 text-primary border-0 text-[10px] px-1.5">{record.schemeCode}</Badge>}
                    </div>
                    {record.reviewNote && <p className="text-xs text-slate-400 mt-0.5 italic">{record.reviewNote}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-slate-900 text-sm">{record.hoursLogged}h</p>
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      <StatusIcon className={cn("w-3 h-3", statusConf.color.split(" ")[1])} />
                      <Badge className={cn("text-[10px] border-0 px-1.5", statusConf.color)}>
                        {record.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Log Activity Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="font-bold text-slate-900 text-lg mb-5">Log CPD Activity</h3>
            <div className="space-y-3">
              <div>
                <Label>Activity Title *</Label>
                <Input className="mt-1" placeholder="e.g. ISO 27001 Conference" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type *</Label>
                  <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Hours *</Label>
                  <Input type="number" min="0.5" step="0.5" className="mt-1" placeholder="e.g. 8" value={form.hoursLogged} onChange={(e) => setForm((f) => ({ ...f, hoursLogged: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Activity Date *</Label>
                <Input type="date" className="mt-1" value={form.activityDate} onChange={(e) => setForm((f) => ({ ...f, activityDate: e.target.value }))} />
              </div>
              <div>
                <Label>Related Scheme</Label>
                <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.schemeId} onChange={(e) => setForm((f) => ({ ...f, schemeId: e.target.value }))}>
                  <option value="">None</option>
                  {schemes.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Evidence URL (optional)</Label>
                <Input type="url" className="mt-1" placeholder="https://…" value={form.evidenceUrl} onChange={(e) => setForm((f) => ({ ...f, evidenceUrl: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1" onClick={logCPD} disabled={saving}>{saving ? "Saving…" : "Log Activity"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
