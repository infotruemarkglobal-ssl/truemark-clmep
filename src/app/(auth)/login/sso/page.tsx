import type { Metadata } from "next";
import { TruemarkLogo } from "@/components/TruemarkLogo";
import SsoLoginForm from "@/components/auth/SsoLoginForm";

export const metadata: Metadata = { title: "Sign In with Your Organisation" };

export default function SsoLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-[oklch(0.41_0.13_162.5)] to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <TruemarkLogo className="w-56 h-20" />
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <SsoLoginForm />
        </div>
        <p className="text-center text-xs text-gray-200 mt-4">
          <a href="/login" className="hover:text-white hover:underline transition-colors">
            ← Back to regular sign in
          </a>
        </p>
      </div>
    </div>
  );
}
