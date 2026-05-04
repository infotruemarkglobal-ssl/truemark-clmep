"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { BookOpen, Plus, Search, Users, Globe, Lock, Eye, Edit2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Course = {
  id: string;
  title: string;
  slug: string;
  status: string;
  price: number;
  currency: string;
  cpdHours: number;
  durationHours: number | null;
  thumbnailUrl: string | null;
  createdAt: string;
  publishedAt: string | null;
  creator: { firstName: string; lastName: string };
  scheme: { name: string; code: string } | null;
  moduleCount: number;
  enrolmentCount: number;
};

type Scheme = { id: string; name: string; code: string };

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "bg-slate-100 text-slate-600" },
  PUBLISHED: { label: "Published", color: "bg-emerald-100 text-emerald-700" },
  ARCHIVED: { label: "Archived", color: "bg-amber-100 text-amber-700" },
};

export default function ManageCoursesPage({
  courses,
  schemes,
  canCreate,
}: {
  courses: Course[];
  schemes: Scheme[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    shortDescription: "",
    schemeId: "",
    price: "0",
    currency: "NGN",
    cpdHours: "0",
    durationHours: "",
    minProgressToExam: "80",
  });

  const filtered = courses.filter((c) => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  function slugify(str: string) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function createCourse() {
    if (!form.title) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/manage/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          slug: slugify(form.title),
          price: parseFloat(form.price) || 0,
          cpdHours: parseFloat(form.cpdHours) || 0,
          durationHours: form.durationHours ? parseFloat(form.durationHours) : null,
          minProgressToExam: parseInt(form.minProgressToExam) || 80,
          schemeId: form.schemeId || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Course created");
      setShowModal(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(course: Course) {
    const newStatus = course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    try {
      const res = await fetch(`/api/manage/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(newStatus === "PUBLISHED" ? "Course published" : "Course unpublished");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manage Courses</h1>
          <p className="text-slate-500 text-sm mt-1">{courses.length} courses total</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowModal(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Course
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {["DRAFT", "PUBLISHED", "ARCHIVED"].map((s) => {
          const conf = STATUS_CONFIG[s];
          return (
            <div key={s} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{courses.filter((c) => c.status === s).length}</p>
              <Badge className={cn("border-0 text-xs mt-1", conf.color)}>{conf.label}</Badge>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input placeholder="Search courses…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">{search ? "No courses match your search" : "No courses yet"}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((course) => {
              const statusConf = STATUS_CONFIG[course.status] ?? STATUS_CONFIG.DRAFT;
              return (
                <div key={course.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 text-sm truncate">{course.title}</p>
                      <Badge className={cn("border-0 text-[10px]", statusConf.color)}>{statusConf.label}</Badge>
                      {course.scheme && (
                        <Badge className="bg-primary/10 text-primary border-0 text-[10px]">{course.scheme.code}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {course.enrolmentCount}
                      </span>
                      <span>{course.moduleCount} modules</span>
                      {course.cpdHours > 0 && <span>{course.cpdHours} CPD hrs</span>}
                      <span>By {course.creator.firstName} {course.creator.lastName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/courses/${course.slug}`)}
                      title="Preview"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => togglePublish(course)}
                      title={course.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                    >
                      {course.status === "PUBLISHED" ? (
                        <ToggleRight className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-4 h-4 text-slate-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/manage/courses/${course.id}`)}
                      title="Edit course content"
                    >
                      <Edit2 className="w-4 h-4 text-slate-600" />
                    </Button>
                  </div>
                  <div className="text-right text-xs text-slate-400 shrink-0 hidden sm:block">
                    {format(new Date(course.createdAt), "d MMM yyyy")}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Course Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 text-lg mb-5">New Course</h3>
            <div className="space-y-3">
              <div><Label>Title *</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
              <div>
                <Label>Short Description</Label>
                <textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" rows={2} value={form.shortDescription} onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))} />
              </div>
              <div>
                <Label>Certification Scheme</Label>
                <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.schemeId} onChange={(e) => setForm((f) => ({ ...f, schemeId: e.target.value }))}>
                  <option value="">None</option>
                  {schemes.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Price</Label><Input type="number" min="0" step="0.01" className="mt-1" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></div>
                <div>
                  <Label>Currency</Label>
                  <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                    {["NGN", "GHS", "USD", "EUR", "GBP"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>CPD Hours</Label><Input type="number" min="0" step="0.5" className="mt-1" value={form.cpdHours} onChange={(e) => setForm((f) => ({ ...f, cpdHours: e.target.value }))} /></div>
                <div><Label>Duration (hours)</Label><Input type="number" min="0" step="0.5" className="mt-1" placeholder="optional" value={form.durationHours} onChange={(e) => setForm((f) => ({ ...f, durationHours: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Min. Progress to Exam (%)</Label>
                <Input type="number" min="0" max="100" className="mt-1" value={form.minProgressToExam} onChange={(e) => setForm((f) => ({ ...f, minProgressToExam: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1" onClick={createCourse} disabled={saving}>{saving ? "Saving…" : "Create Course"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
