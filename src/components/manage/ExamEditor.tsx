"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft, Plus, Trash2, ChevronDown, ChevronRight,
  GripVertical, Shield, ShieldOff, Save, Eye, EyeOff,
  FileText, CheckCircle2, AlignLeft, Hash, Pencil, Sparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";

/* ── Types ──────────────────────────────────────────────────────────────── */

type QuestionOption = { id: string; text: string; isCorrect: boolean };

type Question = {
  id: string;
  type: string;
  text: string;
  marks: number;
  options: string | null; // JSON: [{id, text, isCorrect}]
  correctAnswer: string | null;
  explanation: string | null;
  domain: string | null;
  difficulty: string | null;
};

type Section = {
  id: string;
  title: string;
  instructions: string | null;
  order: number;
  questions: Question[];
};

type Paper = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  durationMins: number;
  passMark: number;
  totalMarks: number;
  randomiseQuestions: boolean;
  randomiseOptions: boolean;
  allowReview: boolean;
  requiresProctoring: boolean;
  tabSwitchLimit: number;
  isActive: boolean;
  scheme: { id: string; name: string; code: string } | null;
  sections: Section[];
};

type Scheme = { id: string; name: string; code: string };

const QUESTION_TYPES = [
  { value: "mcq_single", label: "MCQ — Single answer" },
  { value: "mcq_multi", label: "MCQ — Multiple answers" },
  { value: "true_false", label: "True / False" },
  { value: "essay", label: "Essay (manual grading)" },
  { value: "fill_blank", label: "Fill in the blank" },
];

const DIFFICULTIES = ["easy", "medium", "hard"];

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function parseOptions(raw: string | null): QuestionOption[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as QuestionOption[]; } catch { return []; }
}

function newOption(): QuestionOption {
  return { id: crypto.randomUUID(), text: "", isCorrect: false };
}

/* ── AI Generate Modal ───────────────────────────────────────────────────── */

