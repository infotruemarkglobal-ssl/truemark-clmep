"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Clock, MailOpen } from "lucide-react";

function VerifyEmailContent() {
  const params = useSearchParams();
  const success = params.get("success") === "1";
  const error = params.get("error");

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Email verified!</h1>
          <p className="text-slate-500 text-sm mt-2">
            Your account is now active. You can sign in.
          </p>
        </div>
        <Link
          href="/login"
          className="block w-full text-center py-2.5 px-4 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Sign in to your account
        </Link>
      </div>
    );
  }

  if (error === "expired") {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Link expired</h1>
          <p className="text-slate-500 text-sm mt-2">
            Your verification link has expired. Please register again to receive a new link.
          </p>
        </div>
        <Link
          href="/register"
          className="block w-full text-center py-2.5 px-4 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          Back to register
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invalid link</h1>
          <p className="text-slate-500 text-sm mt-2">
            This verification link is invalid or has already been used.
          </p>
        </div>
        <Link
          href="/login"
          className="block w-full text-center py-2.5 px-4 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  // Default state — user lands here from a "check your email" message
  return (
    <div className="text-center space-y-4">
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
          <MailOpen className="w-8 h-8 text-blue-600" />
        </div>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Check your inbox</h1>
        <p className="text-slate-500 text-sm mt-2">
          We sent a verification link to your email address. Click the link in the email to activate your account.
          The link expires in 24 hours.
        </p>
      </div>
      <p className="text-xs text-slate-400">
        Did not receive it? Check your spam folder, or{" "}
        <Link href="/register" className="text-primary hover:underline">register again</Link>.
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <Suspense fallback={<div className="h-40 animate-pulse bg-slate-100 rounded-xl" />}>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
