"use client";

import DOMPurify from "isomorphic-dompurify";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Play, FileText, CheckCircle2, Lock, ChevronDown, ChevronRight,
  Award, Clock, Users, BookOpen, ExternalLink, ShoppingCart, Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Lesson = { id: string; title: string; contentType: string; contentUrl: string | null; contentData: string | null; durationMins: number | null; isPreview: boolean; scormPackageId?: string | null };
type Module = { id: string; title: string; order: number; lessons: Lesson[] };
type LessonProgressRecord = { lessonId: string; completed: boolean; lastPosition: number | null };

type Course = {
  id: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  cpdHours: number;
  durationHours: number | null;
  minProgressToExam: number;
  price: number;
  currency: string;
  modules: Module[];
  scheme: { name: string; code: string; validityMonths: number } | null;
  creator: { firstName: string; lastName: string; photoUrl: string | null };
};

type Enrolment = {
  id: string;
  progress: number;
  status: string;
  lessonProgress: LessonProgressRecord[];
} | null;

const CONTENT_ICONS: Record<string, React.ElementType> = {
  video: Play,
  pdf: FileText,
  scorm: BookOpen,
  text: FileText,
  quiz: CheckCircle2,
  live_session: Users,
};

export default function CoursePlayer({
  course,
  enrolment,
  examPaperId,
  userRole = "CANDIDATE",
}: {
  course: Course;
  enrolment: Enrolment;
  examPaperId: string | null;
  userRole?: string;
}) {
  const router = useRouter();
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set([course.modules[0]?.id])
  );
  const [savingProgress, setSavingProgress] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [inCart, setInCart] = useState(false);
  const [seats, setSeats] = useState(1);
  const isOrgManager = userRole === "ORG_MANAGER";

  const handleEnrol = useCallback(async () => {
    setEnrolling(true);
    try {
      const res = await fetch("/api/payments/paystack/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Enrolment failed");
        return;
      }
      if (data.free) {
        toast.success("Enrolled successfully!");
        router.refresh();
        return;
      }
      // Paid — redirect to Paystack checkout
      window.location.href = data.authorizationUrl;
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setEnrolling(false);
    }
  }, [course.id, router]);

  const handleAddToCart = useCallback(async () => {
    setAddingToCart(true);
    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id, seats }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not add to cart");
        return;
      }
      setInCart(true);
      toast.success("Added to cart");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setAddingToCart(false);
    }
  }, [course.id, seats]);

  const isEnrolled = !!enrolment;
  const completedLessonIds = new Set(
    enrolment?.lessonProgress.filter((p) => p.completed).map((p) => p.lessonId) ?? []
  );

  const allLessons = course.modules.flatMap((m) => m.lessons);
  const totalLessons = allLessons.length;
  const completedCount = completedLessonIds.size;

  function toggleModule(moduleId: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId);
      return next;
    });
  }

  const markComplete = useCallback(async (lessonId: string) => {
    if (!enrolment || savingProgress) return;
    setSavingProgress(true);
    try {
      await fetch("/api/enrolments/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrolmentId: enrolment.id, lessonId, completed: true }),
      });
      toast.success("Lesson marked complete");
      router.refresh();
    } catch {
      toast.error("Failed to save progress");
    } finally {
      setSavingProgress(false);
    }
  }, [enrolment, savingProgress, router]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-8rem)]">
      {/* ── Main content area ── */}
      <div className="flex-1 space-y-6">
        {/* Course header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-wrap items-start gap-4 justify-between mb-4">
            <div className="flex-1 min-w-0">
              {course.scheme && (
                <Badge className="mb-2 bg-primary/10 text-primary border-0">{course.scheme.code}</Badge>
              )}
              <h1 className="text-xl font-bold text-slate-900">{course.title}</h1>
              {course.shortDescription && (
                <p className="text-slate-500 mt-1 text-sm">{course.shortDescription}</p>
              )}
            </div>
            {!isEnrolled && (
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="text-right">
                  {course.price === 0 ? (
                    <span className="text-lg font-bold text-emerald-600">Free</span>
                  ) : (
                    <span className="text-lg font-bold text-slate-900">
                      {course.currency} {course.price.toFixed(2)}
                    </span>
                  )}
                </div>

                {course.price === 0 ? (
                  <Button onClick={handleEnrol} disabled={enrolling} size="sm" className="gap-2">
                    <Gift className="w-4 h-4" />
                    {enrolling ? "Enrolling…" : "Enrol Free"}
                  </Button>
                ) : inCart ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push("/cart")}
                    className="gap-2 border-primary text-primary hover:bg-primary/10"
                  >
                    <ShoppingCart className="w-4 h-4" /> View Cart
                  </Button>
                ) : (
                  <div className="flex flex-col items-end gap-2">
                    {isOrgManager && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500">Seats:</span>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={seats}
                          onChange={(e) => setSeats(Math.max(1, Math.min(500, Number(e.target.value))))}
                          className="w-16 text-sm border border-slate-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-ring/50"
                        />
                      </div>
                    )}
                    <Button
                      onClick={handleAddToCart}
                      disabled={addingToCart}
                      size="sm"
                      className="gap-2"
                    >
                      {addingToCart
                        ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Adding…</>
                        : <><ShoppingCart className="w-4 h-4" /> Add to Cart</>
                      }
                    </Button>
                    <button
                      onClick={handleEnrol}
                      disabled={enrolling}
                      className="text-xs text-slate-400 hover:text-slate-600 underline disabled:opacity-50"
                    >
                      {enrolling ? "Redirecting…" : "Buy now →"}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => router.push("/courses")}
                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  ← Back to Catalogue
                </button>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-4 text-sm text-slate-600 mb-4">
            {course.durationHours && (
              <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-slate-400" />{course.durationHours}h total</span>
            )}
            <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-slate-400" />{totalLessons} lessons</span>
            {course.cpdHours > 0 && (
              <span className="flex items-center gap-1.5"><Award className="w-4 h-4 text-slate-400" />{course.cpdHours} CPD hours</span>
            )}
            {course.scheme && (
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-slate-400" />Leads to {course.scheme.name}</span>
            )}
          </div>

          {/* Progress */}
          {isEnrolled && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>{completedCount}/{totalLessons} lessons completed</span>
                <span className="font-semibold text-primary">{Math.round(enrolment!.progress)}%</span>
              </div>
              <Progress value={enrolment!.progress} className="h-2" />
            </div>
          )}

          {/* Exam CTA */}
          {examPaperId && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-emerald-800 text-sm">Ready for your certification exam!</p>
                <p className="text-xs text-emerald-700 mt-0.5">You&apos;ve met the minimum progress requirement.</p>
              </div>
              <Button size="sm" onClick={() => router.push(`/exams/${examPaperId}`)}>
                Book Exam <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
        </div>

        {/* Active lesson content */}
        {activeLesson ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Content viewer */}
            {activeLesson.contentType === "video" && activeLesson.contentUrl ? (
              <div className="bg-black aspect-video w-full">
                <video
                  key={activeLesson.id}
                  className="w-full h-full"
                  controls
                  controlsList="nodownload"
                  src={activeLesson.contentUrl}
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            ) : activeLesson.contentType === "video" ? (
              <div className="bg-slate-900 aspect-video flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Play className="w-10 h-10 text-white ml-1" />
                  </div>
                  <p className="font-medium">{activeLesson.title}</p>
                  <p className="text-sm text-slate-400 mt-1">No video URL configured</p>
                </div>
              </div>
            ) : activeLesson.contentType === "pdf" && activeLesson.contentUrl ? (
              <div className="w-full" style={{ height: "70vh" }}>
                <iframe
                  key={activeLesson.id}
                  src={activeLesson.contentUrl}
                  className="w-full h-full border-0"
                  title={activeLesson.title}
                />
              </div>
            ) : activeLesson.contentType === "pdf" ? (
              <div className="bg-slate-50 min-h-48 flex items-center justify-center p-8 text-center">
                <div>
                  <FileText className="w-14 h-14 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium text-slate-700">{activeLesson.title}</p>
                  <p className="text-sm text-slate-400 mt-1">No PDF URL configured</p>
                </div>
              </div>
            ) : activeLesson.contentType === "text" ? (
              <div className="p-6 prose prose-slate max-w-none">
                {activeLesson.contentData ? (
                  (() => {
                    let html: string | null = null;
                    let plain: string | null = null;
                    try {
                      const data = JSON.parse(activeLesson.contentData);
                      if (typeof data === "object" && data !== null) {
                        if (data.html) html = data.html as string;
                        else if (data.text) plain = data.text as string;
                      } else {
                        plain = activeLesson.contentData;
                      }
                    } catch {
                      // Not JSON — treat as raw HTML if it starts with '<', else plain text
                      const raw = activeLesson.contentData.trim();
                      if (raw.startsWith("<")) html = raw;
                      else plain = raw;
                    }
                    if (html) {
                      const safeHtml = DOMPurify.sanitize(html, {
                        USE_PROFILES: { html: true },
                        FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
                        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
                      });
                      return (
                        <div
                          className="text-slate-700 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: safeHtml }}
                        />
                      );
                    }
                    return <p className="text-slate-700 leading-relaxed whitespace-pre-line">{plain}</p>;
                  })()
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500">No text content available for this lesson</p>
                  </div>
                )}
              </div>
            ) : activeLesson.contentType === "scorm" ? (
              <div className="bg-slate-900 min-h-64 flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="w-8 h-8 text-white" />
                  </div>
                  <p className="font-semibold text-white mb-1">{activeLesson.title}</p>
                  <p className="text-slate-400 text-sm mb-5">Interactive SCORM module — opens in full screen</p>
                  {activeLesson.scormPackageId ? (
                    <a
                      href={`/scorm/player/${activeLesson.scormPackageId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition text-sm"
                    >
                      <ExternalLink className="w-4 h-4" /> Launch Module
                    </a>
                  ) : (
                    <p className="text-sm text-amber-400">SCORM package not yet uploaded for this lesson</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 min-h-48 flex items-center justify-center p-8 text-center">
                <div>
                  <BookOpen className="w-14 h-14 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium text-slate-700">{activeLesson.title}</p>
                  <p className="text-sm text-slate-400 mt-1 capitalize">{activeLesson.contentType} content</p>
                  {activeLesson.contentUrl && (
                    <a
                      href={activeLesson.contentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-3 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="w-4 h-4" /> Open content
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="p-5 flex items-center justify-between border-t border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900">{activeLesson.title}</h3>
                {activeLesson.durationMins && (
                  <p className="text-sm text-slate-500">{activeLesson.durationMins} minutes</p>
                )}
              </div>
              {isEnrolled && !completedLessonIds.has(activeLesson.id) && (
                <Button
                  size="sm"
                  onClick={() => markComplete(activeLesson.id)}
                  disabled={savingProgress}
                  className="gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {savingProgress ? "Saving…" : "Mark Complete"}
                </Button>
              )}
              {completedLessonIds.has(activeLesson.id) && (
                <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Completed
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
            <Play className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500">Select a lesson from the curriculum to begin</p>
          </div>
        )}

        {/* Description */}
        {course.description && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-semibold text-slate-900 mb-3">About This Course</h2>
            <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">{course.description}</p>
          </div>
        )}
      </div>

      {/* ── Sidebar curriculum ── */}
      <aside className="lg:w-80 shrink-0">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm sticky top-20 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900 text-sm">Course Curriculum</h2>
            <p className="text-xs text-slate-500 mt-0.5">{totalLessons} lessons · {course.modules.length} modules</p>
          </div>

          <div className="overflow-y-auto max-h-[calc(100vh-14rem)]">
            {course.modules.map((module) => {
              const expanded = expandedModules.has(module.id);
              const moduleCompleted = module.lessons.every((l) => completedLessonIds.has(l.id));

              return (
                <div key={module.id} className="border-b border-slate-100 last:border-0">
                  <button
                    onClick={() => toggleModule(module.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {moduleCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
                      )}
                      <span className="text-sm font-medium text-slate-800 truncate">{module.title}</span>
                    </div>
                    {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                  </button>

                  {expanded && (
                    <div className="pb-1">
                      {module.lessons.map((lesson) => {
                        const Icon = CONTENT_ICONS[lesson.contentType] ?? BookOpen;
                        const completed = completedLessonIds.has(lesson.id);
                        const canAccess = isEnrolled || lesson.isPreview;
                        const active = activeLesson?.id === lesson.id;

                        return (
                          <button
                            key={lesson.id}
                            onClick={() => canAccess && setActiveLesson(lesson)}
                            disabled={!canAccess}
                            className={cn(
                              "w-full flex items-center gap-3 px-6 py-2.5 text-left transition group",
                              active ? "bg-accent text-primary" : "hover:bg-slate-50",
                              !canAccess ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                            )}
                          >
                            {completed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            ) : !canAccess ? (
                              <Lock className="w-4 h-4 text-slate-300 shrink-0" />
                            ) : (
                              <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-slate-400")} />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-xs font-medium truncate", active ? "text-primary" : "text-slate-700")}>
                                {lesson.title}
                              </p>
                              {lesson.durationMins && (
                                <p className="text-[10px] text-slate-400">{lesson.durationMins}m</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