function AIGenerateModal({
  paperId,
  sectionId,
  sectionTitle,
  onGenerated,
  onClose,
}: {
  paperId: string;
  sectionId: string;
  sectionTitle: string;
  onGenerated: (questions: Question[]) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ topic: "", count: "5", type: "mcq_single", difficulty: "medium", domain: "" });
  const [generating, setGenerating] = useState(false);

  async function generate() {
    if (!form.topic.trim()) { toast.error("Topic is required"); return; }
    setGenerating(true);
    try {
      const res = await fetch(`/api/manage/exams/${paperId}/questions/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, topic: form.topic, count: parseInt(form.count) || 5, type: form.type, difficulty: form.difficulty, domain: form.domain || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      toast.success(`${data.count} questions generated!`);
      onGenerated(data.questions as Question[]);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-slate-900">AI Question Generator</h2>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Section: <strong>{sectionTitle}</strong></p>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Topic / Subject *</Label>
            <Input value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} placeholder="e.g. Risk Assessment Principles" className="mt-1 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Question Type</Label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                {QUESTION_TYPES.map((qt) => <option key={qt.value} value={qt.value}>{qt.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Number of Questions</Label>
              <select value={form.count} onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                {["3", "5", "10", "15", "20"].map((n) => <option key={n} value={n}>{n} questions</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Difficulty</Label>
              <select value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Domain (optional)</Label>
              <Input value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} placeholder="e.g. ISO 45001" className="mt-1 h-8 text-xs" />
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1">Cancel</Button>
          <Button size="sm" onClick={generate} disabled={generating} className="flex-1 gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> {generating ? "Generating…" : "Generate"}
          </Button>
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-3">Powered by Claude AI · Review all generated questions before use</p>
      </div>
    </div>
  );
}

/* ── Inline question editor (edit mode) ─────────────────────────────────── */

function QuestionEditInline({
  question,
  paperId,
  onSaved,
  onCancel,
}: {
  question: Question;
  paperId: string;
  onSaved: (q: Question) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: question.type,
    text: question.text,
    marks: String(question.marks),
    difficulty: question.difficulty ?? "medium",
    domain: question.domain ?? "",
    explanation: question.explanation ?? "",
    correctAnswer: question.correctAnswer ?? "",
  });
  const [options, setOptions] = useState<QuestionOption[]>(parseOptions(question.options).length > 0
    ? parseOptions(question.options)
    : [newOption(), newOption()]);

  function addOption() { setOptions((o) => [...o, newOption()]); }
  function removeOption(id: string) { setOptions((o) => o.filter((x) => x.id !== id)); }
  function updateOption(id: string, field: keyof QuestionOption, value: string | boolean) {
    setOptions((prev) => prev.map((o) => o.id === id ? { ...o, [field]: value } : o));
  }
  function toggleCorrect(id: string) {
    const isMulti = form.type === "mcq_multi";
    setOptions((prev) => prev.map((o) =>
      o.id === id ? { ...o, isCorrect: !o.isCorrect } : isMulti ? o : { ...o, isCorrect: false }
    ));
  }

  const hasOptions = ["mcq_single", "mcq_multi", "true_false"].includes(form.type);

  async function save() {
    if (!form.text.trim()) { toast.error("Question text is required"); return; }
    setSaving(true);
    try {
      const body = {
        type: form.type,
        text: form.text,
        marks: parseInt(form.marks) || 1,
        difficulty: form.difficulty || null,
        domain: form.domain || null,
        explanation: form.explanation || null,
        correctAnswer: hasOptions ? null : form.correctAnswer || null,
        options: hasOptions ? options : [],
      };
      const res = await fetch(`/api/manage/exams/${paperId}/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Question updated");
      onSaved(data.question as Question);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-primary/30 rounded-xl p-4 bg-primary/5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Pencil className="w-4 h-4 text-primary" />
        <p className="font-semibold text-sm text-slate-800">Edit Question</p>
        <button onClick={onCancel} className="ml-auto text-slate-400 hover:text-slate-600 text-xs">Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Type</Label>
          <select value={form.type} onChange={(e) => {
            const t = e.target.value;
            setForm((f) => ({ ...f, type: t }));
            if (t === "true_false") setOptions([
              { id: crypto.randomUUID(), text: "True", isCorrect: false },
              { id: crypto.randomUUID(), text: "False", isCorrect: false },
            ]);
          }} className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white">
            {QUESTION_TYPES.map((qt) => <option key={qt.value} value={qt.value}>{qt.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Marks</Label>
            <Input type="number" min="1" className="mt-1 h-8 text-xs" value={form.marks} onChange={(e) => setForm((f) => ({ ...f, marks: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Difficulty</Label>
            <select value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white h-8">
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs">Question Text *</Label>
        <textarea rows={3} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>

      {hasOptions && (
        <div>
          <Label className="text-xs mb-2 block">Answer Options
            {form.type === "mcq_multi" && <span className="text-slate-400 font-normal ml-1">(check all correct)</span>}
            {(form.type === "mcq_single" || form.type === "true_false") && <span className="text-slate-400 font-normal ml-1">(select one correct)</span>}
          </Label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={opt.id} className="flex items-center gap-2">
                <button type="button" onClick={() => toggleCorrect(opt.id)} className={cn("w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition", opt.isCorrect ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-emerald-400")}>
                  {opt.isCorrect && <CheckCircle2 className="w-3 h-3 text-white" />}
                </button>
                <Input value={opt.text} onChange={(e) => updateOption(opt.id, "text", e.target.value)} placeholder={`Option ${i + 1}`} className="h-8 text-xs flex-1" disabled={form.type === "true_false"} />
                {form.type !== "true_false" && <button onClick={() => removeOption(opt.id)} className="text-slate-300 hover:text-red-400 transition shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>}
              </div>
            ))}
            {form.type !== "true_false" && <button onClick={addOption} className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add option</button>}
          </div>
        </div>
      )}

      {!hasOptions && form.type !== "essay" && (
        <div>
          <Label className="text-xs">Correct Answer</Label>
          <Input value={form.correctAnswer} onChange={(e) => setForm((f) => ({ ...f, correctAnswer: e.target.value }))} className="mt-1 h-8 text-xs" placeholder="Expected answer" />
        </div>
      )}

      {form.type === "essay" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          Essay questions are manually graded by an Examiner after submission. No auto-scoring.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Domain / Topic (optional)</Label>
          <Input value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} className="mt-1 h-8 text-xs" placeholder="e.g. Risk Management" />
        </div>
        <div>
          <Label className="text-xs">Explanation (optional)</Label>
          <Input value={form.explanation} onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))} className="mt-1 h-8 text-xs" placeholder="Shown after grading" />
        </div>
      </div>

      <Button size="sm" onClick={save} disabled={saving} className="w-full gap-1.5">
        <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save Changes"}
      </Button>
    </div>
  );
}

/* ── Question editor ─────────────────────────────────────────────────────── */

function QuestionForm({
  sectionId,
  paperId,
  onCreated,
}: {
  sectionId: string;
  paperId: string;
  onCreated: (q: Question) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: "mcq_single",
    text: "",
    marks: "1",
    difficulty: "medium",
    domain: "",
    explanation: "",
    correctAnswer: "",
  });
  const [options, setOptions] = useState<QuestionOption[]>([newOption(), newOption()]);

  function addOption() { setOptions((o) => [...o, newOption()]); }
  function removeOption(id: string) { setOptions((o) => o.filter((x) => x.id !== id)); }
  function updateOption(id: string, field: keyof QuestionOption, value: string | boolean) {
    setOptions((prev) => prev.map((o) => o.id === id ? { ...o, [field]: value } : o));
  }
  function toggleCorrect(id: string) {
    const isMulti = form.type === "mcq_multi";
    setOptions((prev) => prev.map((o) =>
      o.id === id ? { ...o, isCorrect: !o.isCorrect } : isMulti ? o : { ...o, isCorrect: false }
    ));
  }

  async function save() {
    if (!form.text.trim()) { toast.error("Question text is required"); return; }
    setSaving(true);
    try {
      const hasOptions = ["mcq_single", "mcq_multi", "true_false"].includes(form.type);
      const body = {
        sectionId,
        type: form.type,
        text: form.text,
        marks: parseInt(form.marks) || 1,
        difficulty: form.difficulty || null,
        domain: form.domain || null,
        explanation: form.explanation || null,
        correctAnswer: hasOptions ? null : form.correctAnswer || null,
        options: hasOptions ? options : [],
      };
      const res = await fetch(`/api/manage/exams/${paperId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Question added");
      onCreated(data.question);
      setOpen(false);
      setForm({ type: "mcq_single", text: "", marks: "1", difficulty: "medium", domain: "", explanation: "", correctAnswer: "" });
      setOptions([newOption(), newOption()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const hasOptions = ["mcq_single", "mcq_multi", "true_false"].includes(form.type);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 text-sm text-slate-400 hover:border-primary/40 hover:text-primary transition flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" /> Add Question
      </button>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="w-4 h-4 text-primary" />
        <p className="font-semibold text-sm text-slate-800">New Question</p>
        <button onClick={() => setOpen(false)} className="ml-auto text-slate-400 hover:text-slate-600 text-xs">Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Type</Label>
          <select
            value={form.type}
            onChange={(e) => {
              const t = e.target.value;
              setForm((f) => ({ ...f, type: t }));
              if (t === "true_false") setOptions([
                { id: crypto.randomUUID(), text: "True", isCorrect: false },
                { id: crypto.randomUUID(), text: "False", isCorrect: false },
              ]);
            }}
            className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
          >
            {QUESTION_TYPES.map((qt) => <option key={qt.value} value={qt.value}>{qt.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Marks</Label>
            <Input type="number" min="1" className="mt-1 h-8 text-xs" value={form.marks} onChange={(e) => setForm((f) => ({ ...f, marks: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Difficulty</Label>
            <select value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white h-8">
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs">Question Text *</Label>
        <textarea
          rows={3}
          value={form.text}
          onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
          className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Enter the question…"
        />
      </div>

      {/* Options for MCQ / True-False */}
      {hasOptions && (
        <div>
          <Label className="text-xs mb-2 block">
            Answer Options
            {form.type === "mcq_multi" && <span className="text-slate-400 font-normal ml-1">(check all correct answers)</span>}
            {(form.type === "mcq_single" || form.type === "true_false") && <span className="text-slate-400 font-normal ml-1">(select one correct)</span>}
          </Label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={opt.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleCorrect(opt.id)}
                  title="Mark as correct"
                  className={cn(
                    "w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition",
                    opt.isCorrect ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-emerald-400"
                  )}
                >
                  {opt.isCorrect && <CheckCircle2 className="w-3 h-3 text-white" />}
                </button>
                <Input
                  value={opt.text}
                  onChange={(e) => updateOption(opt.id, "text", e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  className="h-8 text-xs flex-1"
                  disabled={form.type === "true_false"}
                />
                {form.type !== "true_false" && (
                  <button onClick={() => removeOption(opt.id)} className="text-slate-300 hover:text-red-400 transition shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {form.type !== "true_false" && (
              <button onClick={addOption} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add option
              </button>
            )}
          </div>
        </div>
      )}

      {/* Correct answer for non-option types */}
      {!hasOptions && form.type !== "essay" && (
        <div>
          <Label className="text-xs">Correct Answer</Label>
          <Input value={form.correctAnswer} onChange={(e) => setForm((f) => ({ ...f, correctAnswer: e.target.value }))} className="mt-1 h-8 text-xs" placeholder="Expected answer" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Domain / Topic (optional)</Label>
          <Input value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} className="mt-1 h-8 text-xs" placeholder="e.g. Risk Management" />
        </div>
        <div>
          <Label className="text-xs">Explanation (optional)</Label>
          <Input value={form.explanation} onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))} className="mt-1 h-8 text-xs" placeholder="Shown after grading" />
        </div>
      </div>

      <Button size="sm" onClick={save} disabled={saving} className="w-full gap-1.5">
        <Plus className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Add Question"}
      </Button>
    </div>
  );
}

/* ── Main ExamEditor ─────────────────────────────────────────────────────── */

export default function ExamEditor({
  paper: initialPaper,
  schemes,
}: {
  paper: Paper;
  schemes: Scheme[];
}) {
  const router = useRouter();
  const [paper, setPaper] = useState(initialPaper);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(initialPaper.sections.map((s) => s.id)));
  const [activeTab, setActiveTab] = useState<"questions" | "settings">("questions");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aiModal, setAiModal] = useState<{ sectionId: string; sectionTitle: string } | null>(null);

  // Settings form state (derived from paper)
  const [settings, setSettings] = useState({
    title: paper.title,
    description: paper.description ?? "",
    instructions: paper.instructions ?? "",
    durationMins: String(paper.durationMins),
    passMark: String(paper.passMark),
    totalMarks: String(paper.totalMarks),
    requiresProctoring: paper.requiresProctoring,
    tabSwitchLimit: String(paper.tabSwitchLimit),
    randomiseQuestions: paper.randomiseQuestions,
    randomiseOptions: paper.randomiseOptions,
    allowReview: paper.allowReview,
    schemeId: paper.scheme?.id ?? "",
  });

  const totalQuestions = paper.sections.reduce((s, sec) => s + sec.questions.length, 0);

  function toggleSection(id: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Add Section ─────────────────────────────────────────────────────────
  async function addSection() {
    try {
      const res = await fetch(`/api/manage/exams/${paper.id}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Section ${paper.sections.length + 1}`, order: paper.sections.length }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const newSection: Section = { ...data.section, questions: [] };
      setPaper((p) => ({ ...p, sections: [...p.sections, newSection] }));
      setExpandedSections((prev) => new Set([...prev, newSection.id]));
      toast.success("Section added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  // ── Delete Section ──────────────────────────────────────────────────────
  async function deleteSection(sectionId: string) {
    if (!confirm("Delete this section and all its questions?")) return;
    try {
      const res = await fetch(`/api/manage/exams/${paper.id}/sections/${sectionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setPaper((p) => ({ ...p, sections: p.sections.filter((s) => s.id !== sectionId) }));
      toast.success("Section deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  // ── Rename Section ──────────────────────────────────────────────────────
  async function renameSection(sectionId: string, title: string) {
    try {
      await fetch(`/api/manage/exams/${paper.id}/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } catch { /* silent */ }
    setPaper((p) => ({
      ...p,
      sections: p.sections.map((s) => s.id === sectionId ? { ...s, title } : s),
    }));
  }

  // ── Update Question ─────────────────────────────────────────────────────
  function updateQuestion(sectionId: string, updated: Question) {
    setPaper((p) => ({
      ...p,
      sections: p.sections.map((s) =>
        s.id === sectionId ? { ...s, questions: s.questions.map((q) => q.id === updated.id ? updated : q) } : s
      ),
    }));
    setEditingId(null);
  }

  // ── Delete Question ─────────────────────────────────────────────────────
  async function deleteQuestion(sectionId: string, questionId: string) {
    try {
      const res = await fetch(`/api/manage/exams/${paper.id}/questions/${questionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setPaper((p) => ({
        ...p,
        sections: p.sections.map((s) =>
          s.id === sectionId ? { ...s, questions: s.questions.filter((q) => q.id !== questionId) } : s
        ),
      }));
      toast.success("Question deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  // ── Save Settings ───────────────────────────────────────────────────────
  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch(`/api/manage/exams/${paper.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          durationMins: parseInt(settings.durationMins) || 120,
          passMark: parseInt(settings.passMark) || 70,
          totalMarks: parseInt(settings.totalMarks) || 100,
          tabSwitchLimit: parseInt(settings.tabSwitchLimit) || 3,
          schemeId: settings.schemeId || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Settings saved");
      setPaper((p) => ({
        ...p,
        title: settings.title,
        description: settings.description || null,
        requiresProctoring: settings.requiresProctoring,
        tabSwitchLimit: parseInt(settings.tabSwitchLimit) || 3,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle Active ───────────────────────────────────────────────────────
  async function toggleActive() {
    try {
      const res = await fetch(`/api/manage/exams/${paper.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !paper.isActive }),
      });
      if (!res.ok) throw new Error();
      setPaper((p) => ({ ...p, isActive: !p.isActive }));
      toast.success(paper.isActive ? "Paper deactivated" : "Paper activated");
    } catch {
      toast.error("Failed to update status");
    }
  }

  const typeLabel = (t: string) => QUESTION_TYPES.find((qt) => qt.value === t)?.label ?? t;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/manage/exams">
          <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500">
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 truncate">{paper.title}</h1>
            {paper.isActive ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-0">Active</Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-500 border-0">Inactive</Badge>
            )}
            {paper.requiresProctoring
              ? <Badge className="bg-blue-100 text-blue-700 border-0 gap-1"><Shield className="w-3 h-3" /> Proctored</Badge>
              : <Badge className="bg-slate-100 text-slate-500 border-0 gap-1"><ShieldOff className="w-3 h-3" /> No proctoring</Badge>
            }
          </div>
          <p className="text-slate-500 text-sm mt-0.5">
            {totalQuestions} questions · {paper.sections.length} sections · {paper.durationMins} min · Pass: {paper.passMark}%
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleActive}
          className={cn(paper.isActive ? "text-red-600 border-red-200 hover:bg-red-50" : "text-emerald-600 border-emerald-200 hover:bg-emerald-50")}
        >
          {paper.isActive ? <><EyeOff className="w-3.5 h-3.5 mr-1.5" /> Deactivate</> : <><Eye className="w-3.5 h-3.5 mr-1.5" /> Activate</>}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-1">
        {(["questions", "settings"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition border-b-2 -mb-px",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {tab === "questions" ? `Questions (${totalQuestions})` : "Settings"}
          </button>
        ))}
      </div>

      {/* ── Questions tab ── */}
      {activeTab === "questions" && (
        <div className="space-y-4">
          {paper.sections.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center">
              <FileText className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <p className="text-slate-500 text-sm mb-4">No sections yet. Add a section to start adding questions.</p>
              <Button onClick={addSection} className="gap-2"><Plus className="w-4 h-4" /> Add First Section</Button>
            </div>
          )}

          {paper.sections.map((section) => (
            <div key={section.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Section header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => renameSection(section.id, e.target.value)}
                  className="flex-1 bg-transparent font-semibold text-slate-800 text-sm focus:outline-none border-b border-transparent focus:border-primary"
                />
                <span className="text-xs text-slate-400 shrink-0">{section.questions.length} questions</span>
                <button
                  onClick={() => setAiModal({ sectionId: section.id, sectionTitle: section.title })}
                  className="text-slate-400 hover:text-primary transition shrink-0 flex items-center gap-1 text-xs font-medium"
                  title="AI Generate questions"
                >
                  <Sparkles className="w-3.5 h-3.5" /> AI
                </button>
                <button
                  onClick={() => deleteSection(section.id)}
                  className="text-slate-300 hover:text-red-400 transition shrink-0"
                  title="Delete section"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleSection(section.id)}
                  className="text-slate-400 hover:text-slate-600 transition shrink-0"
                >
                  {expandedSections.has(section.id)
                    ? <ChevronDown className="w-4 h-4" />
                    : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>

              {/* Questions */}
              {expandedSections.has(section.id) && (
                <div className="p-4 space-y-3">
                  {section.questions.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">No questions in this section yet.</p>
                  )}

                  {section.questions.map((q, i) => {
                    if (editingId === q.id) {
                      return (
                        <QuestionEditInline
                          key={q.id}
                          question={q}
                          paperId={paper.id}
                          onSaved={(updated) => updateQuestion(section.id, updated)}
                          onCancel={() => setEditingId(null)}
                        />
                      );
                    }
                    const opts = parseOptions(q.options);
                    const correctOpts = opts.filter((o) => o.isCorrect).map((o) => o.text);
                    return (
                      <div key={q.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition bg-white group">
                        <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 leading-relaxed">{q.text}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge className="text-[10px] bg-slate-100 text-slate-500 border-0">
                              {q.type === "mcq_single" && <Hash className="w-2.5 h-2.5 mr-1" />}
                              {q.type === "essay" && <AlignLeft className="w-2.5 h-2.5 mr-1" />}
                              {typeLabel(q.type)}
                            </Badge>
                            <span className="text-[10px] text-slate-400">{q.marks} mark{q.marks !== 1 ? "s" : ""}</span>
                            {q.difficulty && <span className="text-[10px] text-slate-400 capitalize">{q.difficulty}</span>}
                            {correctOpts.length > 0 && (
                              <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                {correctOpts.join(" / ")}
                              </span>
                            )}
                            {q.type === "essay" && (
                              <span className="text-[10px] text-amber-600">Manual grading</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                          <button
                            onClick={() => setEditingId(q.id)}
                            className="text-slate-300 hover:text-primary transition"
                            title="Edit question"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteQuestion(section.id, q.id)}
                            className="text-slate-200 hover:text-red-400 transition"
                            title="Delete question"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add question form */}
                  <QuestionForm
                    sectionId={section.id}
                    paperId={paper.id}
                    onCreated={(q) => setPaper((p) => ({
                      ...p,
                      sections: p.sections.map((s) =>
                        s.id === section.id ? { ...s, questions: [...s.questions, q] } : s
                      ),
                    }))}
                  />
                </div>
              )}
            </div>
          ))}

          {paper.sections.length > 0 && (
            <Button variant="outline" onClick={addSection} className="gap-2 w-full border-dashed">
              <Plus className="w-4 h-4" /> Add Section
            </Button>
          )}
        </div>
      )}

      {/* AI Generate Modal */}
      {aiModal && (
        <AIGenerateModal
          paperId={paper.id}
          sectionId={aiModal.sectionId}
          sectionTitle={aiModal.sectionTitle}
          onGenerated={(questions) => {
            setPaper((p) => ({
              ...p,
              sections: p.sections.map((s) =>
                s.id === aiModal.sectionId ? { ...s, questions: [...s.questions, ...questions] } : s
              ),
            }));
          }}
          onClose={() => setAiModal(null)}
        />
      )}

      {/* ── Settings tab ── */}
      {activeTab === "settings" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5 max-w-2xl">
          <div>
            <Label>Title *</Label>
            <Input className="mt-1" value={settings.title} onChange={(e) => setSettings((s) => ({ ...s, title: e.target.value }))} />
          </div>
          <div>
            <Label>Description</Label>
            <textarea rows={2} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" value={settings.description} onChange={(e) => setSettings((s) => ({ ...s, description: e.target.value }))} />
          </div>
          <div>
            <Label>Instructions (shown to candidates before exam)</Label>
            <textarea rows={3} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" value={settings.instructions} onChange={(e) => setSettings((s) => ({ ...s, instructions: e.target.value }))} />
          </div>

          <div>
            <Label>Certification Scheme</Label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={settings.schemeId} onChange={(e) => setSettings((s) => ({ ...s, schemeId: e.target.value }))}>
              <option value="">None</option>
              {schemes.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div><Label>Duration (mins)</Label><Input type="number" min="15" className="mt-1" value={settings.durationMins} onChange={(e) => setSettings((s) => ({ ...s, durationMins: e.target.value }))} /></div>
            <div><Label>Pass Mark (%)</Label><Input type="number" min="0" max="100" className="mt-1" value={settings.passMark} onChange={(e) => setSettings((s) => ({ ...s, passMark: e.target.value }))} /></div>
            <div><Label>Total Marks</Label><Input type="number" min="1" className="mt-1" value={settings.totalMarks} onChange={(e) => setSettings((s) => ({ ...s, totalMarks: e.target.value }))} /></div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={settings.randomiseQuestions} onChange={(e) => setSettings((s) => ({ ...s, randomiseQuestions: e.target.checked }))} className="rounded" />
              Randomise questions
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={settings.randomiseOptions} onChange={(e) => setSettings((s) => ({ ...s, randomiseOptions: e.target.checked }))} className="rounded" />
              Randomise options
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={settings.allowReview} onChange={(e) => setSettings((s) => ({ ...s, allowReview: e.target.checked }))} className="rounded" />
              Allow question review
            </label>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Proctoring</p>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mb-3">
              <input type="checkbox" checked={settings.requiresProctoring} onChange={(e) => setSettings((s) => ({ ...s, requiresProctoring: e.target.checked }))} className="rounded" />
              <span><strong>Require proctoring</strong><span className="text-slate-400 font-normal"> — camera monitoring and tab-switch limits enforced</span></span>
            </label>
            {settings.requiresProctoring && (
              <div className="flex items-center gap-3">
                <Label className="shrink-0">Auto-terminate after</Label>
                <Input type="number" min="1" max="10" className="w-20" value={settings.tabSwitchLimit} onChange={(e) => setSettings((s) => ({ ...s, tabSwitchLimit: e.target.value }))} />
                <span className="text-sm text-slate-500">tab switch violations</span>
              </div>
            )}
          </div>

          <Button onClick={saveSettings} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      )}
    </div>
  );
}
