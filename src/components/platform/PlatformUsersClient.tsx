"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { UserPlus, Loader2, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type PlatformUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  _count: { enrolments: number };
};

type Props = {
  users: PlatformUser[];
  currentUserId: string;
};

const INTERNAL_ROLES = [
  "SUPER_ADMIN",
  "CERTIFICATION_OFFICER",
  "EXAMINER",
  "TRAINER",
  "PROCTOR",
  "AUDITOR",
] as const;

type InternalRole = (typeof INTERNAL_ROLES)[number];

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  CERTIFICATION_OFFICER: "Cert. Officer",
  EXAMINER: "Examiner",
  TRAINER: "Trainer",
  PROCTOR: "Proctor",
  AUDITOR: "Auditor",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  INACTIVE: "bg-slate-100 text-slate-500",
  SUSPENDED: "bg-red-100 text-red-600",
  PENDING_VERIFICATION: "bg-amber-100 text-amber-700",
};

const inviteSchema = z.object({
  firstName: z.string().min(2, "At least 2 characters"),
  lastName: z.string().min(2, "At least 2 characters"),
  email: z.string().email("Enter a valid email address"),
  role: z.enum(INTERNAL_ROLES, { message: "Select a role" }),
  password: z.string().min(12, "Password must be at least 12 characters"),
});
type InviteForm = z.infer<typeof inviteSchema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1">{message}</p>;
}

export default function PlatformUsersClient({ users: initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<PlatformUser[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const byRole = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      counts[u.role] = (counts[u.role] ?? 0) + 1;
    }
    return counts;
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [users, search]);

  async function handleRoleChange(userId: string, newRole: string) {
    const prev = users.find((u) => u.id === userId)?.role;
    setUsers((cur) =>
      cur.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to update role");
        if (prev) {
          setUsers((cur) =>
            cur.map((u) => (u.id === userId ? { ...u, role: prev } : u))
          );
        }
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
      if (prev) {
        setUsers((cur) =>
          cur.map((u) => (u.id === userId ? { ...u, role: prev } : u))
        );
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Users</h1>
          <p className="text-slate-500 text-sm mt-1">
            Internal staff accounts with platform access.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <UserPlus className="w-4 h-4" /> Invite User
        </Button>
      </div>

      {/* Role stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {INTERNAL_ROLES.map((role) => (
          <div
            key={role}
            className="bg-white rounded-xl border border-slate-200 p-3 text-center shadow-sm"
          >
            <p className="text-2xl font-bold text-slate-900">{byRole[role] ?? 0}</p>
            <p className="text-xs text-slate-500 mt-0.5">{ROLE_LABELS[role]}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <Input
          placeholder="Search by name or email…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
            <Users className="w-8 h-8" />
            <p className="text-sm">{search ? "No users match your search" : "No platform users yet"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-slate-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Status</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Last Login</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Joined</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const statusColor = STATUS_COLORS[u.status] ?? "bg-slate-100 text-slate-500";
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-900">
                            {u.firstName} {u.lastName}
                            {isSelf && (
                              <span className="ml-2 text-xs text-slate-400 font-normal">(you)</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isSelf ? (
                          <span className="text-slate-500">{ROLE_LABELS[u.role] ?? u.role}</span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-ring/50 cursor-pointer"
                          >
                            {INTERNAL_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-slate-500">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleDateString()
                          : <span className="text-slate-300">Never</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/staff?userId=${u.id}`}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite User Dialog */}
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onCreated={(user) => setUsers((cur) => [user, ...cur])}
      />
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (user: PlatformUser) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteForm>({ resolver: zodResolver(inviteSchema) });

  async function onSubmit(data: InviteForm) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json() as { id?: string; email?: string; role?: string; error?: string };
      if (!res.ok) {
        toast.error(typeof result.error === "string" ? result.error : "Failed to create user");
        return;
      }
      const newUser: PlatformUser = {
        id: result.id!,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        role: data.role,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
        _count: { enrolments: 0 },
      };
      toast.success(`${data.firstName} ${data.lastName} invited`);
      onCreated(newUser);
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Platform User</DialogTitle>
          <DialogDescription>
            Creates an account with platform access. The user must change their password on first login.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-firstName">First Name</Label>
              <Input
                id="invite-firstName"
                placeholder="Jane"
                autoComplete="given-name"
                aria-invalid={!!errors.firstName}
                {...register("firstName")}
              />
              <FieldError message={errors.firstName?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-lastName">Last Name</Label>
              <Input
                id="invite-lastName"
                placeholder="Smith"
                autoComplete="family-name"
                aria-invalid={!!errors.lastName}
                {...register("lastName")}
              />
              <FieldError message={errors.lastName?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="jane@truemark.com"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            <FieldError message={errors.email?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              aria-invalid={!!errors.role}
              className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-transparent text-slate-700 focus:outline-none focus:ring-2 focus:ring-ring/50"
              {...register("role")}
            >
              <option value="">Select a role…</option>
              {INTERNAL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <FieldError message={errors.role?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-password">Temporary Password</Label>
            <Input
              id="invite-password"
              type="password"
              placeholder="Min. 12 characters"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            <FieldError message={errors.password?.message} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting} className="gap-2 w-full sm:w-auto">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Creating…" : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
