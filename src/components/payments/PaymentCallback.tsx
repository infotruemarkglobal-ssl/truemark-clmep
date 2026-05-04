"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, AlertCircle, Loader2, BookOpen, RotateCcw, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VerifyResult =
  | { ok: true;  status: "success";      courseSlug: string | null }
  | { ok: true;  status: "already_paid"; courseSlug: string | null }
  | { ok: false; status: "failed" | "error"; courseId?: string | null; error?: string };

type Props = { reference: string; courseId?: string };

export default function PaymentCallback({ reference, courseId }: Props) {
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ reference });
    if (courseId) params.set("courseId", courseId);

    fetch(`/api/payments/paystack/verify?${params.toString()}`)
      .then((res) => res.json() as Promise<VerifyResult>)
      .then(setResult)
      .catch(() =>
        setResult({ ok: false, status: "error", error: "Could not connect to the payment server. Please try again." }),
      );
  }, [reference, courseId]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
        <p className="text-slate-600 text-sm font-medium">Verifying your payment…</p>
        <p className="text-slate-400 text-xs">This usually takes a few seconds.</p>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (result.status === "success") {
    return (
      <StatusCard
        icon={<CheckCircle2 className="w-8 h-8 text-emerald-600" />}
        iconBg="bg-emerald-100"
        title="Payment successful!"
        description="Your payment has been confirmed and you are now enrolled. Start learning whenever you're ready."
      >
        {result.courseSlug && (
          <Link href={`/courses/${result.courseSlug}`}>
            <Button className="gap-2">
              <BookOpen className="w-4 h-4" />
              Go to course
            </Button>
          </Link>
        )}
        <Link href="/dashboard">
          <Button variant="outline" className="gap-2">
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Button>
        </Link>
      </StatusCard>
    );
  }

  // ── Already enrolled ───────────────────────────────────────────────────────
  if (result.status === "already_paid") {
    return (
      <StatusCard
        icon={<CheckCircle2 className="w-8 h-8 text-blue-600" />}
        iconBg="bg-blue-100"
        title="Already enrolled"
        description="You are already enrolled in this course. Head over whenever you're ready."
      >
        {result.courseSlug && (
          <Link href={`/courses/${result.courseSlug}`}>
            <Button className="gap-2">
              <BookOpen className="w-4 h-4" />
              Go to course
            </Button>
          </Link>
        )}
        <Link href="/courses">
          <Button variant="outline">Browse courses</Button>
        </Link>
      </StatusCard>
    );
  }

  // ── Failed / error ─────────────────────────────────────────────────────────
  const failedCourseId = "courseId" in result ? result.courseId : courseId;
  return (
    <StatusCard
      icon={<XCircle className="w-8 h-8 text-red-500" />}
      iconBg="bg-red-100"
      title="Payment failed"
      description={result.error ?? "Your payment could not be verified. You have not been charged."}
    >
      {failedCourseId && (
        <Link href={`/courses/${failedCourseId}`}>
          <Button className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Try again
          </Button>
        </Link>
      )}
      <Link href="/courses">
        <Button variant="outline">Browse courses</Button>
      </Link>
      <p className="text-xs text-slate-400 mt-2">
        If you were charged, please{" "}
        <Link href="/support" className="underline underline-offset-2 hover:text-slate-600">
          contact support
        </Link>{" "}
        with reference: <span className="font-mono">{reference}</span>
      </p>
    </StatusCard>
  );
}

// ── Shared card shell ──────────────────────────────────────────────────────────

function StatusCard({
  icon,
  iconBg,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md w-full text-center space-y-5">
        <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mx-auto", iconBg)}>
          {icon}
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex flex-col items-center gap-3 pt-1">{children}</div>
      </div>
    </div>
  );
}
