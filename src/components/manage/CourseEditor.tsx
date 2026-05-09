"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen, Plus, ChevronDown, ChevronRight, Trash2, Edit2, Save,
  Video, FileText, FileArchive, Type, Upload, ExternalLink, Eye, EyeOff,
  ArrowLeft, Globe, Lock, Settings2, GripVertical,
  Sparkles, AlertTriangle, CheckCircle2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Lesson = {
  id: string;
  title: string;
  contentType: string;
  contentUrl: string | null;
  contentData: string | null;
  durationMins: number | null;
  isPreview: boolean;
  order: number;
  scormPackage: { id: string; title: string } | null;
};

type Module = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  lessons: Lesson[];
};

type Course = {
  id: string;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  status: string;
  price: number;
  currency: string;
  cpdHours: number;
  durationHours: number | null;
  minProgressToExam: number;
  thumbnailUrl: string | null;
  scheme: { id: string; name: string; code: string } | null;
  modules: Module[];
};

type ScormPackage = { id: string; title: string; version: string };
type Scheme = { id: string; name: string; code: string };

const CONTENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  video: { label: "Video", icon: Video, color: "bg-red-100 text-red-600" },
  pdf: { label: "PDF", icon: FileText, color: "bg-orange-100 text-orange-600" },
  text: { label: "Text", icon: Type, color: "bg-blue-100 text-blue-600" },
  scorm: { label: "SCORM", icon: FileArchive, color: "bg-purple-100 text-purple-600" },
  live_session: { label: "Live Session", icon: Video, color: "bg-indigo-100 text-indigo-600" },
};

