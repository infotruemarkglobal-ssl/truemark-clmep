"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ChevronLeft, Shield, ShieldOff, AlertTriangle, KeyRound,
  Lock, Unlock, Building2, Loader2,
  Pencil, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrgMembership = {
  id: string;
  role: string;
  joinedAt: string;
  organisation: { id: string; name: string };
};

type UserDetail = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  organisationMemberships: OrgMembership[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_ROLES = [
  { value: "SUPER_ADMIN",           label: "Super Admin" },
  { value: "CERTIFICATION_OFFICER", label: "Certification Officer" },
  { value: "EXAMINER",              label: "Examiner" },
  { value: "TRAINER",               label: "Trainer" },
  { value: "PROCTOR",               label: "Proctor" },
  { value: "AUDITOR",               label: "Auditor" },
  { value: "ORG_MANAGER",           label: "Org Manager" },
  { value: "CANDIDATE",             label: "Candidate" },
  { value: "SUPPORT_AGENT",         label: "Support Agent" },
];

// ── Style maps ────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN:           "bg-red-100 text-red-700",
  CERTIFICATION_OFFICER: "bg-blue-100 text-blue-700",
  EXAMINER:              "bg-purple-100 text-purple-700",
  TRAINER:               "bg-amber-100 text-amber-700",
  PROCTOR:               "bg-orange-100 text-orange-700",
  AUDITOR:               "bg-slate-100 text-slate-700",
  ORG_MANAGER:           "bg-indigo-100 text-indigo-700",
  CANDIDATE:             "bg-emerald-100 text-emerald-700",
  SUPPORT_AGENT:         "bg-teal-100 text-teal-700",
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:               "bg-emerald-100 text-emerald-700",
  INACTIVE:             "bg-slate-100 text-slate-500",
  SUSPENDED:            "bg-red-100 text-red-700",
  PENDING_VERIFICATION: "bg-amber-100 text-amber-700",
};

