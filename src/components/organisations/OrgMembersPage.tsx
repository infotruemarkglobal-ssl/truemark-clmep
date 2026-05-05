"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Users, Plus, Search, Trash2, BookOpen, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, UserPlus, Mail, X, Send, Building2,
  Clock, Award, Loader2, UserCheck, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type MemberEnrolment = {
  courseId: string;
  status: string;
  progress: number;
  course: { id: string; title: string; slug: string };
};

type Member = {
  id: string;
  joinedAt: string;
  role: string;
  department: { id: string; name: string } | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    status: string;
    lastLoginAt: string | null;
    mustChangePassword: boolean;
    enrolments: MemberEnrolment[];
  };
};

type Course = {
  id: string;
  title: string;
  slug: string;
  cpdHours: number;
  price: number;
  currency: string;
  schemeCode: string | null;
  schemeName: string | null;
};

type Department = { id: string; name: string };

type SeatPool = {
  id: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  totalSeats: number;
  usedSeats: number;
  expiresAt: string | null;
  assignedUserIds: string[];
};

type AddMode = "add" | "create";
type Tab = "members" | "seats";

export default function OrgMembersPage({
  org,
  members: initialMembers,
  courses,
  departments,
  seatPools: initialSeatPools,
}: {
  org: { id: string; name: string };
  members: Member[];
  courses: Course[];
  departments: Department[];
  seatPools: SeatPool[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("members");
  const [members, setMembers] = useState(initialMembers);
  const [seatPools, setSeatPools] = useState(initialSeatPools);
  const [search, setSearch] = useState("");
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  // Seat assignment state
  const [assignSeat, setAssignSeat] = useState<SeatPool | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [seatAssigning, setSeatAssigning] = useState(false);

  async function handleAssignSeat() {
    if (!assignSeat || !assignUserId) return;
    setSeatAssigning(true);
    try {
      const res = await fetch("/api/organisations/seats/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatId: assignSeat.id, userId: assignUserId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Assignment failed"); return; }
      toast.success("Seat assigned and member enrolled.");
      setSeatPools((prev) =>
        prev.map((p) =>
          p.id === assignSeat.id
            ? { ...p, usedSeats: p.usedSeats + 1, assignedUserIds: [...p.assignedUserIds, assignUserId] }
            : p,
        ),
      );
      setAssignSeat(null);
      setAssignUserId("");
      router.refresh();
    } finally {
      setSeatAssigning(false);
    }
  }

  // Add/create member dialog
  const [showDialog, setShowDialog] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("add");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", role: "CANDIDATE", departmentId: "" });
  const [saving, setSaving] = useState(false);

  // Course assignment
  const [assigningTo, setAssigningTo] = useState<Member | null>(null);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Remove member
  const [removingId, setRemovingId] = useState<string | null>(null);

  const filtered = useMemo(() =>
    members.filter((m) => {
      const q = search.toLowerCase();
      return (
        m.user.firstName.toLowerCase().includes(q) ||
        m.user.lastName.toLowerCase().includes(q) ||
        m.user.email.toLowerCase().includes(q) ||
        m.department?.name.toLowerCase().includes(q)
      );
    }), [members, search]);

  // ── Add / create member ───────────────────────────────────────────────────

  function resetDialog() {
    setForm({ firstName: "", lastName: "", email: "", role: "CANDIDATE", departmentId: "" });
    setSaving(false);
  }

  async function handleAddMember() {
    if (!form.email) { toast.error("Email is required"); return; }
    if (addMode === "create" && (!form.firstName || !form.lastName)) {
      toast.error("First and last name are required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/organisations/${org.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: addMode,
          ...form,
          departmentId: form.departmentId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === "string"
          ? data.error
          : data.error?.formErrors?.[0] ?? "Failed to add member";
        toast.error(msg);
        return;
      }

      if (addMode === "create" && data.newUser) {
        toast.success(`Account created for ${form.firstName} ${form.lastName}. A welcome email with login details has been sent to ${form.email}.`);
      } else if (data.existingUser) {
        toast.success(`${data.user.firstName} ${data.user.lastName} added to ${org.name}.`);
      } else {
        toast.success(`${data.user.firstName} ${data.user.lastName} added to ${org.name}.`);
      }

      setShowDialog(false);
      resetDialog();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // ── Remove member ─────────────────────────────────────────────────────────

  async function handleRemove(member: Member) {
    if (!confirm(`Remove ${member.user.firstName} ${member.user.lastName} from ${org.name}?`)) return;
    setRemovingId(member.id);
    try {
      const res = await fetch(`/api/organisations/${org.id}/members/${member.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to remove member"); return; }
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      toast.success(`${member.user.firstName} ${member.user.lastName} removed.`);
    } finally {
      setRemovingId(null);
    }
  }

  // ── Assign course ─────────────────────────────────────────────────────────

  async function handleAssign() {
    if (!assigningTo || !selectedCourse) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/organisations/${org.id}/enrol`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: selectedCourse, userIds: [assigningTo.user.id] }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to assign course"); return; }
      toast.success(`Course assigned to ${assigningTo.user.firstName}.`);
      setAssigningTo(null);
      setSelectedCourse("");
      router.refresh();
    } finally {
      setAssigning(false);
    }
  }

  // ── Status badge ──────────────────────────────────────────────────────────

  function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
      ACTIVE: "bg-emerald-100 text-emerald-700",
      INACTIVE: "bg-slate-100 text-slate-600",
      SUSPENDED: "bg-red-100 text-red-700",
      PENDING_VERIFICATION: "bg-amber-100 text-amber-700",
    };
    return (
      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", map[status] ?? "bg-slate-100 text-slate-600")}>
        {status.replace(/_/g, " ")}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Members &amp; Courses</h1>
          <p className="text-slate-500 text-sm mt-1">
            {org.name} — {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>
        {tab === "members" && (
          <Button
            onClick={() => { setAddMode("add"); setShowDialog(true); }}
            className="gap-2"
            title="Add an existing user or create a new account and invite them by email"
          >
            <UserPlus className="w-4 h-4" />
            Add Member
          </Button>
        )}
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-slate-200">
        {(["members", "seats"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t === "members" ? "Members" : `Assign Seats${seatPools.length > 0 ? ` (${seatPools.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* ── Assign Seats tab ── */}
      {tab === "seats" && (
        <div className="space-y-4">
          {seatPools.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center gap-3 text-center">
              <Award className="w-10 h-10 text-slate-200" />
              <p className="font-medium text-slate-600">No seat pools yet</p>
              <p className="text-sm text-slate-400">
                Purchase course seats from the{" "}
                <button type="button" className="underline hover:text-slate-600" onClick={() => router.push("/courses")}>
                  course catalogue
                </button>{" "}
                to assign members.
              </p>
            </div>
          ) : (
            seatPools.map((pool) => {
              const available = pool.totalSeats - pool.usedSeats;
              const eligible = members.filter(
                (m) => !pool.assignedUserIds.includes(m.user.id),
              );
              return (
                <div key={pool.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="font-semibold text-slate-900">{pool.courseTitle}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {pool.usedSeats} / {pool.totalSeats} seats used
                        {pool.expiresAt && ` · Expires ${new Date(pool.expiresAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <span className={cn(
                      "text-xs font-semibold px-2.5 py-1 rounded-full shrink-0",
                      available > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                    )}>
                      {available} available
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-slate-100 rounded-full mb-4">
                    <div
                      className="h-1.5 bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min(100, (pool.usedSeats / pool.totalSeats) * 100)}%` }}
                    />
                  </div>

                  {available > 0 && (
                    assignSeat?.id === pool.id ? (
                      <div className="flex items-center gap-2 mt-2">
                        <select
                          value={assignUserId}
                          onChange={(e) => setAssignUserId(e.target.value)}
                          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-ring/50"
                        >
                          <option value="">Select member…</option>
                          {eligible.map((m) => (
                            <option key={m.user.id} value={m.user.id}>
                              {m.user.firstName} {m.user.lastName}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          onClick={handleAssignSeat}
                          disabled={!assignUserId || seatAssigning}
                          className="gap-2 shrink-0"
                        >
                          {seatAssigning ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                          Assign
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setAssignSeat(null); setAssignUserId(""); }}
                          className="shrink-0"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setAssignSeat(pool); setAssignUserId(""); }}
                        className="gap-2"
                        disabled={eligible.length === 0}
                        title={eligible.length === 0 ? "All members already assigned" : undefined}
                      >
                        <UserCheck className="w-3 h-3" /> Assign a Seat
                      </Button>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Members tab ── */}
      {tab === "members" && <>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search by name, email, or department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Members list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500 font-medium">
              {members.length === 0 ? "No members yet" : "No members match your search"}
            </p>
            {members.length === 0 && (
              <p className="text-slate-400 text-sm mt-1">Add members to assign courses and track their progress.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((member) => {
              const expanded = expandedMember === member.id;
              const active = member.user.enrolments.filter((e) => e.status === "ACTIVE");
              const completed = member.user.enrolments.filter((e) => e.status === "COMPLETED");
              const hasNotLoggedIn = !member.user.lastLoginAt;
              const pendingPasswordChange = member.user.mustChangePassword;

              return (
                <div key={member.id}>
                  {/* Member row */}
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                      {member.user.firstName[0]}{member.user.lastName[0]}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 text-sm">
                          {member.user.firstName} {member.user.lastName}
                        </span>
                        <StatusBadge status={member.user.status} />
                        {pendingPasswordChange && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                            <ShieldAlert className="w-2.5 h-2.5" /> Temp password
                          </span>
                        )}
                        {hasNotLoggedIn && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                            Never logged in
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{member.user.email}</p>
                      {member.department && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3" /> {member.department.name}
                        </p>
                      )}
                    </div>

                    {/* Course summary */}
                    <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 text-right">
                      <p className="text-xs text-slate-500">
                        {active.length} active · {completed.length} completed
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Joined {format(new Date(member.joinedAt), "d MMM yyyy")}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => { setAssigningTo(member); setSelectedCourse(""); }}
                        className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 transition"
                        title="Assign a course to this member"
                      >
                        <BookOpen className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedMember(expanded ? null : member.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        title={expanded ? "Collapse details" : "View enrolled courses and progress"}
                      >
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(member)}
                        disabled={removingId === member.id}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                        title="Remove this member from the organisation"
                      >
                        {removingId === member.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded: course progress */}
                  {expanded && (
                    <div className="px-4 pb-4 pt-1 bg-slate-50 border-t border-slate-100">
                      {member.user.enrolments.length === 0 ? (
                        <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
                          <BookOpen className="w-4 h-4" />
                          No courses assigned yet.
                          <button
                            type="button"
                            className="text-primary underline underline-offset-2 hover:no-underline"
                            onClick={() => { setAssigningTo(member); setSelectedCourse(""); }}
                          >
                            Assign a course
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3 mt-2">
                          {member.user.enrolments.map((enrolment) => (
                            <div key={enrolment.courseId} className="bg-white rounded-xl border border-slate-200 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-slate-900 leading-tight">{enrolment.course.title}</p>
                                <span className={cn(
                                  "text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0",
                                  enrolment.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700"
                                    : enrolment.status === "ACTIVE" ? "bg-blue-100 text-blue-700"
                                    : "bg-slate-100 text-slate-600"
                                )}>
                                  {enrolment.status}
                                </span>
                              </div>
                              <div className="mt-2 flex items-center gap-3">
                                <Progress value={enrolment.progress} className="flex-1 h-1.5" />
                                <span className="text-xs font-medium text-slate-600 shrink-0">{enrolment.progress}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add / Create Member Dialog ─────────────────────────────────────── */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="font-bold text-slate-900 text-lg">Add Member</h2>
              <button type="button" onClick={() => { setShowDialog(false); resetDialog(); }} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode tabs */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => setAddMode("add")}
                className={cn(
                  "flex-1 py-3 text-sm font-medium transition flex items-center justify-center gap-2",
                  addMode === "add" ? "border-b-2 border-primary text-primary" : "text-slate-500 hover:text-slate-700"
                )}
                title="Add someone who already has an account on the platform"
              >
                <UserCheck className="w-4 h-4" />
                Add existing user
              </button>
              <button
                type="button"
                onClick={() => setAddMode("create")}
                className={cn(
                  "flex-1 py-3 text-sm font-medium transition flex items-center justify-center gap-2",
                  addMode === "create" ? "border-b-2 border-primary text-primary" : "text-slate-500 hover:text-slate-700"
                )}
                title="Create a new account — they'll receive an email with a temporary password to set up on first login"
              >
                <Mail className="w-4 h-4" />
                Create &amp; invite
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {addMode === "add" && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  Enter the email address of an existing platform user to add them to {org.name}.
                </div>
              )}

              {addMode === "create" && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  A new account will be created. The user will receive an email with their temporary password and must change it on first login.
                </div>
              )}

              {addMode === "create" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="mFirstName">First name</Label>
                    <Input
                      id="mFirstName"
                      placeholder="Jane"
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mLastName">Last name</Label>
                    <Input
                      id="mLastName"
                      placeholder="Okafor"
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="mEmail">Email address</Label>
                <Input
                  id="mEmail"
                  type="email"
                  placeholder="jane.okafor@company.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mRole">Organisation role</Label>
                <select
                  id="mRole"
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  title="Set the member's role within this organisation"
                >
                  <option value="CANDIDATE">Candidate</option>
                  <option value="ORG_MANAGER">Organisation Manager</option>
                </select>
                <p className="text-xs text-slate-500">This is the role within your organisation, not the platform role.</p>
              </div>

              {departments.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="mDept">Department <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <select
                    id="mDept"
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={form.departmentId}
                    onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
                  >
                    <option value="">No department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="px-6 pb-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowDialog(false); resetDialog(); }}>
                Cancel
              </Button>
              <Button onClick={handleAddMember} disabled={saving} className="gap-2 min-w-32">
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : addMode === "create"
                    ? <><Send className="w-4 h-4" /> Create &amp; Send invite</>
                    : <><UserPlus className="w-4 h-4" /> Add member</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Course Dialog ───────────────────────────────────────────── */}
      {assigningTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="font-bold text-slate-900 text-lg">Assign Course</h2>
              <button type="button" onClick={() => setAssigningTo(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                  {assigningTo.user.firstName[0]}{assigningTo.user.lastName[0]}
                </div>
                <div>
                  <p className="font-medium text-slate-900 text-sm">{assigningTo.user.firstName} {assigningTo.user.lastName}</p>
                  <p className="text-xs text-slate-500">{assigningTo.user.email}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="assignCourse">Select course</Label>
                <select
                  id="assignCourse"
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                >
                  <option value="">Choose a course…</option>
                  {courses.map((c) => {
                    const alreadyEnrolled = assigningTo.user.enrolments.some((e) => e.courseId === c.id);
                    return (
                      <option key={c.id} value={c.id} disabled={alreadyEnrolled}>
                        {c.title}{alreadyEnrolled ? " (already enrolled)" : ""}
                        {c.schemeCode ? ` — ${c.schemeCode}` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedCourse && (() => {
                const course = courses.find((c) => c.id === selectedCourse);
                if (!course) return null;
                return (
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-sm space-y-1">
                    {course.price > 0 && (
                      <p className="text-amber-700 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        This is a paid course ({course.currency} {course.price.toLocaleString()}). The member will be enrolled without a payment record.
                      </p>
                    )}
                    {course.price === 0 && (
                      <p className="text-emerald-700 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Free course — will be enrolled immediately.
                      </p>
                    )}
                    {course.schemeName && (
                      <p className="text-slate-600 flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5" />
                        Leads to: {course.schemeName}
                      </p>
                    )}
                    <p className="text-slate-600 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {course.cpdHours} CPD hours
                    </p>
                  </div>
                );
              })()}
            </div>

            <div className="px-6 pb-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setAssigningTo(null)}>Cancel</Button>
              <Button
                onClick={handleAssign}
                disabled={!selectedCourse || assigning}
                className="gap-2 min-w-32"
                title="Enrol this member in the selected course immediately"
              >
                {assigning ? <><Loader2 className="w-4 h-4 animate-spin" /> Assigning…</> : <><BookOpen className="w-4 h-4" /> Assign Course</>}
              </Button>
            </div>
          </div>
        </div>
      )}
      </> /* end members tab */}
    </div>
  );
}