export default function CourseEditor({
  course: initial,
  schemes,
  scormPackages,
}: {
  course: Course;
  schemes: Scheme[];
  scormPackages: ScormPackage[];
}) {
  const router = useRouter();
  const [course, setCourse] = useState(initial);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(initial.modules.map((m) => m.id)));
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "settings">("content");

  // Modals
  const [addModuleOpen, setAddModuleOpen] = useState(false);
  const [addLessonModuleId, setAddLessonModuleId] = useState<string | null>(null);
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);
  const [editModule, setEditModule] = useState<Module | null>(null);

  // Settings form state (mirrors course metadata)
  const [settings, setSettings] = useState({
    title: course.title,
    shortDescription: course.shortDescription,
    description: course.description,
    price: String(course.price),
    currency: course.currency,
    cpdHours: String(course.cpdHours),
    durationHours: course.durationHours ? String(course.durationHours) : "",
    minProgressToExam: String(course.minProgressToExam),
    thumbnailUrl: course.thumbnailUrl ?? "",
  });

  // Warn before leaving with unsaved settings changes
  const savedSettings = useRef(settings);
  const settingsDirty =
    settings.title !== savedSettings.current.title ||
    settings.shortDescription !== savedSettings.current.shortDescription ||
    settings.description !== savedSettings.current.description ||
    settings.price !== savedSettings.current.price ||
    settings.thumbnailUrl !== savedSettings.current.thumbnailUrl;

  useEffect(() => {
    if (!settingsDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [settingsDirty]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function toggleModule(id: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ─── Module Actions ──────────────────────────────────────────────────────────

  async function addModule(title: string) {
    if (!title.trim()) return;
    try {
      const res = await fetch(`/api/manage/courses/${course.id}/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const mod = await res.json();
      setCourse((c) => ({ ...c, modules: [...c.modules, { ...mod, lessons: [] }] }));
      setExpandedModules((prev) => new Set([...prev, mod.id]));
      setAddModuleOpen(false);
      toast.success("Module added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function updateModule(moduleId: string, title: string) {
    try {
      const res = await fetch(`/api/manage/courses/${course.id}/modules/${moduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setCourse((c) => ({
        ...c,
        modules: c.modules.map((m) => (m.id === moduleId ? { ...m, title } : m)),
      }));
      setEditModule(null);
      toast.success("Module updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function deleteModule(moduleId: string) {
    if (!confirm("Delete this module and all its lessons?")) return;
    try {
      const res = await fetch(`/api/manage/courses/${course.id}/modules/${moduleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setCourse((c) => ({ ...c, modules: c.modules.filter((m) => m.id !== moduleId) }));
      toast.success("Module deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  // ─── Lesson Actions ──────────────────────────────────────────────────────────

  async function addLesson(moduleId: string, data: Partial<Lesson> & { title: string; contentType: string; scormPackageId?: string }) {
    try {
      const res = await fetch(`/api/manage/courses/${course.id}/modules/${moduleId}/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const lesson = await res.json();
      setCourse((c) => ({
        ...c,
        modules: c.modules.map((m) =>
          m.id === moduleId ? { ...m, lessons: [...m.lessons, lesson] } : m
        ),
      }));
      setAddLessonModuleId(null);
      toast.success("Lesson added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function updateLesson(lessonId: string, data: Partial<Lesson>) {
    try {
      const res = await fetch(`/api/manage/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const updated = await res.json();
      setCourse((c) => ({
        ...c,
        modules: c.modules.map((m) => ({
          ...m,
          lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, ...updated } : l)),
        })),
      }));
      setEditLesson(null);
      toast.success("Lesson updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function deleteLesson(moduleId: string, lessonId: string) {
    if (!confirm("Delete this lesson?")) return;
    try {
      const res = await fetch(`/api/manage/lessons/${lessonId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setCourse((c) => ({
        ...c,
        modules: c.modules.map((m) =>
          m.id === moduleId ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) } : m
        ),
      }));
      toast.success("Lesson deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  // ─── Publish / Unpublish ─────────────────────────────────────────────────────

  async function togglePublish() {
    const newStatus = course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    setSaving(true);
    try {
      const res = await fetch(`/api/manage/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setCourse((c) => ({ ...c, status: newStatus }));
      toast.success(newStatus === "PUBLISHED" ? "Course published" : "Course unpublished");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  // ─── Save Settings ───────────────────────────────────────────────────────────

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch(`/api/manage/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: settings.title,
          shortDescription: settings.shortDescription || null,
          description: settings.description || null,
          price: parseFloat(settings.price) || 0,
          currency: settings.currency,
          cpdHours: parseFloat(settings.cpdHours) || 0,
          durationHours: settings.durationHours ? parseFloat(settings.durationHours) : null,
          minProgressToExam: parseInt(settings.minProgressToExam) || 80,
          thumbnailUrl: settings.thumbnailUrl || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const updated = await res.json();
      setCourse((c) => ({ ...c, ...updated }));
      savedSettings.current = settings;
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const totalLessons = course.modules.reduce((s, m) => s + m.lessons.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.push("/manage/courses")}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">{course.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge className={cn("border-0 text-[10px]", course.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                {course.status === "PUBLISHED" ? <><Globe className="w-2.5 h-2.5 inline mr-1" />Published</> : <><Lock className="w-2.5 h-2.5 inline mr-1" />Draft</>}
              </Badge>
              {course.scheme && (
                <Badge className="bg-primary/10 text-primary border-0 text-[10px]">{course.scheme.code}</Badge>
              )}
              <span className="text-xs text-slate-400">{course.modules.length} modules · {totalLessons} lessons</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => router.push(`/courses/${course.slug}`)} className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> Preview
          </Button>
          <Button
            size="sm"
            onClick={togglePublish}
            disabled={saving}
            className={cn("gap-1.5", course.status === "PUBLISHED" ? "bg-amber-500 hover:bg-amber-600" : "")}
          >
            {course.status === "PUBLISHED" ? <><Lock className="w-3.5 h-3.5" /> Unpublish</> : <><Globe className="w-3.5 h-3.5" /> Publish</>}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(["content", "settings"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-lg transition capitalize",
              activeTab === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {tab === "content" ? "Course Content" : "Settings"}
          </button>
        ))}
      </div>

      {/* Content Tab */}
      {activeTab === "content" && (
        <div className="space-y-3">
          {course.modules.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 border-dashed p-12 text-center">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <p className="font-semibold text-slate-700">No modules yet</p>
              <p className="text-sm text-slate-400 mt-1">Add your first module to get started</p>
              <Button className="mt-4 gap-2" onClick={() => setAddModuleOpen(true)}>
                <Plus className="w-4 h-4" /> Add Module
              </Button>
            </div>
          ) : (
            <>
              {course.modules.map((mod) => {
                const expanded = expandedModules.has(mod.id);
                return (
                  <div key={mod.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Module header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                      <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
                      <button
                        type="button"
                        className="flex-1 flex items-center gap-2 text-left min-w-0"
                        onClick={() => toggleModule(mod.id)}
                      >
                        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                        <span className="font-semibold text-slate-900 text-sm truncate">{mod.title}</span>
                        <span className="text-xs text-slate-400 shrink-0">{mod.lessons.length} lesson{mod.lessons.length !== 1 ? "s" : ""}</span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditModule(mod)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                          title="Edit module"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteModule(mod.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Delete module"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Lessons */}
                    {expanded && (
                      <div>
                        {mod.lessons.length === 0 ? (
                          <div className="px-4 py-6 text-center text-sm text-slate-400">
                            No lessons yet
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-50">
                            {mod.lessons.map((lesson) => {
                              const conf = CONTENT_TYPE_CONFIG[lesson.contentType] ?? CONTENT_TYPE_CONFIG.text;
                              const Icon = conf.icon;
                              return (
                                <div key={lesson.id} className="flex items-center gap-3 px-4 py-2.5">
                                  <GripVertical className="w-4 h-4 text-slate-200 shrink-0" />
                                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", conf.color)}>
                                    <Icon className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-900 truncate">{lesson.title}</p>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                                      <span>{conf.label}</span>
                                      {lesson.durationMins && <span>{lesson.durationMins} min</span>}
                                      {lesson.isPreview && (
                                        <Badge className="bg-blue-100 text-blue-600 border-0 text-[10px] gap-0.5 py-0">
                                          <Eye className="w-2.5 h-2.5" /> Preview
                                        </Badge>
                                      )}
                                      {lesson.contentType === "scorm" && lesson.scormPackage && (
                                        <span className="text-purple-500">→ {lesson.scormPackage.title}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setEditLesson(lesson)}
                                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteLesson(mod.id, lesson.id)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Add lesson button */}
                        <div className="px-4 py-2 border-t border-slate-50">
                          <button
                            type="button"
                            onClick={() => setAddLessonModuleId(mod.id)}
                            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add Lesson
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <Button variant="outline" onClick={() => setAddModuleOpen(true)} className="gap-2 w-full">
                <Plus className="w-4 h-4" /> Add Module
              </Button>
            </>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 max-w-2xl">
          <div><Label>Course Title *</Label><Input className="mt-1" value={settings.title} onChange={(e) => setSettings((s) => ({ ...s, title: e.target.value }))} /></div>
          <div>
            <Label>Short Description</Label>
            <textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" rows={2} value={settings.shortDescription} onChange={(e) => setSettings((s) => ({ ...s, shortDescription: e.target.value }))} />
          </div>
          <div>
            <Label>Full Description</Label>
            <textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" rows={4} value={settings.description} onChange={(e) => setSettings((s) => ({ ...s, description: e.target.value }))} />
          </div>
          <div>
            <Label>Thumbnail URL</Label>
            <Input className="mt-1" placeholder="https://..." value={settings.thumbnailUrl} onChange={(e) => setSettings((s) => ({ ...s, thumbnailUrl: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Price</Label>
              <Input type="number" min="0" step="0.01" className="mt-1" value={settings.price} onChange={(e) => setSettings((s) => ({ ...s, price: e.target.value }))} />
            </div>
            <div>
              <Label>Currency</Label>
              <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={settings.currency} onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value }))}>
                {["NGN", "GHS", "USD", "EUR", "GBP"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>CPD Hours</Label>
              <Input type="number" min="0" step="0.5" className="mt-1" value={settings.cpdHours} onChange={(e) => setSettings((s) => ({ ...s, cpdHours: e.target.value }))} />
            </div>
            <div>
              <Label>Duration (hours)</Label>
              <Input type="number" min="0" step="0.5" className="mt-1" placeholder="optional" value={settings.durationHours} onChange={(e) => setSettings((s) => ({ ...s, durationHours: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Min. Progress to Unlock Exam (%)</Label>
            <Input type="number" min="0" max="100" className="mt-1" value={settings.minProgressToExam} onChange={(e) => setSettings((s) => ({ ...s, minProgressToExam: e.target.value }))} />
          </div>
          <div className="pt-2">
            <Button onClick={saveSettings} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Add Module Modal ─────────────────────────────────────────────────── */}
      {addModuleOpen && <AddModuleModal onAdd={addModule} onClose={() => setAddModuleOpen(false)} />}

      {/* ── Edit Module Modal ────────────────────────────────────────────────── */}
      {editModule && (
        <EditModuleModal
          module={editModule}
          onSave={(title) => updateModule(editModule.id, title)}
          onClose={() => setEditModule(null)}
        />
      )}

      {/* ── Add Lesson Modal ─────────────────────────────────────────────────── */}
      {addLessonModuleId && (
        <LessonModal
          mode="add"
          courseId={course.id}
          scormPackages={scormPackages}
          onSave={(data) => addLesson(addLessonModuleId, data)}
          onClose={() => setAddLessonModuleId(null)}
        />
      )}

      {/* ── Edit Lesson Modal ────────────────────────────────────────────────── */}
      {editLesson && (
        <LessonModal
          mode="edit"
          courseId={course.id}
          lesson={editLesson}
          scormPackages={scormPackages}
          onSave={(data) => updateLesson(editLesson.id, data)}
          onClose={() => setEditLesson(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AddModuleModal({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  return (
    <Modal title="Add Module" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <Label>Module Title *</Label>
          <Input autoFocus className="mt-1" placeholder="e.g. Introduction to ISO 37001" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onAdd(title)} />
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={() => onAdd(title)}>Add Module</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditModuleModal({ module, onSave, onClose }: { module: Module; onSave: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState(module.title);
  return (
    <Modal title="Edit Module" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <Label>Module Title *</Label>
          <Input autoFocus className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={() => onSave(title)}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── AI Content Generation ────────────────────────────────────────────────────

type LessonContent = {
  title: string; introduction: string;
  sections: { heading: string; content: string }[];
  summary: string; keyTakeaways: string[];
};
type ModuleOverviewContent = {
  title: string; overview: string; topics: string[];
  prerequisites: string; estimatedDuration: string;
};
type AssessmentContent = {
  title: string;
  criteria: { id: string; description: string; performance_indicators: string[] }[];
  assessmentMethods: string[]; passingRequirements: string;
};

function generatedContentToHtml(content: Record<string, unknown>, contentType: string): string {
  if (contentType === "lesson") {
    const c = content as LessonContent;
    const sections = (c.sections ?? [])
      .map((s) => `<h2>${s.heading}</h2>\n<p>${s.content}</p>`)
      .join("\n");
    return [
      `<h1>${c.title}</h1>`,
      `<h2>Introduction</h2>\n<p>${c.introduction}</p>`,
      sections,
      `<h2>Summary</h2>\n<p>${c.summary}</p>`,
      `<h2>Key Takeaways</h2>\n<ul>${(c.keyTakeaways ?? []).map((k) => `<li>${k}</li>`).join("")}</ul>`,
    ].join("\n");
  }
  if (contentType === "module_overview") {
    const c = content as ModuleOverviewContent;
    return [
      `<h1>${c.title}</h1>`,
      `<h2>Overview</h2>\n<p>${c.overview}</p>`,
      `<h2>Topics Covered</h2>\n<ul>${(c.topics ?? []).map((t) => `<li>${t}</li>`).join("")}</ul>`,
      `<h2>Prerequisites</h2>\n<p>${c.prerequisites}</p>`,
      `<h2>Estimated Duration</h2>\n<p>${c.estimatedDuration}</p>`,
    ].join("\n");
  }
  if (contentType === "assessment_criteria") {
    const c = content as AssessmentContent;
    const criteria = (c.criteria ?? [])
      .map(
        (cr) =>
          `<h3>${cr.id}: ${cr.description}</h3>\n<ul>${(cr.performance_indicators ?? []).map((pi) => `<li>${pi}</li>`).join("")}</ul>`,
      )
      .join("\n");
    return [
      `<h1>${c.title}</h1>`,
      `<h2>Assessment Criteria</h2>`,
      criteria,
      `<h2>Assessment Methods</h2>\n<ul>${(c.assessmentMethods ?? []).map((m) => `<li>${m}</li>`).join("")}</ul>`,
      `<h2>Passing Requirements</h2>\n<p>${c.passingRequirements}</p>`,
    ].join("\n");
  }
  return JSON.stringify(content, null, 2);
}

function ContentPreview({
  content,
  contentType,
}: {
  content: Record<string, unknown>;
  contentType: string;
}) {
  function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        {children}
      </div>
    );
  }
  if (contentType === "lesson") {
    const c = content as LessonContent;
    return (
      <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50 max-h-64 overflow-y-auto">
        <p className="font-semibold text-slate-900 text-sm">{c.title}</p>
        <Section label="Introduction"><p className="text-xs text-slate-600">{c.introduction}</p></Section>
        {(c.sections ?? []).map((s, i) => (
          <Section key={i} label={s.heading}><p className="text-xs text-slate-600">{s.content}</p></Section>
        ))}
        <Section label="Summary"><p className="text-xs text-slate-600">{c.summary}</p></Section>
        <Section label="Key Takeaways">
          <ul className="list-disc list-inside space-y-0.5">
            {(c.keyTakeaways ?? []).map((k, i) => <li key={i} className="text-xs text-slate-600">{k}</li>)}
          </ul>
        </Section>
      </div>
    );
  }
  if (contentType === "module_overview") {
    const c = content as ModuleOverviewContent;
    return (
      <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50 max-h-64 overflow-y-auto">
        <p className="font-semibold text-slate-900 text-sm">{c.title}</p>
        <Section label="Overview"><p className="text-xs text-slate-600">{c.overview}</p></Section>
        <Section label="Topics Covered">
          <ul className="list-disc list-inside space-y-0.5">
            {(c.topics ?? []).map((t, i) => <li key={i} className="text-xs text-slate-600">{t}</li>)}
          </ul>
        </Section>
        <Section label="Prerequisites"><p className="text-xs text-slate-600">{c.prerequisites}</p></Section>
        <Section label="Estimated Duration"><p className="text-xs text-slate-600">{c.estimatedDuration}</p></Section>
      </div>
    );
  }
  if (contentType === "assessment_criteria") {
    const c = content as AssessmentContent;
    return (
      <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50 max-h-64 overflow-y-auto">
        <p className="font-semibold text-slate-900 text-sm">{c.title}</p>
        <Section label="Criteria">
          {(c.criteria ?? []).map((cr, i) => (
            <div key={i} className="mb-2">
              <p className="text-xs font-medium text-slate-700">{cr.id}: {cr.description}</p>
              <ul className="list-disc list-inside ml-2 space-y-0.5 mt-1">
                {(cr.performance_indicators ?? []).map((pi, j) => <li key={j} className="text-xs text-slate-600">{pi}</li>)}
              </ul>
            </div>
          ))}
        </Section>
        <Section label="Assessment Methods">
          <ul className="list-disc list-inside space-y-0.5">
            {(c.assessmentMethods ?? []).map((m, i) => <li key={i} className="text-xs text-slate-600">{m}</li>)}
          </ul>
        </Section>
        <Section label="Passing Requirements"><p className="text-xs text-slate-600">{c.passingRequirements}</p></Section>
      </div>
    );
  }
  return <pre className="text-xs bg-slate-50 p-3 rounded-lg overflow-auto max-h-48">{JSON.stringify(content, null, 2)}</pre>;
}

function AIContentModal({
  courseId,
  prefillTitle,
  onUse,
  onClose,
}: {
  courseId: string;
  prefillTitle: string;
  onUse: (html: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    moduleTitle: prefillTitle,
    targetAudience: "",
    contentType: "lesson" as "lesson" | "module_overview" | "assessment_criteria",
  });
  const [objectives, setObjectives] = useState<string[]>([""]);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<{ content: Record<string, unknown>; contentType: string } | null>(null);

  function addObjective() { setObjectives((o) => [...o, ""]); }
  function removeObjective(i: number) { setObjectives((o) => o.filter((_, idx) => idx !== i)); }
  function updateObjective(i: number, v: string) {
    setObjectives((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  }

  async function generate() {
    const validObjectives = objectives.filter((o) => o.trim());
    if (!form.moduleTitle.trim()) { toast.error("Title is required"); return; }
    if (!form.targetAudience.trim()) { toast.error("Target audience is required"); return; }
    if (validObjectives.length === 0) { toast.error("At least one learning objective is required"); return; }
    setGenerating(true);
    try {
      const res = await fetch(`/api/manage/courses/${courseId}/generate-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleTitle: form.moduleTitle,
          targetAudience: form.targetAudience,
          learningObjectives: validObjectives,
          contentType: form.contentType,
        }),
      });
      const data = await res.json() as { content: Record<string, unknown>; contentType: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setPreview({ content: data.content, contentType: data.contentType });
      toast.success("Content generated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setGenerating(false);
    }
  }

  function useContent() {
    if (!preview) return;
    onUse(generatedContentToHtml(preview.content, preview.contentType));
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-slate-900">AI Content Generator</h2>
          <button type="button" onClick={onClose} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              AI-generated content requires review before publishing. Edit as needed before adding to your course.
            </p>
          </div>
          {!preview ? (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Module / Lesson Title *</Label>
                <Input
                  className="mt-1 text-sm"
                  value={form.moduleTitle}
                  onChange={(e) => setForm((f) => ({ ...f, moduleTitle: e.target.value }))}
                  placeholder="e.g. Risk Assessment Principles"
                />
              </div>
              <div>
                <Label className="text-xs">Target Audience *</Label>
                <Input
                  className="mt-1 text-sm"
                  value={form.targetAudience}
                  onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value }))}
                  placeholder="e.g. Health & Safety professionals with 2+ years experience"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs">Learning Objectives *</Label>
                  <button
                    type="button"
                    onClick={addObjective}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                <div className="space-y-2">
                  {objectives.map((obj, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        className="text-sm flex-1"
                        value={obj}
                        onChange={(e) => updateObjective(i, e.target.value)}
                        placeholder={`Objective ${i + 1}`}
                      />
                      {objectives.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeObjective(i)}
                          className="p-2 text-slate-400 hover:text-red-500 transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Content Type</Label>
                <select
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.contentType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contentType: e.target.value as typeof f.contentType }))
                  }
                >
                  <option value="lesson">Full Lesson</option>
                  <option value="module_overview">Module Overview</option>
                  <option value="assessment_criteria">Assessment Criteria</option>
                </select>
              </div>
              <Button onClick={generate} disabled={generating} className="w-full gap-2">
                <Sparkles className="w-4 h-4" />
                {generating ? "Generating… (15–30 seconds)" : "Generate Content"}
              </Button>
              <p className="text-[10px] text-slate-400 text-center">
                Powered by Claude AI · Review all generated content before publishing
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <ContentPreview content={preview.content} contentType={preview.contentType} />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPreview(null)}>
                  Regenerate
                </Button>
                <Button className="flex-1 gap-2" onClick={useContent}>
                  <CheckCircle2 className="w-4 h-4" /> Use this content
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonModal({
  mode,
  courseId,
  lesson,
  scormPackages,
  onSave,
  onClose,
}: {
  mode: "add" | "edit";
  courseId: string;
  lesson?: Lesson;
  scormPackages: ScormPackage[];
  onSave: (data: Partial<Lesson> & { title: string; contentType: string; scormPackageId?: string }) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(() => {
    let initContentUrl = lesson?.contentUrl ?? "";
    let initScheduledAt = "";
    if (lesson?.contentType === "live_session" && lesson.contentData) {
      try {
        const d = JSON.parse(lesson.contentData) as { meetingUrl?: string; scheduledAt?: string };
        if (d.meetingUrl) initContentUrl = d.meetingUrl;
        if (d.scheduledAt) initScheduledAt = new Date(d.scheduledAt).toISOString().slice(0, 16);
      } catch { /* fall back to contentUrl */ }
    }
    return {
      title: lesson?.title ?? "",
      contentType: lesson?.contentType ?? "video",
      contentUrl: initContentUrl,
      contentData: lesson?.contentType === "live_session" ? "" : (lesson?.contentData ?? ""),
      scheduledAt: initScheduledAt,
      durationMins: lesson?.durationMins ? String(lesson.durationMins) : "",
      isPreview: lesson?.isPreview ?? false,
      scormPackageId: lesson?.scormPackage?.id ?? "",
    };
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);

  async function uploadFile(file: File, type: "pdf" | "video") {
    setUploading(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);

      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/manage/upload");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText).url as string);
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText).error ?? "Upload failed")); }
            catch { reject(new Error("Upload failed")); }
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(fd);
      });

      setForm((f) => ({ ...f, contentUrl: url }));
      toast.success("File uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = form.contentType === "pdf" ? "pdf" : "video";
    uploadFile(file, type);
  }

  function handleSave() {
    if (!form.title.trim()) { toast.error("Lesson title is required"); return; }
    const liveContentData = form.contentType === "live_session"
      ? JSON.stringify({
          meetingUrl: form.contentUrl || null,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
        })
      : null;
    onSave({
      title: form.title,
      contentType: form.contentType,
      contentUrl: form.contentUrl || null,
      contentData: form.contentType === "live_session" ? liveContentData : (form.contentData || null),
      durationMins: form.durationMins ? parseInt(form.durationMins) : null,
      isPreview: form.isPreview,
      scormPackageId: form.contentType === "scorm" ? form.scormPackageId || undefined : undefined,
    });
  }

  return (
    <>
    <Modal title={mode === "add" ? "Add Lesson" : "Edit Lesson"} onClose={onClose} wide>
      <div className="space-y-4">
        {/* Title + type */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Lesson Title *</Label>
            <Input autoFocus className="mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <Label>Content Type</Label>
            <select
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.contentType}
              onChange={(e) => setForm((f) => ({ ...f, contentType: e.target.value, contentUrl: "", contentData: "", scheduledAt: "" }))}
            >
              {Object.entries(CONTENT_TYPE_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Duration (minutes)</Label>
            <Input type="number" min="0" className="mt-1" placeholder="optional" value={form.durationMins} onChange={(e) => setForm((f) => ({ ...f, durationMins: e.target.value }))} />
          </div>
        </div>

        {/* Content input by type */}
        {(form.contentType === "video") && (
          <div>
            <Label>Video</Label>
            <p className="text-xs text-slate-400 mb-1">Upload an MP4/WebM file or paste a direct URL (Vimeo, YouTube, etc.)</p>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                placeholder="https://... or upload below"
                value={form.contentUrl}
                onChange={(e) => setForm((f) => ({ ...f, contentUrl: e.target.value }))}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1.5 shrink-0">
                <Upload className="w-3.5 h-3.5" /> Upload
              </Button>
            </div>
            <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/ogg" className="hidden" onChange={handleFileChange} />
            {uploading && <Progress value={uploadProgress} className="h-1.5 mt-2" />}
            {form.contentUrl && !uploading && <p className="text-xs text-emerald-600 mt-1">✓ {form.contentUrl}</p>}
          </div>
        )}

        {form.contentType === "pdf" && (
          <div>
            <Label>PDF Document</Label>
            <p className="text-xs text-slate-400 mb-1">Upload a PDF file or paste a URL</p>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                placeholder="https://... or upload below"
                value={form.contentUrl}
                onChange={(e) => setForm((f) => ({ ...f, contentUrl: e.target.value }))}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1.5 shrink-0">
                <Upload className="w-3.5 h-3.5" /> Upload
              </Button>
            </div>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
            {uploading && <Progress value={uploadProgress} className="h-1.5 mt-2" />}
            {form.contentUrl && !uploading && <p className="text-xs text-emerald-600 mt-1">✓ {form.contentUrl}</p>}
          </div>
        )}

        {form.contentType === "text" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Text Content (HTML supported)</Label>
              <button
                type="button"
                onClick={() => setAiOpen(true)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition"
              >
                <Sparkles className="w-3.5 h-3.5" /> Generate with AI
              </button>
            </div>
            <textarea
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono resize-none"
              rows={8}
              placeholder={"<h2>Introduction</h2>\n<p>Your lesson content goes here. HTML is supported.</p>"}
              value={form.contentData}
              onChange={(e) => setForm((f) => ({ ...f, contentData: e.target.value }))}
            />
            <p className="text-xs text-slate-400 mt-1">HTML will be safely rendered inline for learners.</p>
          </div>
        )}

        {form.contentType === "scorm" && (
          <div>
            <Label>SCORM Package</Label>
            {scormPackages.length === 0 ? (
              <p className="text-sm text-amber-600 mt-1">
                No unlinked SCORM packages. Upload one first via{" "}
                <a href="/manage/scorm" target="_blank" className="underline">SCORM Packages</a>.
              </p>
            ) : (
              <select
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={form.scormPackageId}
                onChange={(e) => setForm((f) => ({ ...f, scormPackageId: e.target.value }))}
              >
                <option value="">— Select a SCORM package —</option>
                {scormPackages.map((p) => (
                  <option key={p.id} value={p.id}>{p.title} (SCORM {p.version})</option>
                ))}
              </select>
            )}
          </div>
        )}

        {form.contentType === "live_session" && (
          <div className="space-y-3">
            <div>
              <Label>Meeting URL</Label>
              <Input
                className="mt-1"
                placeholder="https://zoom.us/j/... or Teams link"
                value={form.contentUrl}
                onChange={(e) => setForm((f) => ({ ...f, contentUrl: e.target.value }))}
              />
            </div>
            <div>
              <Label>Scheduled Date &amp; Time</Label>
              <Input
                type="datetime-local"
                className="mt-1"
                value={form.scheduledAt}
                onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              />
              <p className="text-xs text-slate-400 mt-1">
                The join button is disabled until 15 minutes before the session starts.
              </p>
            </div>
          </div>
        )}

        {/* Preview toggle */}
        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
          <input
            type="checkbox"
            id="preview-toggle"
            checked={form.isPreview}
            onChange={(e) => setForm((f) => ({ ...f, isPreview: e.target.checked }))}
            className="w-4 h-4 rounded accent-primary"
          />
          <label htmlFor="preview-toggle" className="text-sm text-slate-700 cursor-pointer">
            <span className="font-medium">Free preview</span> — non-enrolled users can view this lesson
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave} disabled={uploading}>
            {mode === "add" ? "Add Lesson" : "Save Changes"}
          </Button>
        </div>
      </div>
    </Modal>
    {aiOpen && (
      <AIContentModal
        courseId={courseId}
        prefillTitle={form.title}
        onUse={(html) => { setForm((f) => ({ ...f, contentData: html })); setAiOpen(false); }}
        onClose={() => setAiOpen(false)}
      />
    )}
    </>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={cn("bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto w-full", wide ? "max-w-xl" : "max-w-md")}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
