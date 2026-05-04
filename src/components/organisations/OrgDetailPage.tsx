"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2, Globe, MapPin, FileText, ShieldCheck, AlertCircle,
  Edit2, Save, X, Sparkles, ChevronLeft, Upload, Loader2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  members: { id: string }[];
};

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

export default function OrgDetailPage({
  org: initialOrg,
  isAdmin,
}: {
  org: Org;
  courses?: unknown[];
  isAdmin: boolean;
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

        {!editing ? (
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

          {/* Hidden file input */}
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
    </div>
  );
}
