"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Search, Filter, BookOpen, Clock, Award, Users, ChevronRight, CheckCircle2, Play } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Course = {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  price: number;
  currency: string;
  cpdHours: number;
  durationHours: number | null;
  scheme: { name: string; code: string } | null;
  creator: { firstName: string; lastName: string };
  _count: { enrolments: number };
};

type EnrolmentInfo = { progress: number; status: string };

const CATEGORY_ICONS: Record<string, string> = {
  "ISO27001-LA": "🔐",
  "ISO9001-IA": "🏆",
  "ISO14001-IA": "🌿",
  "ISO45001-LA": "⛑️",
};

export default function CourseCatalog({
  courses,
  enrolmentMap,
}: {
  courses: Course[];
  enrolmentMap: Record<string, EnrolmentInfo>;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "enrolled" | "available" | "completed">("all");
  const [loading, setLoading] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      const enrolment = enrolmentMap[c.id];
      const matchesSearch =
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.scheme?.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.shortDescription ?? "").toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;
      if (filter === "enrolled") return !!enrolment && enrolment.status === "ACTIVE";
      if (filter === "completed") return enrolment?.status === "COMPLETED";
      if (filter === "available") return !enrolment;
      return true;
    });
  }, [courses, enrolmentMap, search, filter]);

  async function handleEnrol(courseId: string) {
    setLoading(courseId);
    try {
      const res = await fetch("/api/payments/paystack/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to enrol");
      if (data.free) {
        toast.success("Successfully enrolled!");
        router.refresh();
        return;
      }
      // Paid — redirect to Paystack checkout
      window.location.href = data.authorizationUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enrolment failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Course Catalogue</h1>
          <p className="text-slate-500 text-sm mt-1">{courses.length} courses available</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search courses, certifications…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            aria-label="Search courses"
          />
        </div>

        {/* Filter group — aria-pressed on each button communicates active state
            to screen readers without a visual-only selection indicator (WCAG 4.1.2) */}
        <div className="flex gap-2" role="group" aria-label="Filter courses">
          {(["all", "enrolled", "completed", "available"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition",
                filter === f
                  ? "bg-primary text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Course grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No courses found</p>
          <p className="text-sm mt-1">Try adjusting your search or filter.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((course) => {
            const enrolment = enrolmentMap[course.id];
            const isEnrolled = !!enrolment;
            const isCompleted = enrolment?.status === "COMPLETED";
            const icon = course.scheme ? (CATEGORY_ICONS[course.scheme.code] ?? "📋") : "📋";

            return (
              <div
                key={course.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col group"
              >
                {/* Thumbnail / placeholder */}
                <div className="h-40 bg-linear-to-br from-primary/10 to-primary/5 flex items-center justify-center relative overflow-hidden">
                  {course.thumbnailUrl ? (
                    <Image
                      src={course.thumbnailUrl}
                      alt={course.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    />
                  ) : (
                    /* Emoji is decorative — category is conveyed by the scheme badge below */
                    <span className="text-5xl" aria-hidden="true">{icon}</span>
                  )}
                  {isCompleted && (
                    <div className="absolute top-3 right-3 bg-emerald-500 text-white px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Completed
                    </div>
                  )}
                  {isEnrolled && !isCompleted && (
                    <div className="absolute top-3 right-3 bg-blue-500 text-white px-2 py-0.5 rounded-full text-xs font-semibold">
                      Enrolled
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                  {course.scheme && (
                    <Badge className="self-start mb-2 bg-primary/10 text-primary border-0 text-xs">
                      {course.scheme.code}
                    </Badge>
                  )}

                  <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-primary transition-colors leading-snug">
                    {course.title}
                  </h3>

                  {course.shortDescription && (
                    <p className="text-sm text-slate-500 mb-3 line-clamp-2">{course.shortDescription}</p>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-4">
                    {course.durationHours && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden="true" /> {course.durationHours}h
                      </span>
                    )}
                    {course.cpdHours > 0 && (
                      <span className="flex items-center gap-1">
                        <Award className="w-3 h-3" aria-hidden="true" /> {course.cpdHours} CPD hrs
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" aria-hidden="true" /> {course._count.enrolments} enrolled
                    </span>
                  </div>

                  {/* Progress bar for enrolled */}
                  {isEnrolled && !isCompleted && (
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Progress</span>
                        <span>{Math.round(enrolment.progress)}%</span>
                      </div>
                      <Progress value={enrolment.progress} className="h-1.5" />
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-900">
                      {course.price === 0 ? (
                        <span className="text-emerald-600">Free</span>
                      ) : (
                        `${course.currency} ${course.price.toLocaleString()}`
                      )}
                    </span>

                    {isCompleted ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/courses/${course.slug}`)}
                        className="gap-1"
                        title="Review this completed course content"
                      >
                        Review <ChevronRight className="w-3 h-3" />
                      </Button>
                    ) : isEnrolled ? (
                      <Button
                        size="sm"
                        onClick={() => router.push(`/courses/${course.slug}`)}
                        className="gap-1"
                        title="Continue where you left off"
                      >
                        <Play className="w-3 h-3" /> Continue
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleEnrol(course.id)}
                        disabled={loading === course.id}
                        className="gap-1"
                        title={course.price === 0 ? "Enrol in this course for free — no payment required" : `Pay ${course.currency} ${course.price.toLocaleString()} to enrol in this course`}
                      >
                        {loading === course.id ? "Enrolling…" : course.price === 0 ? "Enrol Free" : "Enrol"}
                        <ChevronRight className="w-3 h-3" />
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
  );
}
