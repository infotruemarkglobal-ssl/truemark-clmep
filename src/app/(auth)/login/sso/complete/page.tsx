import type { Metadata } from "next";
import CompleteSsoLogin from "@/components/auth/CompleteSsoLogin";

export const metadata: Metadata = { title: "Signing you in…" };

export default function SsoCompletePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-[oklch(0.41_0.13_162.5)] to-slate-900 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <CompleteSsoLogin />
      </div>
    </div>
  );
}
