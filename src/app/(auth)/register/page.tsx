import type { Metadata } from "next";
import Link from "next/link";
import RegisterForm from "@/components/auth/RegisterForm";
import { TruemarkLogoColour } from "@/components/TruemarkLogo";

export const metadata: Metadata = { title: "Create Account" };

export default function RegisterPage() {
  return (
    <div className="max-w-lg mx-auto w-full">
      <div className="bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <TruemarkLogoColour className="w-48 h-14 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900">Create Your Account</h1>
          <p className="text-slate-500 text-sm mt-1">
            Join Truemark Global and start your certification journey
          </p>
        </div>
        <RegisterForm />
        <div className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-semibold hover:text-primary/80">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
