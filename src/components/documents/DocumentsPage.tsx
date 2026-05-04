"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  FolderOpen, FileText, Shield, Clipboard, GraduationCap, BarChart3,
  Search, Plus, Download, ExternalLink, CheckCircle2, Clock, Upload,
  Lock, Users, Globe, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type DocumentVersion = {
  id: string;
  version: string;
  status: string;
  fileUrl: string | null;
  changeNotes: string | null;
  approvedAt: string | null;
  createdAt: string;
};

type Document = {
  id: string;
  title: string;
  type: string;
  description: string | null;
  accessLevel: string;
  createdAt: string;
  latestVersion: DocumentVersion | null;
};

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; description: string }> = {
  policy:     { label: "Policy",     icon: Shield,       color: "bg-blue-100 text-blue-700",    description: "Certification body policies (impartiality, appeals, etc.)" },
  procedure:  { label: "Procedure",  icon: Clipboard,    color: "bg-purple-100 text-purple-700", description: "Step-by-step operational procedures" },
  scheme:     { label: "Scheme",     icon: FileText,     color: "bg-primary/10 text-primary",   description: "Certification scheme handbooks and criteria" },
  form:       { label: "Form",       icon: FileText,     color: "bg-emerald-100 text-emerald-700", description: "Application forms, declarations, templates" },
  exam_paper: { label: "Exam Paper", icon: GraduationCap, color: "bg-amber-100 text-amber-700", description: "Historical and archived exam papers (restricted)" },
  report:     { label: "Report",     icon: BarChart3,    color: "bg-rose-100 text-rose-700",    description: "Audit reports, surveillance reports" },
};

const ACCESS_CONFIG: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  public:     { label: "Public",      icon: Globe,  description: "Anyone can see this — shown on the public portal" },
  candidate:  { label: "Candidates",  icon: Users,  description: "Visible to enrolled candidates and org managers" },
  internal:   { label: "Internal",    icon: Lock,   description: "Staff only — not visible to candidates" },
  restricted: { label: "Restricted",  icon: Lock,   description: "Admins and auditors only" },
};

const VERSION_STATUS_COLOR: Record<string, string> = {
  DRAFT:      "bg-slate-100 text-slate-600",
  ACTIVE:     "bg-emerald-100 text-emerald-700",
  SUPERSEDED: "bg-amber-100 text-amber-700",
  RETIRED:    "bg-red-100 text-red-500",
};

