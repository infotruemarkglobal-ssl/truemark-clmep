"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2, Globe, MapPin, FileText, ShieldCheck, AlertCircle,
  Edit2, Save, X, Sparkles, ChevronLeft, Upload, Loader2, ExternalLink,
  Users, BookOpen, CreditCard, Award, Mail, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrgMember = {
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
    enrolments: { courseId: string; status: string; progress: number }[];
  };
};

type Course = {
  id: string;
  title: string;
  slug: string;
  cpdHours: number | null;
  schemeCode: string | null;
};

type Payment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  paystackReference: string | null;
  date: string;
  payer: { id: string; firstName: string; lastName: string; email: string } | null;
  courseTitle: string | null;
};

type Org = {
  id: string;
  name: string;
  registrationNo: string | null;
  country: string | null;
  address: string | null;
  website: string | null;
  logoUrl: string | null;
  description: string | null;
  industry: string | null;
  cacDocumentUrl: string | null;
  verificationStatus: string;
  verificationNotes: string | null;
  approvedSchemes: string | null;
  isActive: boolean;
  departments: { id: string; name: string }[];
  members: OrgMember[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Healthcare", "Manufacturing", "Information Technology", "Finance & Banking",
  "Energy & Utilities", "Construction", "Education", "Retail & FMCG",
  "Logistics & Transportation", "Telecommunications", "Government & Public Sector",
  "Agriculture", "Hospitality & Tourism", "Legal & Professional Services", "Other",
];

const VERIFICATION_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  VERIFIED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-100 text-red-700 border-red-200",
};

const MEMBER_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  INACTIVE: "bg-slate-100 text-slate-500",
  SUSPENDED: "bg-red-100 text-red-600",
  PENDING_VERIFICATION: "bg-amber-100 text-amber-700",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
  REFUNDED: "bg-slate-100 text-slate-600",
};