// ── Confirmation dialog ───────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
              destructive ? "bg-red-100" : "bg-amber-100",
            )}>
              <AlertTriangle className={cn("w-6 h-6", destructive ? "text-red-600" : "text-amber-600")} />
            </div>
            <div>
              <DialogTitle className="font-bold text-slate-900 text-lg">{title}</DialogTitle>
              <DialogDescription className="text-slate-500 text-sm mt-1">{body}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            className={cn("gap-2", destructive && "bg-red-600 hover:bg-red-700 text-white")}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlatformUserDetail({
  user: initialUser,
  isSelf,
}: {
  user: UserDetail;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<null | "reset" | "suspend" | "unlock">(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: initialUser.firstName,
    lastName: initialUser.lastName,
    email: initialUser.email,
    role: initialUser.role,
  });
  const [editLoading, setEditLoading] = useState(false);

  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();

  function openEdit() {
    setEditForm({ firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role });
    setEditing(true);
  }

  async function saveEdits() {
    setEditLoading(true);
    try {
      const res = await fetch(`/api/platform/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          email: editForm.email.trim().toLowerCase(),
          ...(isSelf ? {} : { role: editForm.role }),
        }),
      });
      const data = await res.json() as { firstName?: string; lastName?: string; email?: string; role?: string; error?: string };
      if (!res.ok) { toast.error(data.error ?? "Failed to save"); return; }
      setUser((u) => ({
        ...u,
        firstName: data.firstName ?? u.firstName,
        lastName: data.lastName ?? u.lastName,
        email: data.email ?? u.email,
        role: data.role ?? u.role,
      }));
      setEditing(false);
      toast.success("User details updated");
      router.refresh();
    } finally {
      setEditLoading(false);
    }
  }

  async function runAction(action: "reset" | "suspend" | "unlock") {
    setLoading(true);
    try {
      if (action === "reset") {
        const res = await fetch(`/api/platform/users/${user.id}/reset-password`, { method: "POST" });
        const data = await res.json() as { error?: string };
        if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
        toast.success(`Temporary password emailed to ${user.email}`);
      } else if (action === "suspend") {
        const res = await fetch(`/api/platform/users/${user.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "SUSPENDED" }),
        });
        const data = await res.json() as { status?: string; error?: string };
        if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
        setUser((u) => ({ ...u, status: data.status ?? "SUSPENDED" }));
        toast.success("User suspended");
      } else {
        const res = await fetch(`/api/platform/users/${user.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lockedUntil: null, failedLoginCount: 0, status: "ACTIVE" }),
        });
        const data = await res.json() as { status?: string; failedLoginCount?: number; lockedUntil?: string | null; error?: string };
        if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
        setUser((u) => ({
          ...u,
          status: data.status ?? "ACTIVE",
          failedLoginCount: data.failedLoginCount ?? 0,
          lockedUntil: data.lockedUntil ?? null,
        }));
        toast.success("Account unlocked");
      }
      router.refresh();
    } finally {
      setLoading(false);
      setConfirm(null);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Back */}
      <Link href="/platform/users" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition">
        <ChevronLeft className="w-4 h-4" /> Platform Users
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900">
              {user.firstName} {user.lastName}
              {isSelf && <span className="ml-2 text-sm font-normal text-slate-400">(you)</span>}
            </h1>
            <p className="text-sm text-slate-500">{user.email}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", ROLE_BADGE[user.role] ?? "bg-slate-100 text-slate-700")}>
                {user.role.replace(/_/g, " ")}
              </span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", STATUS_BADGE[user.status] ?? "bg-slate-100 text-slate-500")}>
                {user.status}
              </span>
              {user.mustChangePassword && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  Password reset required
                </span>
              )}
              {isLocked && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Locked
                </span>
              )}
            </div>
          </div>
          {!editing && (
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={openEdit}>
              <Pencil className="w-3.5 h-3.5" /> Edit Details
            </Button>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 text-sm uppercase tracking-wide">Edit Details</h2>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-slate-400 hover:text-slate-600 transition"
              aria-label="Cancel edit"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">First Name</label>
              <input
                type="text"
                value={editForm.firstName}
                onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Last Name</label>
              <input
                type="text"
                value={editForm.lastName}
                onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs font-medium text-slate-600">Email</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs font-medium text-slate-600">
                Role
                {isSelf && <span className="ml-1 text-slate-400 font-normal">(cannot change your own role)</span>}
              </label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                disabled={isSelf}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={editLoading}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveEdits}
              disabled={editLoading || !editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.email.trim()}
              className="gap-1.5"
            >
              {editLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editLoading ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      )}

      {/* Account details */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide">Account Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {[
            { label: "Joined", value: format(new Date(user.createdAt), "d MMM yyyy") },
            { label: "Last login", value: user.lastLoginAt ? format(new Date(user.lastLoginAt), "d MMM yyyy, HH:mm") : "Never" },
            { label: "MFA", value: user.mfaEnabled ? "Enabled" : "Disabled" },
            { label: "Failed logins", value: String(user.failedLoginCount) },
            {
              label: "Account locked until",
              value: user.lockedUntil ? format(new Date(user.lockedUntil), "d MMM yyyy, HH:mm") : "Not locked",
            },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start gap-2">
              <dt className="text-xs text-slate-400 w-32 shrink-0 pt-0.5">{label}</dt>
              <dd className="text-sm text-slate-700 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Organisation memberships */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400" /> Organisation Memberships
        </h2>
        {user.organisationMemberships.length === 0 ? (
          <p className="text-sm text-slate-400">No organisation memberships.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {user.organisationMemberships.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-800">{m.organisation.name}</p>
                  <p className="text-xs text-slate-400">
                    {m.role} · joined {format(new Date(m.joinedAt), "d MMM yyyy")}
                  </p>
                </div>
                <Link
                  href={`/organisations/${m.organisation.id}`}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
                >
                  View org
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      {!isSelf && (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-5">
          <h2 className="font-semibold text-red-700 mb-1 text-sm uppercase tracking-wide flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Danger Zone
          </h2>
          <p className="text-xs text-slate-500 mb-4">These actions are immediate and logged.</p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50"
              onClick={() => setConfirm("reset")}
            >
              <KeyRound className="w-3.5 h-3.5" /> Force Password Reset
            </Button>

            {user.status !== "SUSPENDED" ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => setConfirm("suspend")}
              >
                <ShieldOff className="w-3.5 h-3.5" /> Suspend User
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={() => setConfirm("unlock")}
              >
                <Shield className="w-3.5 h-3.5" /> Reinstate User
              </Button>
            )}

            {isLocked && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => setConfirm("unlock")}
              >
                <Unlock className="w-3.5 h-3.5" /> Unlock Account
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirm === "reset"}
        title="Force Password Reset"
        body={`A temporary password will be emailed to ${user.firstName} ${user.lastName} (${user.email}). They will be required to change it on next login.`}
        confirmLabel="Send Reset Email"
        onConfirm={() => runAction("reset")}
        onCancel={() => setConfirm(null)}
        loading={loading}
      />
      <ConfirmDialog
        open={confirm === "suspend"}
        title="Suspend User"
        body={`${user.firstName} ${user.lastName} will immediately lose access to the platform. You can reinstate them at any time.`}
        confirmLabel="Suspend"
        destructive
        onConfirm={() => runAction("suspend")}
        onCancel={() => setConfirm(null)}
        loading={loading}
      />
      <ConfirmDialog
        open={confirm === "unlock"}
        title={user.status === "SUSPENDED" ? "Reinstate User" : "Unlock Account"}
        body={
          user.status === "SUSPENDED"
            ? `${user.firstName} ${user.lastName} will regain access to the platform.`
            : `This will clear the login lock and reset the failed login counter for ${user.firstName} ${user.lastName}.`
        }
        confirmLabel={user.status === "SUSPENDED" ? "Reinstate" : "Unlock"}
        onConfirm={() => runAction("unlock")}
        onCancel={() => setConfirm(null)}
        loading={loading}
      />
    </div>
  );
}
