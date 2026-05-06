import type { Metadata } from "next";
import Link from "next/link";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { TruemarkLogoColour } from "@/components/TruemarkLogo";

export const metadata: Metadata = { title: "Reset Password" };

export default function ForgotPasswordPage() {
  return (
    <div className="max-w-md mx-auto w-full">
      <div className="bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <TruemarkLogoColour className="w-48 h-14 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900">Reset Your Password</h1>
          <p className="text-slate-500 text-sm mt-1">
            Enter your email and we&apos;ll send reset instructions.
          </p>
        </div>
        <ForgotPasswordForm />
        <div className="mt-6 text-center text-sm text-slate-600">
          <Link href="/login" className="text-primary font-semibold hover:text-primary/80">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
