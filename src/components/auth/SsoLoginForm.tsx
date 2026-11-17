"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, ArrowRight, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "Enter a valid work email address.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  no_sso_for_domain: "Your organisation hasn't set up single sign-on, or this isn't your work email. Use the regular sign-in page instead.",
  idp_unreachable: "Your organisation's sign-in provider could not be reached. Please try again shortly.",
  auth_failed: "Sign-in was not completed. Please try again.",
  missing_email_claim: "Your organisation's sign-in provider did not return an email address.",
  domain_mismatch: "The account returned by your organisation's sign-in provider doesn't match your work email domain.",
  sso_disabled: "Single sign-on is currently disabled for your organisation.",
  expired_flow: "That sign-in link expired. Please start again.",
};

export default function SsoLoginForm() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    // Full navigation, not fetch — the server route responds with a redirect
    // straight to the organisation's own identity provider.
    window.location.href = `/api/auth/sso/authorize?email=${encodeURIComponent(email.trim())}`;
  }

  return (
    <>
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Building2 className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Sign in with your organisation</h1>
        <p className="text-sm text-slate-500 mt-1">
          Enter your work email — we&apos;ll take you to your organisation&apos;s own sign-in page.
        </p>
      </div>

      {errorCode && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{ERROR_MESSAGES[errorCode] ?? "Something went wrong. Please try again."}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="sso-email">Work email</Label>
          <Input
            id="sso-email"
            type="email"
            required
            // The only control on a dedicated, single-purpose sign-in page
            // (a full navigation, not an in-page focus steal).
            // eslint-disable-next-line jsx-a11y/no-autofocus -- see above
            autoFocus
            placeholder="you@yourcompany.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5"
          />
        </div>
        <Button type="submit" className="w-full gap-2" disabled={submitting}>
          {submitting ? "Redirecting…" : "Continue"}
          {!submitting && <ArrowRight className="w-4 h-4" />}
        </Button>
      </form>
    </>
  );
}
