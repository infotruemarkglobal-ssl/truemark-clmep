"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const DISMISS_KEY = "onboarding_checklist_dismissed";

type Props = {
  hasPhone: boolean;
  emailVerified: boolean;
  hasEnrolment: boolean;
  hasExamAttempt: boolean;
  hasCertificate: boolean;
};

const STEPS = [
  { key: "hasPhone",       label: "Add a phone number",       href: "/profile" },
  { key: "emailVerified",  label: "Verify your email address", href: "/profile" },
  { key: "hasEnrolment",   label: "Enrol in a course",         href: "/courses" },
  { key: "hasExamAttempt", label: "Take your first exam",      href: "/exams" },
  { key: "hasCertificate", label: "Earn a certificate",        href: "/certificates" },
] as const;

export default function OnboardingChecklist(props: Props) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (dismissed === null) return null;
  if (dismissed) return null;

  const completed = STEPS.filter((s) => props[s.key]).length;
  const total = STEPS.length;
  if (completed === total) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="font-semibold text-slate-900 text-sm">Getting started</h2>
          <p className="text-xs text-slate-500 mt-0.5">{completed} of {total} steps complete</p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Hide onboarding checklist"
          className="text-slate-400 hover:text-slate-600 transition -mt-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <Progress value={(completed / total) * 100} className="h-1.5 mb-4" />

      <ul className="space-y-2">
        {STEPS.map((step) => {
          const done = props[step.key];
          return (
            <li key={step.key} className="flex items-center gap-3">
              {done ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-slate-300 shrink-0" />
              )}
              {done ? (
                <span className="text-sm text-slate-400 line-through">{step.label}</span>
              ) : (
                <Link
                  href={step.href}
                  className="text-sm text-slate-700 hover:text-primary flex items-center gap-1 transition-colors"
                >
                  {step.label}
                  <ChevronRight className="w-3 h-3" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <Button
        variant="ghost"
        size="sm"
        onClick={dismiss}
        className="mt-4 text-xs text-slate-400 hover:text-slate-600 px-0 h-auto"
      >
        Hide this
      </Button>
    </div>
  );
}
