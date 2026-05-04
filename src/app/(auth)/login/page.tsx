import type { Metadata } from "next";
import LoginForm from "@/components/auth/LoginForm";
import { TruemarkLogo } from "@/components/TruemarkLogo";
import { Shield, Globe, Bot, Award } from "lucide-react";

export const metadata: Metadata = { title: "Sign In" };

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-[oklch(0.41_0.13_162.5)] to-slate-900 p-4 relative overflow-hidden">
      {/* dot grid background */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center relative z-10">
        {/* ── Left branding ── */}
        <div className="text-white space-y-6 hidden lg:block">
          <div className="flex items-center gap-3 mb-8">
            <TruemarkLogo className="w-12 h-12" />
            <div>
              <h1 className="text-2xl font-bold">Truemark Global</h1>
              <p className="text-emerald-200 text-sm">Standards &amp; Solutions Limited</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold leading-tight">
            Certification Learning Management &amp; Examination Platform
          </h2>
          <p className="text-emerald-100 text-lg">
            ISO/IEC 17024 compliant personnel certification system for
            individuals and organisations worldwide.
          </p>

          <div className="grid grid-cols-2 gap-4 mt-8">
            {[
              { icon: Shield, label: "ISO 17024", sub: "Compliant" },
              { icon: Globe, label: "Global", sub: "Recognition" },
              { icon: Bot, label: "AI Proctoring", sub: "Secure Exams" },
              { icon: Award, label: "Digital Certs", sub: "Verifiable" },
            ].map(({ icon: Icon, label, sub }) => (
              <div
                key={label}
                className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20"
              >
                <Icon className="w-6 h-6 mb-2" />
                <p className="font-semibold text-sm">{label}</p>
                <p className="text-xs text-emerald-200">{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right form panel ── */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
