"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Search, Plus, Shield, ChevronDown, CheckCircle2,
  XCircle, Clock, MoreHorizontal, User, Mail, Phone,
  Edit2, Trash2, ShieldCheck, UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type StaffUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  phone: string | null;
};

const ROLES = [
  { value: "CANDIDATE", label: "Candidate", color: "bg-emerald-100 text-emerald-700" },
  { value: "TRAINER", label: "Trainer", color: "bg-amber-100 text-amber-700" },
  { value: "EXAMINER", label: "Examiner", color: "bg-purple-100 text-purple-700" },
  { value: "PROCTOR", label: "Proctor", color: "bg-orange-100 text-orange-700" },
  { value: "CERTIFICATION_OFFICER", label: "Certification Officer", color: "bg-blue-100 text-blue-700" },
  { value: "AUDITOR", label: "Auditor", color: "bg-slate-100 text-slate-700" },
  { value: "ORG_MANAGER", label: "Org Manager", color: "bg-indigo-100 text-indigo-700" },
  { value: "SUPER_ADMIN", label: "Super Admin", color: "bg-red-100 text-red-700" },
];

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  ACTIVE: { label: "Active", icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700" },
  INACTIVE: { label: "Inactive", icon: XCircle, color: "bg-slate-100 text-slate-600" },
  SUSPENDED: { label: "Suspended", icon: UserX, color: "bg-red-100 text-red-600" },
  PENDING_VERIFICATION: { label: "Pending", icon: Clock, color: "bg-amber-100 text-amber-700" },
};

const getRoleConfig = (role: string) =>
  ROLES.find((r) => r.value === role) ?? { label: role, color: "bg-slate-100 text-slate-600" };

export default function StaffManagement({
  initialUsers,
  total,
  isSuperAdmin,
  isOrgManager = false,
}: {
  initialUsers: StaffUser[];
  total: number;
  isSuperAdmin: boolean;
  isOrgManager?: boolean;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ firstName: "", lastName: "", email: "", role: "CANDIDATE", password: "", phone: "" });
  const [creating, setCreating] = useState(false);

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.firstName.toLowerCase().includes(q) || u.lastName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = !roleFilter || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  async function fetchUsers() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      const res = await fetch(`/api/users?${params}`);
      const data = await res.json();
      setUsers(data.users);
    } finally {
      setLoading(false);
    }
  }

  async function updateUserStatus(userId: string, status: string) {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, status } : u));
      toast.success("User status updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
    setOpenMenuId(null);
  }

  async function updateUserRole(userId: string, role: string) {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
      toast.success("User role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
    setOpenMenuId(null);
  }

  async function createUser() {
    if (!createForm.firstName || !createForm.lastName || !createForm.email || !createForm.password) {
      toast.error("Fill in all required fields");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create user");
      toast.success("User created successfully");
      setShowCreateModal(false);
      setCreateForm({ firstName: "", lastName: "", email: "", role: "CANDIDATE", password: "", phone: "" });
      await fetchUsers();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isOrgManager ? "My Organisation Members" : "Client Organisation Members"}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {isOrgManager
              ? `${total} member${total !== 1 ? "s" : ""} — you can suspend or activate members`
              : `${total} member${total !== 1 ? "s" : ""} across subscribed organisations`}
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add User
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {!isOrgManager && (
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        )}
        {!isOrgManager && (
          <Button variant="outline" onClick={fetchUsers} disabled={loading}>
            {loading ? "Loading…" : "Search"}
          </Button>
        )}
      </div>

      {/* User table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden md:table-cell">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden lg:table-cell">MFA</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden lg:table-cell">Last Login</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>No users found</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const statusConf = STATUS_CONFIG[user.status] ?? STATUS_CONFIG.INACTIVE;
                  const StatusIcon = statusConf.icon;
                  const roleConf = getRoleConfig(user.role);
                  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();

                  return (
                    <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{user.firstName} {user.lastName}</p>
                            <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {user.email}
                            </p>
                            {user.phone && (
                              <p className="text-xs text-slate-400 flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {user.phone}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge className={cn("border-0 text-xs", roleConf.color)}>{roleConf.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className={cn("w-3.5 h-3.5", statusConf.color.split(" ")[1])} />
                          <span className="text-xs text-slate-600">{statusConf.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {user.mfaEnabled ? (
                          <span className="text-xs text-emerald-600 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> On</span>
                        ) : (
                          <span className="text-xs text-slate-400">Off</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-500">
                        {user.lastLoginAt ? format(new Date(user.lastLoginAt), "d MMM yyyy") : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-slate-600"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {openMenuId === user.id && (
                            <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg z-10 min-w-44 py-1">
                              {isSuperAdmin && (
                                <>
                                  <p className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Change Role</p>
                                  {ROLES.filter((r) => r.value !== user.role).slice(0, 4).map((r) => (
                                    <button key={r.value} onClick={() => updateUserRole(user.id, r.value)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2">
                                      <Edit2 className="w-3.5 h-3.5 text-slate-400" /> {r.label}
                                    </button>
                                  ))}
                                  <div className="border-t border-slate-100 my-1" />
                                </>
                              )}
                              {user.status === "ACTIVE" ? (
                                <button onClick={() => updateUserStatus(user.id, "SUSPENDED")} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                                  <UserX className="w-3.5 h-3.5" /> Suspend Member
                                </button>
                              ) : (
                                <button onClick={() => updateUserStatus(user.id, "ACTIVE")} className="w-full text-left px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 flex items-center gap-2">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Activate Member
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="font-bold text-slate-900 text-lg mb-5">Create New User</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First Name *</Label>
                  <Input className="mt-1" value={createForm.firstName} onChange={(e) => setCreateForm((f) => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div>
                  <Label>Last Name *</Label>
                  <Input className="mt-1" value={createForm.lastName} onChange={(e) => setCreateForm((f) => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Email *</Label>
                <Input type="email" className="mt-1" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input type="tel" className="mt-1" value={createForm.phone} onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label>Role *</Label>
                <select
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                >
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Temporary Password * (min. 12 chars)</Label>
                <Input type="password" className="mt-1" value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button className="flex-1" onClick={createUser} disabled={creating}>
                {creating ? "Creating…" : "Create User"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
