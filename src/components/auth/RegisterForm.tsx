"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowRight, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type AccountType = "individual" | "organisation";

const schema = z
  .object({
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(2, "Last name must be at least 2 characters"),
    email: z.string().email("Enter a valid email address"),
    phone: z.string().optional(),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/[0-9]/, "Password must contain a number")
      .regex(/[^A-Za-z0-9]/, "Password must contain a special character"),
    confirmPassword: z.string(),
    accountType: z.enum(["individual", "organisation"]),
    orgName: z.string().optional(),
    orgRegistrationNo: z.string().optional(),
    orgCountry: z.string().optional(),
    orgWebsite: z.string().optional(),
    consentMarketing: z.boolean().optional(),
    consentTerms: z.literal(true, { error: "You must accept the terms to continue" }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine(
    (d) => d.accountType !== "organisation" || (d.orgName && d.orgName.length >= 2),
    { message: "Organisation name is required", path: ["orgName"] }
  );

type FormData = z.infer<typeof schema>;

export default function RegisterForm() {
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("individual");
  const [registered, setRegistered] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { accountType: "individual" },
  });

  const password = watch("password", "");

  const strengthChecks = [
    { label: "12+ characters", ok: password.length >= 12 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /[0-9]/.test(password) },
    { label: "Special character", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const strengthScore = strengthChecks.filter((c) => c.ok).length;

  function switchTab(type: AccountType) {
    setAccountType(type);
    setValue("accountType", type);
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          password: data.password,
          consentTerms: data.consentTerms,
          consentMarketing: data.consentMarketing ?? false,
          accountType: data.accountType,
          orgName: data.orgName,
          orgRegistrationNo: data.orgRegistrationNo,
          orgCountry: data.orgCountry,
          orgWebsite: data.orgWebsite,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Registration failed");
      setRegistered(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  if (registered) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Check your inbox</h2>
          <p className="text-sm text-slate-500 mt-2">
            We&apos;ve sent a verification link to your email address. Click it to activate your account.
            The link expires in 24 hours.
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Did not receive it? Check your spam folder.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Account type tabs */}
      <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-lg" role="tablist" aria-label="Account type">
        {(["individual", "organisation"] as AccountType[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`tab-${t}`}
            aria-selected={accountType === t}
            aria-controls="register-panel"
            onClick={() => switchTab(t)}
            className={cn(
              "flex-1 py-2 px-4 rounded-md text-sm font-medium transition flex items-center justify-center gap-2",
              accountType === t
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            {t === "individual" ? <User className="w-4 h-4" aria-hidden="true" /> : <Building2 className="w-4 h-4" aria-hidden="true" />}
            {t === "individual" ? "Individual" : "Organisation"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate id="register-panel" role="tabpanel" aria-labelledby={`tab-${accountType}`}>
        <input type="hidden" {...register("accountType")} />

        {/* Organisation fields */}
        {accountType === "organisation" && (
          <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Organisation Details</p>
            <div>
              <Label htmlFor="orgName">Organisation Name *</Label>
              <Input id="orgName" className="mt-1" placeholder="Acme Ltd."
                aria-invalid={!!errors.orgName}
                aria-describedby={errors.orgName ? "orgName-error" : undefined}
                {...register("orgName")} />
              {errors.orgName && <p id="orgName-error" role="alert" className="text-xs text-destructive mt-1">{errors.orgName.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="orgRegistrationNo">Reg. Number (optional)</Label>
                <Input id="orgRegistrationNo" className="mt-1" placeholder="RC123456" {...register("orgRegistrationNo")} />
              </div>
              <div>
                <Label htmlFor="orgCountry">Country (optional)</Label>
                <Input id="orgCountry" className="mt-1" placeholder="Nigeria" {...register("orgCountry")} />
              </div>
            </div>
            <div>
              <Label htmlFor="orgWebsite">Website (optional)</Label>
              <Input id="orgWebsite" type="url" className="mt-1" placeholder="https://example.com" {...register("orgWebsite")} />
            </div>
          </div>
        )}

        {/* Personal / Admin details */}
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">
          {accountType === "organisation" ? "Your Details (Account Administrator)" : "Your Details"}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="firstName">First Name</Label>
            <Input id="firstName" className="mt-1" placeholder="John"
              aria-invalid={!!errors.firstName}
              aria-describedby={errors.firstName ? "firstName-error" : undefined}
              {...register("firstName")} />
            {errors.firstName && <p id="firstName-error" role="alert" className="text-xs text-destructive mt-1">{errors.firstName.message}</p>}
          </div>
          <div>
            <Label htmlFor="lastName">Last Name</Label>
            <Input id="lastName" className="mt-1" placeholder="Doe"
              aria-invalid={!!errors.lastName}
              aria-describedby={errors.lastName ? "lastName-error" : undefined}
              {...register("lastName")} />
            {errors.lastName && <p id="lastName-error" role="alert" className="text-xs text-destructive mt-1">{errors.lastName.message}</p>}
          </div>
        </div>

        <div>
          <Label htmlFor="email">Email Address</Label>
          <Input id="email" type="email" autoComplete="email" className="mt-1"
            placeholder={accountType === "organisation" ? "admin@yourcompany.com" : "you@example.com"}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")} />
          {errors.email && <p id="email-error" role="alert" className="text-xs text-destructive mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" type="tel" className="mt-1" placeholder="+234 800 000 0000" {...register("phone")} />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative mt-1">
            <Input
              id="password"
              type={showPwd ? "text" : "password"}
              autoComplete="new-password"
              className="pr-10"
              placeholder="Min. 12 characters"
              aria-invalid={!!errors.password}
              aria-describedby={`password-strength${errors.password ? " password-error" : ""}`}
              {...register("password")}
            />
            <button type="button" onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              aria-label={showPwd ? "Hide" : "Show"}>
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {password && (
            <div className="mt-2 space-y-1" id="password-strength">
              {/* role="meter" communicates strength level to assistive technology */}
              <div
                role="meter"
                aria-label="Password strength"
                aria-valuenow={strengthScore}
                aria-valuemin={0}
                aria-valuemax={4}
                aria-valuetext={["None", "Weak", "Weak", "Fair", "Strong"][strengthScore]}
                className="flex gap-1"
              >
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= strengthScore
                      ? strengthScore <= 2 ? "bg-red-400" : strengthScore === 3 ? "bg-amber-400" : "bg-emerald-500"
                      : "bg-slate-200"
                  }`} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-4" aria-hidden="true">
                {strengthChecks.map((c) => (
                  <p key={c.label} className={`text-xs ${c.ok ? "text-emerald-600" : "text-slate-400"}`}>
                    {c.ok ? "✓" : "○"} {c.label}
                  </p>
                ))}
              </div>
            </div>
          )}
          {errors.password && <p id="password-error" role="alert" className="text-xs text-destructive mt-1">{errors.password.message}</p>}
        </div>

        <div>
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input id="confirmPassword" type="password" autoComplete="new-password" className="mt-1"
            placeholder="Re-enter password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
            {...register("confirmPassword")} />
          {errors.confirmPassword && <p id="confirmPassword-error" role="alert" className="text-xs text-destructive mt-1">{errors.confirmPassword.message}</p>}
        </div>

        {/* GDPR consent */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div>
            <label className="flex items-start gap-3 cursor-pointer" htmlFor="consentTerms">
              <input
                type="checkbox"
                id="consentTerms"
                className="mt-0.5 rounded border-slate-300"
                aria-invalid={!!errors.consentTerms}
                aria-describedby={errors.consentTerms ? "consentTerms-error" : undefined}
                {...register("consentTerms")}
              />
              <span className="text-sm text-slate-700">
                I agree to the{" "}
                <a href="/legal/terms" className="text-primary hover:underline">Terms of Service</a>
                {" "}and{" "}
                <a href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</a>.
                {" "}My personal data will be processed in accordance with GDPR.
              </span>
            </label>
            {errors.consentTerms && <p id="consentTerms-error" role="alert" className="text-xs text-destructive mt-1">{errors.consentTerms.message}</p>}
          </div>

          <label className="flex items-start gap-3 cursor-pointer" htmlFor="consentMarketing">
            <input type="checkbox" id="consentMarketing" className="mt-0.5 rounded border-slate-300" {...register("consentMarketing")} />
            <span className="text-sm text-slate-600">
              I consent to receiving certification updates, exam reminders, and relevant news by email. (Optional)
            </span>
          </label>
        </div>

        <Button type="submit" className="w-full gap-2 mt-2" disabled={loading}>
          {loading ? "Creating account…" : accountType === "organisation" ? "Create Organisation Account" : "Create Account"}
          {!loading && <ArrowRight className="w-4 h-4" />}
        </Button>
      </form>
    </div>
  );
}
