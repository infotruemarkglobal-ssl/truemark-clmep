"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Permission = {
  id: string;
  resource: string;
  action: string;
  label: string;
  category: string;
};

type Role = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionIds: string[];
  userCount: number;
};

type GrantedMap = Map<string, Set<string>>; // roleId → Set<permissionId>

function buildGranted(roles: Role[]): GrantedMap {
  const map = new Map<string, Set<string>>();
  for (const r of roles) {
    map.set(r.id, new Set(r.permissionIds));
  }
  return map;
}

function groupByCategory(permissions: Permission[]) {
  const groups = new Map<string, Permission[]>();
  for (const p of permissions) {
    if (!groups.has(p.category)) groups.set(p.category, []);
    groups.get(p.category)!.push(p);
  }
  return groups;
}

const ROLE_DISPLAY: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  CERTIFICATION_OFFICER: "Cert. Officer",
  EXAMINER: "Examiner",
  TRAINER: "Trainer",
  PROCTOR: "Proctor",
  AUDITOR: "Auditor",
  ORG_MANAGER: "Org Manager",
  CANDIDATE: "Candidate",
};

export default function PermissionMatrix({
  initialPermissions,
  initialRoles,
}: {
  initialPermissions: Permission[];
  initialRoles: Role[];
}) {
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [granted, setGranted] = useState<GrantedMap>(() => buildGranted(initialRoles));
  const [pendingCell, setPendingCell] = useState<string | null>(null); // "roleId:permId"
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [showNewRole, setShowNewRole] = useState(false);
  const [creating, startCreate] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categories = groupByCategory(initialPermissions);

  async function togglePermission(roleId: string, permissionId: string) {
    const key = `${roleId}:${permissionId}`;
    if (pendingCell === key) return;

    const currentlyGranted = granted.get(roleId)?.has(permissionId) ?? false;
    setPendingCell(key);
    setError(null);

    // Optimistic update
    setGranted((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(roleId) ?? []);
      if (currentlyGranted) set.delete(permissionId);
      else set.add(permissionId);
      next.set(roleId, set);
      return next;
    });

    try {
      const res = await fetch(`/api/platform/roles/${roleId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionId, granted: !currentlyGranted }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update permission");
      }
    } catch (e) {
      // Revert on failure
      setGranted((prev) => {
        const next = new Map(prev);
        const set = new Set(next.get(roleId) ?? []);
        if (currentlyGranted) set.add(permissionId);
        else set.delete(permissionId);
        next.set(roleId, set);
        return next;
      });
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPendingCell(null);
    }
  }

  function handleCreateRole() {
    if (!newRoleName.trim()) return;
    setError(null);
    startCreate(async () => {
      const res = await fetch("/api/platform/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRoleName.trim(), description: newRoleDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create role"); return; }

      const newRole: Role = { ...data, permissionIds: [], userCount: 0 };
      setRoles((prev) => [...prev, newRole]);
      setGranted((prev) => { const next = new Map(prev); next.set(data.id, new Set()); return next; });
      setNewRoleName("");
      setNewRoleDesc("");
      setShowNewRole(false);
    });
  }

  async function handleDeleteRole(roleId: string) {
    setDeleting(roleId);
    setError(null);
    const res = await fetch(`/api/platform/roles/${roleId}/permissions`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to delete role");
    } else {
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
      setGranted((prev) => { const next = new Map(prev); next.delete(roleId); return next; });
    }
    setDeleting(null);
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Permission Matrix</h1>
          <p className="text-sm text-slate-500 mt-1">
            {roles.length} roles · {initialPermissions.length} permissions — click any cell to toggle
          </p>
        </div>
        <button
          onClick={() => setShowNewRole((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition"
        >
          <Plus className="w-4 h-4" /> New Role
        </button>
      </div>

      {/* New role form */}
      {showNewRole && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-slate-800">Create Custom Role</h3>
          <div className="flex gap-3">
            <input
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Role name (e.g. Content Reviewer)"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateRole()}
            />
            <input
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Description (optional)"
              value={newRoleDesc}
              onChange={(e) => setNewRoleDesc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateRole()}
            />
            <button
              onClick={handleCreateRole}
              disabled={creating || !newRoleName.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition flex items-center gap-2"
            >
              {creating && <Loader2 className="w-3 h-3 animate-spin" />} Create
            </button>
            <button
              onClick={() => setShowNewRole(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Matrix table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="text-sm border-collapse w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {/* Permission label column */}
              <th className="sticky left-0 z-10 bg-slate-50 px-5 py-3 text-left font-semibold text-slate-700 min-w-[220px] border-r border-slate-200">
                Permission
              </th>
              {roles.map((role) => (
                <th
                  key={role.id}
                  className="px-3 py-3 text-center font-medium text-slate-600 min-w-[110px] whitespace-nowrap"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-semibold text-xs text-slate-700">
                      {ROLE_DISPLAY[role.name] ?? role.name}
                    </span>
                    {role.isSystem ? (
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <ShieldCheck className="w-3 h-3" /> system
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDeleteRole(role.id)}
                        disabled={deleting === role.id}
                        title="Delete this role"
                        className="text-red-400 hover:text-red-600 transition"
                      >
                        {deleting === role.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3" />
                        }
                      </button>
                    )}
                    {role.userCount > 0 && (
                      <span className="text-[10px] text-slate-400">{role.userCount} user{role.userCount !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(categories.entries()).map(([category, perms]) => (
              <>
                {/* Category header row */}
                <tr key={`cat-${category}`} className="bg-slate-50/70">
                  <td
                    colSpan={roles.length + 1}
                    className="sticky left-0 px-5 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100"
                  >
                    {category}
                  </td>
                </tr>
                {/* Permission rows */}
                {perms.map((perm, i) => (
                  <tr
                    key={perm.id}
                    className={cn(
                      "border-b border-slate-100 hover:bg-slate-50/50 transition",
                      i === perms.length - 1 && "border-b-2 border-slate-200",
                    )}
                  >
                    <td className="sticky left-0 z-10 bg-white px-5 py-2.5 font-medium text-slate-700 border-r border-slate-100 whitespace-nowrap">
                      {perm.label}
                    </td>
                    {roles.map((role) => {
                      const isGranted = granted.get(role.id)?.has(perm.id) ?? false;
                      const cellKey = `${role.id}:${perm.id}`;
                      const isPending = pendingCell === cellKey;
                      return (
                        <td key={role.id} className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => togglePermission(role.id, perm.id)}
                            disabled={isPending}
                            aria-label={`${isGranted ? "Revoke" : "Grant"} ${perm.label} from ${role.name}`}
                            className={cn(
                              "w-5 h-5 rounded border-2 inline-flex items-center justify-center transition mx-auto",
                              isGranted
                                ? "bg-primary border-primary text-white"
                                : "border-slate-300 bg-white hover:border-primary/50",
                              isPending && "opacity-50 cursor-wait",
                            )}
                          >
                            {isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isGranted ? (
                              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            ) : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 text-center">
        Changes are saved instantly. System roles cannot be deleted but their permissions can be adjusted.
      </p>
    </div>
  );
}
