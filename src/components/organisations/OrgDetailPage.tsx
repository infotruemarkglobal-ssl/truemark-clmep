"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2, Globe, MapPin, FileText, ShieldCheck, AlertCircle,
  Edit2, Save, X, Sparkles, ChevronLeft, Upload, Loader2, ExternalLink,
  Users, BookOpen, CreditCard, Award, Mail,
  Key, Plus, Trash2, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/hooks/useFocusTrap";

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
    certificates: {
      certificateNumber: string;
      status: string;
      expiresAt: string | null;
      schemeName: string;
      schemeCode: string;
      risk: "expired" | "at_risk" | "ok";
    }[];
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

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  createdBy: { firstName: string; lastName: string };
};

type SsoConfigRow = {
  id: string;
  emailDomain: string;
  issuerUrl: string;
  clientId: string;
  enabled: boolean;
  hasClientSecret: boolean;
};

const AVAILABLE_SCOPES = [
  { value: "members:read", label: "Read members" },
  { value: "certificates:read", label: "Read certificate status" },
];

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

  // Compliance tab — flatten every member's certificates into one list,
  // worst-first (expired, then soonest-to-expire, then everyone else), so
  // the "at a glance" view actually leads with what needs attention.
  const complianceRows = org.members
    .flatMap((m) => m.user.certificates.map((c) => ({ member: m, cert: c })))
    .sort((a, b) => {
      const order = { expired: 0, at_risk: 1, ok: 2 };
      if (order[a.cert.risk] !== order[b.cert.risk]) return order[a.cert.risk] - order[b.cert.risk];
      if (!a.cert.expiresAt) return 1;
      if (!b.cert.expiresAt) return -1;
      return new Date(a.cert.expiresAt).getTime() - new Date(b.cert.expiresAt).getTime();
    });
  const atRiskCount = complianceRows.filter((r) => r.cert.risk === "expired" || r.cert.risk === "at_risk").length;

  // API-keys tab
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[] | null>(null);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["members:read"]);
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ name: string; rawKey: string } | null>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const apiKeyTrapRef = useFocusTrap<HTMLDivElement>(showCreateKey, () => setShowCreateKey(false));

  // SSO tab — "loading" (not fetched yet), "forbidden" (viewer isn't this
  // org's manager), or the resolved config (null = none configured yet).
  const [ssoConfig, setSsoConfig] = useState<SsoConfigRow | null | "loading" | "forbidden">("loading");
  const [ssoForm, setSsoForm] = useState({ emailDomain: "", issuerUrl: "", clientId: "", clientSecret: "", enabled: true });
  const [savingSso, setSavingSso] = useState(false);
  const [removingSso, setRemovingSso] = useState(false);

  async function loadSsoConfig() {
    try {
      const res = await fetch(`/api/organisations/${org.id}/sso-config`);
      if (res.status === 403) { setSsoConfig("forbidden"); return; }
      const data = await res.json();
      setSsoConfig(data);
      if (data) setSsoForm((f) => ({ ...f, emailDomain: data.emailDomain, issuerUrl: data.issuerUrl, clientId: data.clientId, enabled: data.enabled }));
    } catch {
      setSsoConfig("forbidden");
    }
  }

  async function saveSsoConfig() {
    setSavingSso(true);
    try {
      const res = await fetch(`/api/organisations/${org.id}/sso-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailDomain: ssoForm.emailDomain,
          issuerUrl: ssoForm.issuerUrl,
          clientId: ssoForm.clientId,
          enabled: ssoForm.enabled,
          ...(ssoForm.clientSecret ? { clientSecret: ssoForm.clientSecret } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save SSO configuration");
      toast.success("SSO configuration saved");
      setSsoForm((f) => ({ ...f, clientSecret: "" }));
      loadSsoConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save SSO configuration");
    } finally {
      setSavingSso(false);
    }
  }

  async function removeSsoConfig() {
    setRemovingSso(true);
    try {
      const res = await fetch(`/api/organisations/${org.id}/sso-config`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove SSO configuration");
      toast.success("SSO configuration removed");
      setSsoConfig(null);
      setSsoForm({ emailDomain: "", issuerUrl: "", clientId: "", clientSecret: "", enabled: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove SSO configuration");
    } finally {
      setRemovingSso(false);
    }
  }

  async function loadApiKeys() {
    try {
      const res = await fetch(`/api/organisations/${org.id}/api-keys`);
      const data = await res.json();
      if (res.ok) setApiKeys(data);
    } catch {
      // leave apiKeys null — the tab shows a loading/empty state either way
    }
  }

  async function createApiKey() {
    if (!newKeyName.trim() || newKeyScopes.length === 0) return;
    setCreatingKey(true);
    try {
      const res = await fetch(`/api/organisations/${org.id}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create API key");
      setCreatedKey({ name: data.name, rawKey: data.rawKey });
      setShowCreateKey(false);
      setNewKeyName("");
      setNewKeyScopes(["members:read"]);
      loadApiKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreatingKey(false);
    }
  }

  async function revokeApiKey(keyId: string) {
    setRevokingKeyId(keyId);
    try {
      const res = await fetch(`/api/organisations/${org.id}/api-keys/${keyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke API key");
      toast.success("API key revoked");
      loadApiKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke API key");
    } finally {
      setRevokingKeyId(null);
    }
  }

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
              role="button"
              tabIndex={0}
              aria-label="Choose a CAC or Incorporation document to upload"
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !uploadingDoc) {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
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
      <Tabs defaultValue="overview" onValueChange={(v) => {
        if (v === "api-access" && apiKeys === null) loadApiKeys();
        if (v === "sso" && ssoConfig === "loading") loadSsoConfig();
      }}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">
            Members ({org.members.length})
          </TabsTrigger>
          <TabsTrigger value="compliance">
            Compliance {atRiskCount > 0 && <Badge className="ml-1.5 bg-amber-100 text-amber-700 border-0 px-1.5">{atRiskCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="payments">
            Payments {totalPayments > 0 && `(${totalPayments})`}
          </TabsTrigger>
          <TabsTrigger value="api-access">API Access</TabsTrigger>
          <TabsTrigger value="sso">Single Sign-On</TabsTrigger>
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

        {/* ── Compliance tab — live per-member certificate status & renewal risk ── */}
        <TabsContent value="compliance">
          <div className="pt-4">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {complianceRows.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No certificates issued under this organisation&apos;s sponsorship yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Employee</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Certification</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Expires</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {complianceRows.map(({ member, cert }) => {
                        const riskStyle = cert.risk === "expired"
                          ? "bg-red-100 text-red-700"
                          : cert.risk === "at_risk"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700";
                        const riskLabel = cert.risk === "expired" ? "Expired" : cert.risk === "at_risk" ? "Renewal due soon" : cert.status;
                        return (
                          <tr key={`${member.id}-${cert.certificateNumber}`} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">{member.user.firstName} {member.user.lastName}</p>
                              <p className="text-xs text-slate-400">{member.user.email}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-slate-700">{cert.schemeName}</p>
                              <p className="text-xs text-slate-400 font-mono">{cert.certificateNumber}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("inline-flex px-2 py-0.5 rounded text-xs font-medium", riskStyle)}>
                                {riskLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                              {cert.expiresAt ? new Date(cert.expiresAt).toLocaleDateString("en-GB") : "No expiry"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
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

        {/* ── API Access tab ── */}
        <TabsContent value="api-access">
          <div className="pt-4 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900">Programmatic access</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Pull this organisation&apos;s member and certificate status into your own HR or LMS
                    system. See the <code className="bg-slate-100 rounded px-1">/api/v1/organisations/members</code> and{" "}
                    <code className="bg-slate-100 rounded px-1">/api/v1/organisations/certificates</code> endpoints —
                    send <code className="bg-slate-100 rounded px-1">Authorization: Bearer &lt;key&gt;</code>.
                  </p>
                </div>
                <Button size="sm" onClick={() => setShowCreateKey(true)} className="gap-2 shrink-0">
                  <Plus className="w-3.5 h-3.5" /> New key
                </Button>
              </div>
            </div>

            {createdKey && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                <p className="font-semibold text-emerald-800 flex items-center gap-2">
                  <Key className="w-4 h-4" /> &quot;{createdKey.name}&quot; created
                </p>
                <p className="text-sm text-emerald-700 mt-1">
                  Copy this key now — it will not be shown again.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 overflow-x-auto">
                    {createdKey.rawKey}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { navigator.clipboard.writeText(createdKey.rawKey); toast.success("Copied to clipboard"); }}
                    className="gap-1.5 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </Button>
                </div>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setCreatedKey(null)}>Done</Button>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {apiKeys === null ? (
                <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
              ) : apiKeys.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No API keys yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Key</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Scopes</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Last used</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {apiKeys.map((k) => (
                        <tr key={k.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{k.name}</p>
                            <p className="text-xs text-slate-400">by {k.createdBy.firstName} {k.createdBy.lastName}</p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{k.keyPrefix}…</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {k.scopes.map((s) => <Badge key={s} className="bg-slate-100 text-slate-600 border-0 text-[10px]">{s}</Badge>)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString("en-GB") : "Never"}
                          </td>
                          <td className="px-4 py-3">
                            {k.revokedAt ? (
                              <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">Revoked</Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Active</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!k.revokedAt && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => revokeApiKey(k.id)}
                                disabled={revokingKeyId === k.id}
                                className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                              >
                                {revokingKeyId === k.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Revoke
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Single Sign-On tab ── */}
        <TabsContent value="sso">
          <div className="pt-4 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="font-semibold text-slate-900">Enterprise SSO (OIDC)</p>
              <p className="text-sm text-slate-500 mt-1">
                Let this organisation&apos;s employees sign in through their own identity provider (Okta, Azure AD,
                Google Workspace, or any standards-compliant OIDC issuer) instead of a Truemark password. Resolved
                automatically by email domain at{" "}
                <a href="/login/sso" className="text-primary hover:underline">/login/sso</a>. SAML is not supported
                yet — OIDC only.
              </p>
            </div>

            {ssoConfig === "loading" ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-500">Loading…</div>
            ) : ssoConfig === "forbidden" ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-500">
                You don&apos;t have permission to configure SSO for this organisation — only the organisation&apos;s
                own manager can.
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="sso-domain">Email domain</Label>
                    <Input
                      id="sso-domain"
                      className="mt-1.5"
                      placeholder="acme.com"
                      value={ssoForm.emailDomain}
                      onChange={(e) => setSsoForm((f) => ({ ...f, emailDomain: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="sso-issuer">Issuer URL</Label>
                    <Input
                      id="sso-issuer"
                      className="mt-1.5"
                      placeholder="https://acme.okta.com"
                      value={ssoForm.issuerUrl}
                      onChange={(e) => setSsoForm((f) => ({ ...f, issuerUrl: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="sso-client-id">Client ID</Label>
                    <Input
                      id="sso-client-id"
                      className="mt-1.5"
                      value={ssoForm.clientId}
                      onChange={(e) => setSsoForm((f) => ({ ...f, clientId: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="sso-client-secret">
                      Client secret {ssoConfig?.hasClientSecret && <span className="text-slate-400 font-normal">(leave blank to keep the current one)</span>}
                    </Label>
                    <Input
                      id="sso-client-secret"
                      type="password"
                      className="mt-1.5"
                      placeholder={ssoConfig?.hasClientSecret ? "••••••••" : ""}
                      value={ssoForm.clientSecret}
                      onChange={(e) => setSsoForm((f) => ({ ...f, clientSecret: e.target.value }))}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ssoForm.enabled}
                    onChange={(e) => setSsoForm((f) => ({ ...f, enabled: e.target.checked }))}
                    className="rounded"
                  />
                  Enabled
                </label>
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={saveSsoConfig}
                    disabled={savingSso || !ssoForm.emailDomain || !ssoForm.issuerUrl || !ssoForm.clientId}
                    className="gap-2"
                  >
                    {savingSso ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                  </Button>
                  {ssoConfig && (
                    <Button
                      variant="outline"
                      onClick={removeSsoConfig}
                      disabled={removingSso}
                      className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      {removingSso ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove SSO
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Create API key dialog ── */}
      {showCreateKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div
            ref={apiKeyTrapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-api-key-title"
            tabIndex={-1}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md outline-none"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="create-api-key-title" className="font-bold text-slate-900 text-lg">New API key</h2>
              <button type="button" onClick={() => setShowCreateKey(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label htmlFor="api-key-name">Name</Label>
                <Input id="api-key-name" className="mt-1.5" placeholder="e.g. Workday sync" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
              </div>
              <div>
                <Label>Scopes</Label>
                <div className="mt-1.5 space-y-2">
                  {AVAILABLE_SCOPES.map((s) => (
                    <label key={s.value} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newKeyScopes.includes(s.value)}
                        onChange={(e) => setNewKeyScopes((prev) => e.target.checked ? [...prev, s.value] : prev.filter((v) => v !== s.value))}
                        className="rounded"
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCreateKey(false)}>Cancel</Button>
              <Button onClick={createApiKey} disabled={!newKeyName.trim() || newKeyScopes.length === 0 || creatingKey} className="gap-2">
                {creatingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />} Create key
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
