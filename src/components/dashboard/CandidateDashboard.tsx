import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cacheQuery, CACHE_TAGS } from "@/lib/cache";
import Link from "next/link";
import { BookOpen, FileText, Award, Clock, TrendingUp, AlertCircle, ChevronRight, CheckCircle2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow, format } from "date-fns";
import OnboardingChecklist from "@/components/dashboard/OnboardingChecklist";

export default async function CandidateDashboard() {
  const session = await auth();
  const userId = session!.user.id;
  const firstName = session!.user.name?.split(" ")[0] ?? "there";

  const [enrolments, certificates, examAttempts, cpdAggregate, userProfile] = await Promise.all([
    cacheQuery(
      () => db.enrolment.findMany({
        where: { userId, status: "ACTIVE" },
        include: { course: { select: { title: true, slug: true, thumbnailUrl: true, cpdHours: true } } },
        orderBy: { enroledAt: "desc" },
        take: 4,
      }),
      [`candidate-enrolments-${userId}`],
      [CACHE_TAGS.course],
      30,
    ),
    cacheQuery(
      () => db.certificate.findMany({
        where: { userId },
        include: { scheme: { select: { name: true, code: true } } },
        orderBy: { issuedAt: "desc" },
        take: 3,
      }),
      [`candidate-certificates-${userId}`],
      [CACHE_TAGS.certificate],
      30,
    ),
    cacheQuery(
      () => db.examAttempt.findMany({
        where: { userId },
        include: { examPaper: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
      [`candidate-exam-attempts-${userId}`],
      [CACHE_TAGS.exam],
      30,
    ),
    cacheQuery(
      () => db.cPDRecord.aggregate({
        where: { userId, status: { in: ["APPROVED", "PENDING"] } },
        _sum: { hoursLogged: true },
      }),
      [`candidate-cpd-${userId}`],
      [CACHE_TAGS.course],
      30,
    ),
    db.user.findUnique({
      where: { id: userId },
      select: { phone: true, emailVerified: true },
    }),
  ]);

  const cpdHours = Math.round((cpdAggregate._sum.hoursLogged ?? 0) * 10) / 10;

  const onboarding = {
    hasPhone: !!userProfile?.phone,
    emailVerified: !!userProfile?.emailVerified,
    hasEnrolment: enrolments.length > 0,
    hasExamAttempt: examAttempts.length > 0,
    hasCertificate: certificates.length > 0,
  };

  const activeCerts = certificates.filter((c) => c.status === "ACTIVE");
  const expiringSoon = certificates.filter((c) => {
    if (!c.expiresAt) return false;
    const daysLeft = Math.floor((c.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 90 && daysLeft > 0 && c.status === "ACTIVE";
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back, {firstName} 👋
        </h1>
        <p className="text-slate-500 mt-1">Here&apos;s your certification progress at a glance.</p>
      </div>

      {/* Onboarding checklist */}
      <OnboardingChecklist {...onboarding} />

      {/* Expiry alert */}
      {expiringSoon.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">
              {expiringSoon.length} certificate{expiringSoon.length > 1 ? "s" : ""} expiring soon
            </p>
            <p className="text-amber-700 text-xs mt-0.5">
              {expiringSoon.map((c) => c.scheme.name).join(", ")} — start your renewal process now.
            </p>
          </div>
          <Link href="/certificates" className="ml-auto text-xs text-amber-700 font-semibold underline shrink-0">
            View
          </Link>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Enrolled Courses", value: enrolments.length, icon: BookOpen, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Active Certificates", value: activeCerts.length, icon: Award, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Exams Taken", value: examAttempts.length, icon: FileText, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "CPD Hours", value: cpdHours, icon: TrendingUp, color: "text-orange-600", bg: "bg-orange-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Public registry quick links */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
        <span>Public services:</span>
        <Link href="/registry" className="inline-flex items-center gap-1 text-primary hover:underline font-medium">
          Public Certificate Register <ExternalLink className="w-3 h-3" />
        </Link>
        <Link href="/verify/TG-2025-00000000" className="inline-flex items-center gap-1 text-slate-500 hover:text-primary hover:underline">
          Verify a certificate <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Active courses */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Active Courses</CardTitle>
              <Link href="/courses" className="text-xs text-primary flex items-center gap-1 hover:underline">
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {enrolments.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">
                No active courses yet.{" "}
                <Link href="/courses" className="text-primary hover:underline">
                  Browse courses
                </Link>
              </p>
            ) : (
              enrolments.map((e) => (
                <Link key={e.id} href={`/courses/${e.course.slug}`} className="block group">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-slate-800 group-hover:text-primary transition-colors truncate pr-4">
                      {e.course.title}
                    </p>
                    <span className="text-xs text-slate-500 shrink-0">{Math.round(e.progress)}%</span>
                  </div>
                  <Progress value={e.progress} className="h-1.5" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Certificates */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">My Certificates</CardTitle>
              <Link href="/certificates" className="text-xs text-primary flex items-center gap-1 hover:underline">
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {certificates.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">
                No certificates yet. Complete a course and pass your exam!
              </p>
            ) : (
              certificates.map((cert) => (
                <Link key={cert.id} href={`/certificates/${cert.id}`} className="flex items-center gap-3 group">
                  <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate group-hover:text-primary transition-colors">
                      {cert.scheme.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {cert.certificateNumber}
                      {cert.expiresAt && ` · Expires ${format(cert.expiresAt, "MMM yyyy")}`}
                    </p>
                  </div>
                  <Badge
                    className={
                      cert.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700 border-0"
                        : cert.status === "EXPIRED"
                        ? "bg-red-100 text-red-700 border-0"
                        : "bg-slate-100 text-slate-700 border-0"
                    }
                  >
                    {cert.status}
                  </Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent exam activity */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Exam Activity</CardTitle>
            <Link href="/exams" className="text-xs text-primary flex items-center gap-1 hover:underline">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {examAttempts.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No exam attempts yet.</p>
          ) : (
            <div className="space-y-2">
              {examAttempts.map((attempt) => (
                <div key={attempt.id} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    attempt.passed === true ? "bg-emerald-100" :
                    attempt.passed === false ? "bg-red-100" : "bg-slate-100"
                  }`}>
                    {attempt.passed === true ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : attempt.passed === false ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <Clock className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {attempt.examPaper.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDistanceToNow(attempt.createdAt, { addSuffix: true })}
                      {attempt.percentageScore != null && ` · ${attempt.percentageScore}%`}
                    </p>
                  </div>
                  <Badge
                    className={
                      attempt.status === "COMPLETED"
                        ? attempt.passed
                          ? "bg-emerald-100 text-emerald-700 border-0"
                          : "bg-red-100 text-red-700 border-0"
                        : attempt.status === "IN_PROGRESS"
                        ? "bg-blue-100 text-blue-700 border-0"
                        : "bg-slate-100 text-slate-700 border-0"
                    }
                  >
                    {attempt.status === "COMPLETED"
                      ? attempt.passed ? "Passed" : "Failed"
                      : attempt.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