export default function DocumentsPage({
  documents,
  isAdmin,
}: {
  documents: Document[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    type: "policy",
    description: "",
    accessLevel: "internal",
    version: "1.0",
    fileUrl: "",
    changeNotes: "",
  });

  const filtered = documents.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch = !search || d.title.toLowerCase().includes(q) || (d.description ?? "").toLowerCase().includes(q);
    const matchType = typeFilter === "all" || d.type === typeFilter;
    return matchSearch && matchType;
  });

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "pdf");

      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/manage/upload");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText).url as string);
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText).error ?? "Upload failed")); }
            catch { reject(new Error("Upload failed")); }
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(fd);
      });

      setForm((f) => ({ ...f, fileUrl: url }));
      toast.success("File uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function createDocument() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Document added to library");
      setShowModal(false);
      setForm({ title: "", type: "policy", description: "", accessLevel: "internal", version: "1.0", fileUrl: "", changeNotes: "" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const typeCounts = Object.fromEntries(
    Object.keys(TYPE_CONFIG).map((k) => [k, documents.filter((d) => d.type === k).length])
  );

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Document Library</h1>
          <p className="text-slate-500 text-sm mt-1">
            {isAdmin
              ? "Manage controlled documents — policies, procedures, scheme handbooks, forms, and reports."
              : "Access certification scheme documents, forms, and published policies."}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowModal(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Document
          </Button>
        )}
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTypeFilter("all")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm border transition font-medium",
            typeFilter === "all"
              ? "bg-primary text-white border-primary"
              : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
          )}
        >
          All ({documents.length})
        </button>
        {Object.entries(TYPE_CONFIG).map(([k, v]) => {
          const count = typeCounts[k] ?? 0;
          if (!isAdmin && count === 0) return null;
          const Icon = v.icon;
          return (
            <button
              key={k}
              onClick={() => setTypeFilter(typeFilter === k ? "all" : k)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition",
                typeFilter === k
                  ? "bg-primary/10 text-primary border-primary/30 font-medium"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {v.label}
              {count > 0 && <span className="text-xs opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search by title or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Document list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 border-dashed shadow-sm p-12 text-center">
          <FolderOpen className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          <p className="font-medium text-slate-600">
            {search || typeFilter !== "all" ? "No documents match your filters" : "No documents yet"}
          </p>
          {isAdmin && !search && typeFilter === "all" && (
            <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
              Add your first document — start with certification scheme handbooks or policies.
            </p>
          )}
          {(search || typeFilter !== "all") && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearch(""); setTypeFilter("all"); }}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map((doc) => {
              const typeConf = TYPE_CONFIG[doc.type] ?? { label: doc.type, icon: FileText, color: "bg-slate-100 text-slate-600", description: "" };
              const TypeIcon = typeConf.icon;
              const accessConf = ACCESS_CONFIG[doc.accessLevel];
              const AccessIcon = accessConf?.icon ?? Lock;
              const versionStatusColor = doc.latestVersion ? VERSION_STATUS_COLOR[doc.latestVersion.status] ?? "bg-slate-100 text-slate-600" : null;
              const isExpanded = expandedDoc === doc.id;

              return (
                <div key={doc.id}>
                  <div
                    className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition cursor-pointer"
                    onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                  >
                    {/* Type icon */}
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", typeConf.color)}>
                      <TypeIcon className="w-5 h-5" />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 text-sm">{doc.title}</p>
                        <Badge className={cn("border-0 text-[10px]", typeConf.color)}>{typeConf.label}</Badge>
                        {isAdmin && accessConf && (
                          <Badge className="border-0 text-[10px] bg-slate-100 text-slate-500 gap-1">
                            <AccessIcon className="w-2.5 h-2.5" />
                            {accessConf.label}
                          </Badge>
                        )}
                        {doc.latestVersion && versionStatusColor && (
                          <Badge className={cn("border-0 text-[10px]", versionStatusColor)}>
                            v{doc.latestVersion.version} · {doc.latestVersion.status}
                          </Badge>
                        )}
                      </div>
                      {doc.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{doc.description}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {doc.latestVersion?.fileUrl && (
                        <a
                          href={doc.latestVersion.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition"
                          title="Open / Download"
                        >
                          {doc.latestVersion.fileUrl.startsWith("http") ? (
                            <ExternalLink className="w-4 h-4" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </a>
                      )}
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-slate-400" />
                        : <ChevronDown className="w-4 h-4 text-slate-400" />
                      }
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 ml-14 space-y-2 border-t border-slate-50 pt-3">
                      {doc.description && (
                        <p className="text-sm text-slate-600">{doc.description}</p>
                      )}
                      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>Added {format(new Date(doc.createdAt), "d MMM yyyy")}</span>
                        {doc.latestVersion && (
                          <>
                            <span>Version {doc.latestVersion.version}</span>
                            {doc.latestVersion.approvedAt && (
                              <span>Approved {format(new Date(doc.latestVersion.approvedAt), "d MMM yyyy")}</span>
                            )}
                            {doc.latestVersion.changeNotes && (
                              <span className="italic">{doc.latestVersion.changeNotes}</span>
                            )}
                          </>
                        )}
                      </div>
                      {doc.latestVersion?.fileUrl && (
                        <a
                          href={doc.latestVersion.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                        >
                          {doc.latestVersion.fileUrl.startsWith("http") ? (
                            <><ExternalLink className="w-3.5 h-3.5" /> Open document</>
                          ) : (
                            <><Download className="w-3.5 h-3.5" /> Download</>
                          )}
                        </a>
                      )}
                      {!doc.latestVersion?.fileUrl && (
                        <p className="text-xs text-slate-400 italic">No file attached to this document yet.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Add Document</h3>
              <button type="button" onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Title */}
              <div>
                <Label>Document Title *</Label>
                <Input autoFocus className="mt-1" placeholder="e.g. Certification Policy v3" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>

              {/* Type */}
              <div>
                <Label>Document Type *</Label>
                <select
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label} — {v.description}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <Label>Description</Label>
                <textarea
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
                  rows={2}
                  placeholder="Brief explanation of what this document covers…"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Access level */}
              <div>
                <Label>Who can see this?</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {Object.entries(ACCESS_CONFIG).map(([k, v]) => {
                    const Icon = v.icon;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, accessLevel: k }))}
                        className={cn(
                          "flex items-start gap-2 p-3 rounded-xl border text-left transition",
                          form.accessLevel === k
                            ? "border-primary bg-primary/5"
                            : "border-slate-200 hover:border-slate-300"
                        )}
                      >
                        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", form.accessLevel === k ? "text-primary" : "text-slate-400")} />
                        <div>
                          <p className={cn("text-xs font-semibold", form.accessLevel === k ? "text-primary" : "text-slate-700")}>{v.label}</p>
                          <p className="text-[10px] text-slate-500 leading-tight">{v.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* File upload */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Attach File</p>
                <div>
                  <Label>Upload PDF or paste a URL</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      className="flex-1"
                      placeholder="https://… or upload below"
                      value={form.fileUrl}
                      onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="gap-1.5 shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5" /> Upload
                    </Button>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
                  />
                  {uploading && <Progress value={uploadProgress} className="h-1.5 mt-2" />}
                  {form.fileUrl && !uploading && (
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {form.fileUrl.startsWith("/uploads") ? "File uploaded" : form.fileUrl}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label>Version</Label>
                    <Input className="mt-1" placeholder="1.0" value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Change Notes</Label>
                    <Input className="mt-1" placeholder="Initial release" value={form.changeNotes} onChange={(e) => setForm((f) => ({ ...f, changeNotes: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1" onClick={createDocument} disabled={saving || uploading}>
                {saving ? "Adding…" : "Add to Library"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