const CURRENCY_SYMBOLS: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };
const currencySymbol = (code: string) => CURRENCY_SYMBOLS[code] ?? code;

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrgDetailPage({
  org: initialOrg,
  isAdmin,
  courses = [],
  payments = [],
  certCount = 0,
  activeEnrolments = 0,
  completedEnrolments = 0,
  totalPayments = 0,
}: {
  org: Org;
  isAdmin: boolean;
  courses?: Course[];
  payments?: Payment[];
  certCount?: number;
  activeEnrolments?: number;
  completedEnrolments?: number;
  totalPayments?: number;
}) {
  const router = useRouter();
  const [org, setOrg] = useState(initialOrg);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: org.name,
    registrationNo: org.registrationNo ?? "",
    country: org.country ?? "",
    address: org.address ?? "",
    website: org.website ?? "",
    description: org.description ?? "",
    industry: org.industry ?? "",
  });

  const [suggestions, setSuggestions] = useState<Array<{ code: string; name: string; reason: string; relevanceScore: number }>>([]);
  const [suggesting, setSuggesting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Course assignment state (Members tab)
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [assigning, setAssigning] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/organisations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setOrg((prev) => ({ ...prev, ...form }));
      setEditing(false);
      toast.success("Organisation profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setForm({
      name: org.name,
      registrationNo: org.registrationNo ?? "",
      country: org.country ?? "",
      address: org.address ?? "",
      website: org.website ?? "",
      description: org.description ?? "",
      industry: org.industry ?? "",
    });
    setEditing(false);
  }

  async function uploadDocument(file: File) {
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/organisations/${org.id}/upload-document`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setOrg((prev) => ({ ...prev, cacDocumentUrl: data.url }));
      toast.success("Document uploaded successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function suggestSchemes() {
    setSuggesting(true);
    setSuggestions([]);
    try {
      const res = await fetch(`/api/organisations/${org.id}/suggest-schemes`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSuggestions(data.suggestions ?? []);
      if (!data.suggestions?.length) {
        toast.info("No specific suggestions for your current profile. Try filling in your description and industry.");
      } else {
        toast.success(`${data.suggestions.length} certification scheme${data.suggestions.length !== 1 ? "s" : ""} recommended${data.aiPowered ? " (AI-powered)" : ""}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not get suggestions");
    } finally {
      setSuggesting(false);
    }
  }

  async function assignCourse() {
    if (!selectedCourseId) {
      toast.error("Select a course to assign");
      return;
    }
    const userIds = org.members.map((m) => m.user.id);
    if (userIds.length === 0) {
      toast.error("No members to assign the course to");
      return;
    }
    setAssigning(true);
    try {
      const res = await fetch(`/api/organisations/${org.id}/enrol`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: selectedCourseId, userIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Assignment failed");
      toast.success(data.message ?? "Course assigned");
      setSelectedCourseId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign course");
    } finally {
      setAssigning(false);
    }
  }

  const verificationColor = VERIFICATION_COLORS[org.verificationStatus] ?? "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-2 transition"
            >
              <ChevronLeft className="w-4 h-4" /> Back to organisations
            </button>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">{org.name}</h1>
            <Badge className={cn("border", verificationColor)}>
              {org.verificationStatus === "VERIFIED"
                ? <><ShieldCheck className="w-3 h-3 mr-1" /> Verified</>
                : org.verificationStatus === "REJECTED"
                ? <><AlertCircle className="w-3 h-3 mr-1" /> Rejected</>
                : "Pending Review"
              }
            </Badge>
            <Badge className={cn("border", org.isActive ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200")}>
              {org.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            {org.members.length} member{org.members.length !== 1 ? "s" : ""}
            {org.registrationNo && ` · RC ${org.registrationNo}`}
          </p>
        </div>

        {isAdmin ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 max-w-sm">
            <ShieldCheck className="w-4 h-4 shrink-0 text-slate-400" />
            <span>Read-only view. Contact the Organisation Manager to make changes.</span>
          </div>
        ) : !editing ? (
          <Button
            variant="outline"
            onClick={() => setEditing(true)}
            className="gap-2"
            title="Edit your organisation profile"
          >
            <Edit2 className="w-4 h-4" /> Edit profile
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={cancelEdit} className="gap-1.5">
              <X className="w-4 h-4" /> Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </div>

      {/* Verification notes (admin-set, read-only for ORG_MANAGER) */}
      {org.verificationNotes && (
        <div className={cn(
          "p-4 rounded-xl border text-sm",
          org.verificationStatus === "REJECTED" ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
        )}>
          <p className="font-semibold mb-1">Note from Certification Officer</p>
          <p>{org.verificationNotes}</p>
        </div>
      )}

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">

        {/* Basic info */}
        <div className="p-6 space-y-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" /> Organisation Details
          </h2>

          {editing ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="orgName">Organisation name</Label>
                <Input id="orgName" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="orgReg">RC / Registration number <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Input id="orgReg" placeholder="RC-1234567" value={form.registrationNo} onChange={(e) => setForm((f) => ({ ...f, registrationNo: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="orgCountry">Country</Label>
                  <Input id="orgCountry" placeholder="Nigeria" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orgAddress">Address <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input id="orgAddress" placeholder="14 Broad Street, Lagos Island" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orgWebsite">Website <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input id="orgWebsite" type="url" placeholder="https://yourcompany.com" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
              </div>
            </div>
          ) : (
            <dl className="space-y-3 text-sm">
              {org.country && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <dt className="text-xs text-slate-500 mb-0.5">Location</dt>
                    <dd className="text-slate-900">{[org.address, org.country].filter(Boolean).join(", ")}</dd>
                  </div>
                </div>
              )}
              {org.website && (
                <div className="flex items-start gap-3">
                  <Globe className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <dt className="text-xs text-slate-500 mb-0.5">Website</dt>
                    <dd>
                      <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                        {org.website}
                      </a>
                    </dd>
                  </div>
                </div>
              )}
              {!org.country && !org.website && !editing && (
                <p className="text-slate-400 text-sm italic">No contact details added yet.</p>
              )}
            </dl>
          )}
        </div>

        {/* Description & industry */}
        <div className="p-6 space-y-4">
          <h2 className="font-semibold text-slate-900 text-sm">About the Organisation</h2>

          {editing ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="orgIndustry">Industry <span className="text-slate-400 font-normal">(optional)</span></Label>
                <select
                  id="orgIndustry"
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={form.industry}
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                >
                  <option value="">Select industry…</option>
                  {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orgDesc">Description <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Textarea
                  id="orgDesc"
                  rows={4}
                  placeholder="Briefly describe what your organisation does, your objectives, and why you are pursuing certification…"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
                <p className="text-xs text-slate-500">Used by our AI to suggest relevant certification schemes for your organisation.</p>
              </div>
            </>
          ) : (
            <div className="space-y-2 text-sm">
              {org.industry && (
                <p className="text-slate-500">
                  <span className="font-medium text-slate-700">Industry:</span> {org.industry}
                </p>
              )}
              {org.description ? (
                <p className="text-slate-700 leading-relaxed whitespace-pre-line">{org.description}</p>
              ) : (
                <p className="text-slate-400 italic">No description added yet. Edit your profile to add one.</p>
              )}
            </div>
          )}
        </div>

        {/* CAC / Incorporation document — optional */}
        <div className="p-6">
          <h2 className="font-semibold text-slate-900 text-sm mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            Incorporation / CAC Document
            <span className="text-xs font-normal text-slate-400 ml-1">(optional)</span>
          </h2>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadDocument(file);
            }}
          />

          {org.cacDocumentUrl ? (
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">Document uploaded</p>
                <p className="text-xs text-slate-500 truncate">{org.cacDocumentUrl.split("/").pop()}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={org.cacDocumentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  title="Open document in a new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> View
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingDoc}
                  title="Replace the uploaded document"
                >
                  Replace
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-slate-200 hover:border-primary/40 rounded-xl p-8 text-center transition-colors cursor-pointer group"
              onClick={() => !uploadingDoc && fileInputRef.current?.click()}
              title="Click to select a PDF, JPG, or PNG document (max 10 MB)"
            >
              {uploadingDoc ? (
                <Loader2 className="w-8 h-8 mx-auto mb-3 text-primary animate-spin" />
              ) : (
                <Upload className="w-8 h-8 mx-auto mb-3 text-slate-300 group-hover:text-primary/50 transition-colors" />
              )}
              <p className="text-sm font-medium text-slate-600">
                {uploadingDoc ? "Uploading…" : "Click to upload your CAC or Incorporation document"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                PDF, JPG, PNG or WebP · Max 10 MB · Optional — not required to use the platform
              </p>
              {!uploadingDoc && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 pointer-events-none"
                  tabIndex={-1}
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Choose file
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Approved schemes */}
      {org.approvedSchemes && (() => {
        try {
          const codes: string[] = JSON.parse(org.approvedSchemes);
          if (codes.length === 0) return null;
          return (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" /> Approved Certification Schemes
              </h2>
              <div className="flex flex-wrap gap-2">
                {codes.map((code) => (
                  <Badge key={code} className="bg-emerald-100 text-emerald-700 border-0">{code}</Badge>
                ))}
              </div>
            </div>
          );
        } catch { return null; }
      })()}

      {/* AI scheme suggestions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Certification Scheme Recommendations
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Based on your industry and description, we can recommend relevant ISO certification pathways for your team.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={suggestSchemes}
            disabled={suggesting}
            className="gap-2 shrink-0"
            title="Use AI to analyse your organisation profile and suggest the most relevant certification schemes"
          >
            <Sparkles className="w-4 h-4" />
            {suggesting ? "Analysing…" : "Get recommendations"}
          </Button>
        </div>

        {suggestions.length > 0 && (
          <div className="mt-5 space-y-3">
            {suggestions.map((s) => (
              <div key={s.code} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{s.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{s.code}</p>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-0 shrink-0">
                    {Math.round(s.relevanceScore * 100)}% match
                  </Badge>
                </div>
                <p className="text-slate-600 text-sm mt-2">{s.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Management tabs ─────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">
            Members ({org.members.length})
          </TabsTrigger>
          <TabsTrigger value="payments">
            Payments {totalPayments > 0 && `(${totalPayments})`}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview tab ── */}
        <TabsContent value="overview">
          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              {
                label: "Active Members",
                value: org.members.length,
                icon: Users,
                color: "bg-blue-50 text-blue-600",
              },
              {
                label: "Active Certificates",
                value: certCount,
                icon: Award,
                color: "bg-emerald-50 text-emerald-600",
              },
              {
                label: "Active Enrolments",
                value: activeEnrolments,
                icon: BookOpen,
                color: "bg-violet-50 text-violet-600",
              },
              {
                label: "Total Payments",
                value: totalPayments,
                icon: CreditCard,
                color: "bg-amber-50 text-amber-600",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4"
              >
                <div className={cn("p-2.5 rounded-lg", stat.color.split(" ")[0])}>
                  <stat.icon className={cn("w-5 h-5", stat.color.split(" ")[1])} />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-slate-900">{stat.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          {completedEnrolments > 0 && (
            <p className="text-xs text-slate-500 pt-3">
              {completedEnrolments} enrolment{completedEnrolments !== 1 ? "s" : ""} completed
            </p>
          )}
        </TabsContent>

        {/* ── Members tab ── */}
        <TabsContent value="members">
          <div className="space-y-4 pt-4">
            {/* Course assignment */}
            {isAdmin && courses.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-slate-400" /> Assign Course to All Members
                </h3>
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="flex-1 min-w-48 h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Select a course…</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}{c.schemeCode ? ` (${c.schemeCode})` : ""}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={assignCourse}
                    disabled={assigning || !selectedCourseId}
                    className="gap-2 shrink-0"
                  >
                    {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                    {assigning ? "Assigning…" : "Assign to all"}
                  </Button>
                </div>
                <p className="text-xs text-slate-400 mt-2">Only free published courses can be assigned. Paid courses require checkout first.</p>
              </div>
            )}

            {/* Member table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Member</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Role</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">Courses</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider hidden lg:table-cell">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {org.members.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p>No members yet</p>
                        </td>
                      </tr>
                    ) : (
                      org.members.map((m) => {
                        const initials = `${m.user.firstName[0]}${m.user.lastName[0]}`.toUpperCase();
                        const statusColor = MEMBER_STATUS_COLORS[m.user.status] ?? "bg-slate-100 text-slate-500";
                        const activeEnrolCount = m.user.enrolments.filter((e) => e.status === "ACTIVE").length;
                        return (
                          <tr key={m.id} className="hover:bg-slate-50 transition">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                  {initials}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-900 truncate">
                                    {m.user.firstName} {m.user.lastName}
                                  </p>
                                  <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                                    <Mail className="w-3 h-3 shrink-0" />
                                    {m.user.email}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <span className="text-xs text-slate-600 capitalize">
                                {m.role.toLowerCase().replace(/_/g, " ")}
                              </span>
                              {m.department && (
                                <p className="text-xs text-slate-400 mt-0.5">{m.department.name}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("inline-flex px-2 py-0.5 rounded text-xs font-medium", statusColor)}>
                                {m.user.status.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums text-slate-700 text-sm">
                              {activeEnrolCount}
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-500 whitespace-nowrap">
                              {new Date(m.joinedAt).toLocaleDateString("en-GB")}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Payments tab ── */}
        <TabsContent value="payments">
          <div className="pt-4">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Candidate</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">Course</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-500 text-xs uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                          <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p>No payments recorded yet</p>
                        </td>
                      </tr>
                    ) : (
                      payments.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            <p>{new Date(p.date).toLocaleDateString("en-GB")}</p>
                            {p.paystackReference && (
                              <p className="font-mono text-slate-400 mt-0.5">
                                {p.paystackReference.slice(0, 12)}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {p.payer ? (
                              <div>
                                <p className="font-medium text-slate-800 whitespace-nowrap">
                                  {p.payer.firstName} {p.payer.lastName}
                                </p>
                                <p className="text-xs text-slate-400 truncate max-w-40">{p.payer.email}</p>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-slate-600 max-w-48 truncate">
                            {p.courseTitle ?? p.description ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800 whitespace-nowrap">
                            {currencySymbol(p.currency)}{p.amount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "inline-flex px-2 py-0.5 rounded text-xs font-medium",
                              PAYMENT_STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-600"
                            )}>
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {totalPayments > payments.length && (
                <div className="border-t border-slate-100 px-4 py-2.5">
                  <p className="text-xs text-slate-400">
                    Showing last {payments.length} of {totalPayments} payments
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
