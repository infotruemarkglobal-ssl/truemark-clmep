"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  User, Mail, Phone, MapPin, Briefcase, Calendar,
  Shield, CheckCircle2, Eye, EyeOff, Save, PenLine, Trash2, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type UserProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  signatureUrl: string | null;
  role: string;
  status: string;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  profile: {
    professionalTitle: string | null;
    employer: string | null;
    country: string | null;
    linkedinUrl: string | null;
  } | null;
};

const profileSchema = z.object({
  firstName: z.string().min(2, "Required"),
  lastName: z.string().min(2, "Required"),
  phone: z.string().optional(),
  professionalTitle: z.string().optional(),
  employer: z.string().optional(),
  country: z.string().optional(),
  linkedinUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z
      .string()
      .min(12, "At least 12 characters")
      .regex(/[A-Z]/, "Needs uppercase")
      .regex(/[0-9]/, "Needs number")
      .regex(/[^A-Za-z0-9]/, "Needs special character"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

const roleLabels: Record<string, string> = {
  CANDIDATE: "Candidate",
  TRAINER: "Trainer",
  EXAMINER: "Examiner",
  CERTIFICATION_OFFICER: "Certification Officer",
  PROCTOR: "Proctor",
  AUDITOR: "Auditor",
  ORG_MANAGER: "Org Manager",
  SUPER_ADMIN: "Super Admin",
};

export default function ProfilePage({ user }: { user: UserProfile }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"profile" | "security">("profile");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState(user.signatureUrl);
  const [uploadingSig, setUploadingSig] = useState(false);
  const [removingSig, setRemovingSig] = useState(false);

  const canManageSignature = ["CERTIFICATION_OFFICER", "SUPER_ADMIN"].includes(user.role);

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? "",
      professionalTitle: user.profile?.professionalTitle ?? "",
      employer: user.profile?.employer ?? "",
      country: user.profile?.country ?? "",
      linkedinUrl: user.profile?.linkedinUrl ?? "",
    },
  });

  const passwordForm = useForm<PasswordFormData>({ resolver: zodResolver(passwordSchema) });

  async function saveProfile(data: ProfileFormData) {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      toast.success("Profile updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(data: PasswordFormData) {
    setSavingPassword(true);
    try {
      const res = await fetch("/api/users/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Password changed successfully");
      passwordForm.reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  }

  async function uploadSignature(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSig(true);
    try {
      const fd = new FormData();
      fd.append("signature", file);
      const res = await fetch("/api/users/me/signature", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      const { signatureUrl: url } = await res.json();
      setSignatureUrl(url);
      toast.success("Signature saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingSig(false);
      e.target.value = "";
    }
  }

  async function removeSignature() {
    setRemovingSig(true);
    try {
      const res = await fetch("/api/users/me/signature", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setSignatureUrl(null);
      toast.success("Signature removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setRemovingSig(false);
    }
  }

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-5">
          <div className="relative w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
            {user.photoUrl ? (
              <Image src={user.photoUrl} alt="Profile" fill sizes="80px" className="rounded-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{user.firstName} {user.lastName}</h1>
            <p className="text-slate-500 text-sm">{user.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge className="bg-primary/10 text-primary border-0">{roleLabels[user.role] ?? user.role}</Badge>
              <Badge className={cn("border-0", user.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                {user.status}
              </Badge>
              {user.mfaEnabled && (
                <Badge className="bg-blue-100 text-blue-700 border-0 gap-1">
                  <Shield className="w-3 h-3" /> MFA Enabled
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right text-xs text-slate-400 shrink-0 hidden sm:block">
            <p>Member since {format(new Date(user.createdAt), "MMM yyyy")}</p>
            {user.lastLoginAt && <p>Last login {format(new Date(user.lastLoginAt), "d MMM yyyy")}</p>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(["profile", "security"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium capitalize transition",
              activeTab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            {t === "profile" ? "Profile Details" : "Security"}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-900 mb-5 flex items-center gap-2">
            <User className="w-5 h-5 text-primary" /> Personal Information
          </h2>
          <form onSubmit={profileForm.handleSubmit(saveProfile)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" className="mt-1" {...profileForm.register("firstName")} />
                {profileForm.formState.errors.firstName && (
                  <p className="text-xs text-destructive mt-1">{profileForm.formState.errors.firstName.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" className="mt-1" {...profileForm.register("lastName")} />
                {profileForm.formState.errors.lastName && (
                  <p className="text-xs text-destructive mt-1">{profileForm.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email Address</Label>
              <div className="relative mt-1">
                <Input id="email" value={user.email} disabled className="pr-24 bg-slate-50" />
                <div className="absolute right-3 top-2.5 flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">Email changes require verification — contact support.</p>
            </div>

            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative mt-1">
                <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input id="phone" type="tel" className="pl-9" placeholder="+1 234 567 8900" {...profileForm.register("phone")} />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="professionalTitle">Job Title</Label>
                <div className="relative mt-1">
                  <Briefcase className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <Input id="professionalTitle" className="pl-9" placeholder="e.g. Quality Manager" {...profileForm.register("professionalTitle")} />
                </div>
              </div>
              <div>
                <Label htmlFor="employer">Employer / Organisation</Label>
                <Input id="employer" className="mt-1" placeholder="Company name" {...profileForm.register("employer")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="country">Country</Label>
                <div className="relative mt-1">
                  <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <Input id="country" className="pl-9" placeholder="e.g. United Kingdom" {...profileForm.register("country")} />
                </div>
              </div>
              <div>
                <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
                <Input id="linkedinUrl" type="url" className="mt-1" placeholder="https://linkedin.com/in/..." {...profileForm.register("linkedinUrl")} />
                {profileForm.formState.errors.linkedinUrl && (
                  <p className="text-xs text-destructive mt-1">{profileForm.formState.errors.linkedinUrl.message}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={savingProfile} className="gap-2">
                <Save className="w-4 h-4" />
                {savingProfile ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === "security" && (
        <div className="space-y-5">
          {/* Change Password */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-semibold text-slate-900 mb-5 flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" /> Change Password
            </h2>
            <form onSubmit={passwordForm.handleSubmit(changePassword)} className="space-y-4">
              <div>
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="currentPassword"
                    type={showCurrent ? "text" : "password"}
                    className="pr-10"
                    {...passwordForm.register("currentPassword")}
                  />
                  <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordForm.formState.errors.currentPassword && (
                  <p className="text-xs text-destructive mt-1">{passwordForm.formState.errors.currentPassword.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="newPassword"
                    type={showNew ? "text" : "password"}
                    className="pr-10"
                    {...passwordForm.register("newPassword")}
                  />
                  <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordForm.formState.errors.newPassword && (
                  <p className="text-xs text-destructive mt-1">{passwordForm.formState.errors.newPassword.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  className="mt-1"
                  {...passwordForm.register("confirmPassword")}
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-destructive mt-1">{passwordForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={savingPassword} className="gap-2">
                  {savingPassword ? "Changing…" : "Change Password"}
                </Button>
              </div>
            </form>
          </div>

          {/* MFA */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" /> Multi-Factor Authentication
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {user.mfaEnabled
                    ? "MFA is enabled. Your account is protected by an authenticator app."
                    : "Add an extra layer of security to your account."}
                </p>
              </div>
              <Badge className={cn("border-0", user.mfaEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                {user.mfaEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <div className="mt-4">
              {user.mfaEnabled ? (
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={async () => {
                    if (!confirm("Are you sure you want to disable MFA? This will reduce the security of your account.")) return;
                    const res = await fetch("/api/auth/mfa/disable", { method: "POST" });
                    if (res.ok) {
                      toast.success("MFA disabled");
                      router.refresh();
                    } else {
                      const d = await res.json().catch(() => ({}));
                      toast.error(d.error ?? "Failed to disable MFA");
                    }
                  }}
                >
                  Disable MFA
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => router.push("/mfa-verify?next=" + encodeURIComponent("/profile"))}
                >
                  Set up MFA
                </Button>
              )}
            </div>
          </div>

          {/* Signature — only shown to Certification Officers and Admins */}
          {canManageSignature && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
                <PenLine className="w-5 h-5 text-primary" /> Certificate Signature
              </h2>
              <p className="text-sm text-slate-500 mb-5">
                This signature image will appear on PDF certificates you approve. PNG recommended, transparent background, max 2 MB.
              </p>
              {signatureUrl ? (
                <div className="flex items-end gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signatureUrl}
                    alt="Your signature"
                    className="h-16 border border-slate-200 rounded-lg bg-slate-50 p-2 object-contain"
                  />
                  <div className="flex gap-2">
                    <label className="cursor-pointer">
                      <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={uploadSignature} />
                      <span className={cn(
                        "inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition",
                        uploadingSig && "opacity-50 pointer-events-none"
                      )}>
                        <Upload className="w-4 h-4" />
                        {uploadingSig ? "Uploading…" : "Replace"}
                      </span>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50 gap-2"
                      onClick={removeSignature}
                      disabled={removingSig}
                    >
                      <Trash2 className="w-4 h-4" />
                      {removingSig ? "Removing…" : "Remove"}
                    </Button>
                  </div>
                </div>
              ) : (
                <label className="cursor-pointer w-fit block">
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={uploadSignature} />
                  <span className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:border-primary hover:text-primary transition",
                    uploadingSig && "opacity-50 pointer-events-none"
                  )}>
                    <Upload className="w-4 h-4" />
                    {uploadingSig ? "Uploading…" : "Upload signature image"}
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Session info */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" /> Account Information
            </h2>
            <div className="space-y-3 text-sm">
              {[
                { label: "Account created", value: format(new Date(user.createdAt), "d MMMM yyyy") },
                { label: "Last login", value: user.lastLoginAt ? format(new Date(user.lastLoginAt), "d MMMM yyyy, HH:mm") : "Never" },
                { label: "Account status", value: user.status },
                { label: "Account ID", value: user.id, mono: true },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="text-slate-500">{label}</span>
                  <span className={cn("font-medium text-slate-900", mono && "font-mono text-xs")}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
