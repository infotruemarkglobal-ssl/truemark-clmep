"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TruemarkLogoColour } from "@/components/TruemarkLogo";

export default function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const strength = getStrength(newPassword);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const localErrors: Record<string, string> = {};
    if (newPassword.length < 8) localErrors.newPassword = "Password must be at least 8 characters";
    if (newPassword !== confirmPassword) localErrors.confirmPassword = "Passwords do not match";
    if (Object.keys(localErrors).length > 0) { setErrors(localErrors); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/profile/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(data.error.fieldErrors as Record<string, string[]>)) {
            flat[k] = v[0];
          }
          setErrors(flat);
        } else {
          toast.error(data.error ?? "Failed to change password");
        }
        return;
      }

      toast.success("Password changed. Please log in with your new password.");
      // Sign out and redirect to login — the token still has mustChangePassword=true
      // until a fresh login is completed, so we must fully sign out.
      window.location.href = "/api/auth/signout?callbackUrl=/login";
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <TruemarkLogoColour className="w-10 h-10" />
          <div>
            <p className="font-bold text-slate-900 text-lg leading-tight">Truemark Global</p>
            <p className="text-xs text-primary font-medium leading-tight">Certification Portal</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {/* Header */}
          <div className="mb-6">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Set a new password</h1>
            <p className="text-slate-500 text-sm mt-1">
              Your account requires a password change before you can continue. Choose a strong, unique password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* New password */}
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  className="pl-9 pr-10"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? "Hide password" : "Show password"}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.newPassword && <p className="text-xs text-red-600">{errors.newPassword}</p>}

              {/* Strength meter */}
              {newPassword.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((n) => (
                      <div
                        key={n}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${n <= strength.score ? strength.color : "bg-slate-200"}`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs font-medium ${strength.textColor}`}>{strength.label}</p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  className="pl-9 pr-10"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-xs text-red-600">{errors.confirmPassword}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving…" : "Set new password & continue"}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <a
              href="/api/auth/signout?callbackUrl=/login"
              className="text-xs text-slate-400 hover:text-slate-600 transition"
            >
              Sign out instead
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Password strength helper ─────────────────────────────────────────────────

function getStrength(password: string): { score: number; label: string; color: string; textColor: string } {
  if (password.length === 0) return { score: 0, label: "", color: "", textColor: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { score: 1, label: "Weak", color: "bg-red-400", textColor: "text-red-600" },
    { score: 2, label: "Fair", color: "bg-amber-400", textColor: "text-amber-600" },
    { score: 3, label: "Good", color: "bg-blue-400", textColor: "text-blue-600" },
    { score: 4, label: "Strong", color: "bg-emerald-500", textColor: "text-emerald-600" },
  ];
  return levels[Math.min(score, 4) - 1] ?? levels[0];
}
