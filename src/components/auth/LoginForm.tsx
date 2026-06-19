"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { loginWithCredentials } from "@/app/(auth)/login/actions";
import { Eye, EyeOff, ArrowRight, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TruemarkLogoColour } from "@/components/TruemarkLogo";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

type LoginTab = "individual" | "organisation";

const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_SUSPENDED: "Your account has been suspended. Please contact support.",
  EMAIL_NOT_VERIFIED: "Please verify your email before signing in.",
  ACCOUNT_LOCKED: "Account temporarily locked. Please try again later.",
  CredentialsSignin: "Invalid email or password.",
};

export default function LoginForm() {
  const [tab, setTab] = useState<LoginTab>("individual");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const result = await loginWithCredentials(data.email, data.password);
      // result is only defined when auth failed — successful login throws
      // NEXT_REDIRECT from the server action which React converts to navigation.
      if (result?.error) {
        toast.error(ERROR_MESSAGES[result.error] ?? ERROR_MESSAGES.CredentialsSignin);
      }
    } catch (error) {
      // If the server action called redirect() (successful login), React's
      // runtime converts it to navigation. In some Next.js versions this
      // surfaces as a caught error before navigation completes — swallow it.
      if (
        error instanceof Error &&
        "digest" in error &&
        typeof (error as Error & { digest?: string }).digest === "string" &&
        (error as Error & { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        return;
      }
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Mobile logo */}
      <div className="text-center mb-8 lg:hidden">
        <TruemarkLogoColour className="w-52 h-[72px] mx-auto" />
      </div>

      {/* Tab selector */}
      <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-lg" role="tablist">
        {(["individual", "organisation"] as LoginTab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2 px-4 rounded-md text-sm font-medium transition flex items-center justify-center gap-2",
              tab === t
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            {t === "individual" ? (
              <User className="w-4 h-4" />
            ) : (
              <Building2 className="w-4 h-4" />
            )}
            {t === "individual" ? "Individual" : "Organisation"}
          </button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={
              tab === "organisation"
                ? "you@company.com"
                : "you@truemarkglobal.com"
            }
            className="mt-1"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="email-error" className="text-sm text-destructive mt-1">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative mt-1">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••••••"
              className="pr-10"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="text-sm text-destructive mt-1">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-primary focus:ring-primary"
              {...register("rememberMe")}
            />
            <span className="text-slate-600">Remember me</span>
          </label>
          <a
            href="/forgot-password"
            className="text-primary hover:text-primary/80 font-medium"
          >
            Forgot password?
          </a>
        </div>

        <Button type="submit" className="w-full gap-2" disabled={loading}>
          {loading ? "Signing in…" : "Sign In"}
          {!loading && <ArrowRight className="w-4 h-4" />}
        </Button>
      </form>

      {/* Social login */}
      <div className="mt-6 pt-6 border-t border-slate-200">
        <p className="text-center text-sm text-slate-600 mb-4">Or continue with</p>
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED) {
                toast.error("Google login is not configured. Please use email/password to sign in.");
                return;
              }
              signIn("google", { callbackUrl: "/dashboard" });
            }}
            className="gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!process.env.NEXT_PUBLIC_MICROSOFT_OAUTH_ENABLED) {
                toast.error("Microsoft login is not configured. Please use email/password to sign in.");
                return;
              }
              signIn("microsoft-entra-id", { callbackUrl: "/dashboard" });
            }}
            className="gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
              <path d="M11 11H0V0h11v11z" fill="#F25022" />
              <path d="M24 11H13V0h11v11z" fill="#7FBA00" />
              <path d="M11 24H0V13h11v11z" fill="#00A4EF" />
              <path d="M24 24H13V13h11v11z" fill="#FFB900" />
            </svg>
            Microsoft
          </Button>
        </div>
        <p className="text-center text-xs text-slate-400 mt-3">
          Social login requires additional configuration. Contact your administrator to enable it.
        </p>
      </div>

      {/* Register link */}
      <div className="mt-6 text-center">
        <p className="text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <a href="/register" className="text-primary font-semibold hover:text-primary/80">
            Create account
          </a>
        </p>
      </div>

    </>
  );
}
