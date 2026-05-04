"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { FileText, Plus, Search, Users, CheckCircle2, AlertCircle, ToggleRight, ToggleLeft, Shield, ShieldOff, Pencil } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Paper = {
  id: string;
  title: string;
  description: string | null;
  durationMins: number;
  passMark: number;
  totalMarks: number;
  isActive: boolean;
  requiresProctoring: boolean;
  version: number;
  createdAt: string;
  creator: { firstName: string; lastName: string };
  scheme: { name: string; code: string } | null;
  sectionCount: number;
  questionCount: number;
  attemptCount: number;
};

type Scheme = { id: string; name: string; code: string };

export default function ManageExamsPage({
  papers,
  schemes,
}: {
  papers: Paper[];
  schemes: Scheme[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    schemeId: "",
    durationMins: "120",
    passMark: "70",
    totalMarks: "100",
    randomiseQuestions: true,
    randomiseOptions: true,
    allowReview: true,
    requiresProctoring: true,
    tabSwitchLimit: "3",
  });

  const filtered = papers.filter(
    (p) =>
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.scheme?.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function createPaper() {
    if (!form.title) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/manage/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          schemeId: form.schemeId || null,
          durationMins: parseInt(form.durationMins) || 120,
          passMark: parseInt(form.passMark) || 70,
          totalMarks: parseInt(form.totalMarks) || 100,
          tabSwitchLimit: parseInt(form.tabSwitchLimit) || 3,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Exam paper created");
      setShowModal(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(paper: Paper) {
    try {
      const res = await fetch(`/api/manage/exams/${paper.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !paper.isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(paper.isActive ? "Paper deactivated" : "Paper activated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manage Exam Papers</h1>
          <p className="text-slate-500 text-sm mt-1">{papers.length} papers</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Exam Paper
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Papers", value: papers.length, color: "text-slate-900" },
          { label: "Active", value: papers.filter((p) => p.isActive).length, color: "text-emerald-600" },
          { label: "Total Attempts", value: papers.reduce((s, p) => s + p.attemptCount, 0), color: "text-blue-600" },
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
        <Input placeholder="Search exam papers…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Papers list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">{search ? "No papers match your search" : "No exam papers yet"}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((paper) => (
              <div key={paper.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 text-sm truncate">{paper.title}</p>
                    {paper.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-500 border-0 text-[10px] gap-1">
                        <AlertCircle className="w-3 h-3" /> Inactive
                      </Badge>
                    )}
                    {paper.scheme && (
                      <Badge className="bg-primary/10 text-primary border-0 text-[10px]">{paper.scheme.code}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                    <span>{paper.durationMins} mins</span>
                    <span>Pass: {paper.passMark}%</span>
                    <span>{paper.questionCount} Qs ({paper.sectionCount} sections)</span>
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {paper.attemptCount} attempts</span>
                    {paper.requiresProctoring ? (
                      <span className="flex items-center gap-1 text-emerald-600"><Shield className="w-3 h-3" /> Proctored</span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400"><ShieldOff className="w-3 h-3" /> No proctoring</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link href={`/manage/exams/${paper.id}`}>
                    <Button variant="ghost" size="sm" title="Edit paper & add questions">
                      <Pencil className="w-4 h-4 text-slate-400" />
                    </Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(paper)} title={paper.isActive ? "Deactivate" : "Activate"}>
                    {paper.isActive ? (
                      <ToggleRight className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <ToggleLeft className="w-4 h-4 text-slate-400" />
                    )}
                  </Button>
                </div>
                <div className="text-right text-xs text-slate-400 shrink-0 hidden sm:block">
                  v{paper.version}<br />
                  {format(new Date(paper.createdAt), "d MMM yyyy")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Exam Paper Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 text-lg mb-5">New Exam Paper</h3>
            <div className="space-y-3">
              <div><Label>Title *</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
              <div>
                <Label>Description</Label>
                <textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <Label>Certification Scheme</Label>
                <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.schemeId} onChange={(e) => setForm((f) => ({ ...f, schemeId: e.target.value }))}>
                  <option value="">None</option>
                  {schemes.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Duration (mins)</Label><Input type="number" min="15" className="mt-1" value={form.durationMins} onChange={(e) => setForm((f) => ({ ...f, durationMins: e.target.value }))} /></div>
                <div><Label>Pass Mark (%)</Label><Input type="number" min="0" max="100" className="mt-1" value={form.passMark} onChange={(e) => setForm((f) => ({ ...f, passMark: e.target.value }))} /></div>
                <div><Label>Total Marks</Label><Input type="number" min="1" className="mt-1" value={form.totalMarks} onChange={(e) => setForm((f) => ({ ...f, totalMarks: e.target.value }))} /></div>
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={form.randomiseQuestions} onChange={(e) => setForm((f) => ({ ...f, randomiseQuestions: e.target.checked }))} className="rounded" />
                  Randomise questions
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={form.randomiseOptions} onChange={(e) => setForm((f) => ({ ...f, randomiseOptions: e.target.checked }))} className="rounded" />
                  Randomise options
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={form.allowReview} onChange={(e) => setForm((f) => ({ ...f, allowReview: e.target.checked }))} className="rounded" />
                  Allow review
                </label>
              </div>

              {/* Proctoring */}
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Proctoring</p>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={form.requiresProctoring}
                    onChange={(e) => setForm((f) => ({ ...f, requiresProctoring: e.target.checked }))}
                    className="rounded"
                  />
                  <span>
                    <strong>Require proctoring</strong>
                    <span className="text-slate-500 font-normal"> — camera monitoring + tab-switch limits enforced</span>
                  </span>
                </label>
                {form.requiresProctoring && (
                  <div className="max-w-xs">
                    <Label>Tab switch limit (auto-terminate after)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        value={form.tabSwitchLimit}
                        onChange={(e) => setForm((f) => ({ ...f, tabSwitchLimit: e.target.value }))}
                        className="w-20"
                      />
                      <span className="text-sm text-slate-500">violations</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1" onClick={createPaper} disabled={saving}>{saving ? "Saving…" : "Create Paper"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
