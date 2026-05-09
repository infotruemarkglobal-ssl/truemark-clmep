"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Award, Edit2, CheckCircle2, XCircle, Shield,
  ChevronRight, X, Save, AlertTriangle, Plus, Loader2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Scheme = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  validityMonths: number;
  passMark: number;
  maxAttempts: number;
  cpdHoursRequired: number;
  standardVersion: string | null;
  eligibilityEnabled: boolean;
  minAgeYears: number | null;
  minExperienceYears: number | null;
  requiredQualifications: string | null;
  requiredPriorCerts: string | null;
  requiresDocuments: boolean;
  requiresEmployerLetter: boolean;
  requiresIdDocument: boolean;
  eligibilityNotes: string | null;
  autoApproveMinutes: number;
};

// Helpers to convert between JSON array strings and comma-separated display text
function parseJsonList(raw: string | null): string {
  if (!raw) return "";
  try {
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr.join(", ") : raw;
  } catch {
    return raw;
  }
}

function toJsonList(csv: string): string | null {
  const trimmed = csv.trim();
  if (!trimmed) return null;
  const items = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? JSON.stringify(items) : null;
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({
  scheme,
  onClose,
  onSaved,
}: {
  scheme: Scheme;
  onClose: () => void;
  onSaved: (updated: Scheme) => void;
}) {
  // Basic fields
  const [name, setName] = useState(scheme.name);
  const [description, setDescription] = useState(scheme.description ?? "");
  const [isActive, setIsActive] = useState(scheme.isActive);
  const [validityMonths, setValidityMonths] = useState(String(scheme.validityMonths));
  const [passMark, setPassMark] = useState(String(scheme.passMark));
  const [maxAttempts, setMaxAttempts] = useState(String(scheme.maxAttempts));

  // Eligibility fields
  const [eligibilityEnabled, setEligibilityEnabled] = useState(scheme.eligibilityEnabled);
  const [minAgeYears, setMinAgeYears] = useState(scheme.minAgeYears !== null ? String(scheme.minAgeYears) : "");
  const [minExperienceYears, setMinExperienceYears] = useState(scheme.minExperienceYears !== null ? String(scheme.minExperienceYears) : "");
  const [requiredQualifications, setRequiredQualifications] = useState(parseJsonList(scheme.requiredQualifications));
  const [requiredPriorCerts, setRequiredPriorCerts] = useState(parseJsonList(scheme.requiredPriorCerts));
  const [requiresDocuments, setRequiresDocuments] = useState(scheme.requiresDocuments);
  const [requiresEmployerLetter, setRequiresEmployerLetter] = useState(scheme.requiresEmployerLetter);
  const [requiresIdDocument, setRequiresIdDocument] = useState(scheme.requiresIdDocument);
  const [eligibilityNotes, setEligibilityNotes] = useState(scheme.eligibilityNotes ?? "");
  const [autoApproveMinutes, setAutoApproveMinutes] = useState(String(scheme.autoApproveMinutes));

  const [activeTab, setActiveTab] = useState<"basic" | "eligibility">("basic");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        const body: Record<string, unknown> = {
          // Basic
          name, description: description || null, isActive,
          validityMonths: Number(validityMonths), passMark: Number(passMark),
          maxAttempts: Number(maxAttempts),
          // Eligibility
          eligibilityEnabled,
          minAgeYears: minAgeYears ? Number(minAgeYears) : null,
          minExperienceYears: minExperienceYears ? Number(minExperienceYears) : null,
          requiredQualifications: toJsonList(requiredQualifications),
          requiredPriorCerts: toJsonList(requiredPriorCerts),
          requiresDocuments, requiresEmployerLetter, requiresIdDocument,
          eligibilityNotes: eligibilityNotes || null,
          autoApproveMinutes: Number(autoApproveMinutes) || 60,
        };

        const res = await fetch(`/api/manage/schemes/${scheme.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Save failed");
        toast.success("Scheme updated");
        onSaved(data as Scheme);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  const labelClass = "text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1";
  const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-400">{scheme.code}</span>
              {!isActive && <Badge className="border-0 text-xs bg-slate-100 text-slate-500">Inactive</Badge>}
            </div>
            <h2 className="font-bold text-slate-900">{scheme.name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {(["basic", "eligibility"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize",
                activeTab === tab
                  ? "bg-primary text-white"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              )}
            >
              {tab === "eligibility" && eligibilityEnabled && (
                <Shield className="w-3 h-3 inline mr-1.5 text-current opacity-70" />
              )}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {activeTab === "basic" && (
            <>
              <div>
                <label className={labelClass}>Scheme Name</label>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea className={inputClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Validity (months)</label>
                  <input type="number" className={inputClass} min={1} value={validityMonths} onChange={(e) => setValidityMonths(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Pass Mark (%)</label>
                  <input type="number" className={inputClass} min={0} max={100} value={passMark} onChange={(e) => setPassMark(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Max Attempts</label>
                  <input type="number" className={inputClass} min={1} value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
                </div>
              </div>
              <Toggle
                label="Scheme Active"
                description="Inactive schemes are hidden from candidates"
                checked={isActive}
                onChange={setIsActive}
              />
            </>
          )}

          {activeTab === "eligibility" && (
            <>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">
                Eligibility requirements are checked when a candidate tries to enrol in a course linked
                to this scheme (ISO 17024 Cl.6.1). When enabled, candidates must submit an application
                that a Certification Officer reviews before enrolment is granted.
              </div>

              <Toggle
                label="Enable eligibility requirements"
                description="Require candidates to submit an application before enrolling"
                checked={eligibilityEnabled}
                onChange={setEligibilityEnabled}
              />

              {eligibilityEnabled && (
                <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Minimum Age (years)</label>
                      <input
                        type="number" min={0} placeholder="Optional"
                        className={inputClass}
                        value={minAgeYears}
                        onChange={(e) => setMinAgeYears(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Minimum Experience (years)</label>
                      <input
                        type="number" min={0} placeholder="Optional"
                        className={inputClass}
                        value={minExperienceYears}
                        onChange={(e) => setMinExperienceYears(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Required Qualifications</label>
                    <input
                      className={inputClass}
                      placeholder="Comma-separated, e.g. BSc Engineering, HND"
                      value={requiredQualifications}
                      onChange={(e) => setRequiredQualifications(e.target.value)}
                    />
                    <p className="text-xs text-slate-400 mt-1">Candidates declare they hold at least one of these.</p>
                  </div>

                  <div>
                    <label className={labelClass}>Required Prior Certifications (scheme codes)</label>
                    <input
                      className={inputClass}
                      placeholder="Comma-separated scheme codes, e.g. TMG-ELEC-L2"
                      value={requiredPriorCerts}
                      onChange={(e) => setRequiredPriorCerts(e.target.value)}
                    />
                    <p className="text-xs text-slate-400 mt-1">Candidates must hold active certificates in these schemes.</p>
                  </div>

                  <div className="space-y-3">
                    <p className={labelClass}>Required Documents</p>
                    <Toggle
                      label="Requires supporting documents"
                      description="Candidates must upload evidence (e.g. qualifications)"
                      checked={requiresDocuments}
                      onChange={setRequiresDocuments}
                    />
                    <Toggle
                      label="Requires employer letter"
                      description="Candidates must upload a letter from their employer"
                      checked={requiresEmployerLetter}
                      onChange={setRequiresEmployerLetter}
                    />
                    <Toggle
                      label="Requires ID document"
                      description="Candidates must upload a government-issued ID"
                      checked={requiresIdDocument}
                      onChange={setRequiresIdDocument}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Eligibility Notes (shown to candidates)</label>
                    <textarea
                      className={inputClass} rows={3}
                      placeholder="Explain any additional requirements or guidance…"
                      value={eligibilityNotes}
                      onChange={(e) => setEligibilityNotes(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Auto-approve after (minutes)</label>
                    <input
                      type="number" min={1}
                      className={inputClass}
                      value={autoApproveMinutes}
                      onChange={(e) => setAutoApproveMinutes(e.target.value)}
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      If a Certification Officer does not review the application within this window,
                      it is automatically approved. Default: 60 minutes.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button className="flex-1 gap-2" onClick={handleSave} disabled={isPending}>
            <Save className="w-4 h-4" />
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Create Modal ─────────────────────────────────────────────────────────────

function CreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (scheme: Scheme) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [standardVersion, setStandardVersion] = useState("ISO/IEC 17024:2012");
  const [validityMonths, setValidityMonths] = useState("36");
  const [passMark, setPassMark] = useState("70");
  const [maxAttempts, setMaxAttempts] = useState("3");
  const [cpdHoursRequired, setCpdHoursRequired] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setCode(""); setName(""); setDescription("");
    setStandardVersion("ISO/IEC 17024:2012");
    setValidityMonths("36"); setPassMark("70");
    setMaxAttempts("3"); setCpdHoursRequired("0");
    setIsActive(true);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleCreate() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/manage/schemes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            name,
            description: description || null,
            standardVersion: standardVersion || null,
            validityMonths: Number(validityMonths),
            passMark: Number(passMark),
            maxAttempts: Number(maxAttempts),
            cpdHoursRequired: Number(cpdHoursRequired),
            isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create scheme");
        toast.success("Scheme created");
        onCreated(data as Scheme);
        handleClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create scheme");
      }
    });
  }

  const labelClass = "text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1";
  const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Scheme</DialogTitle>
          <DialogDescription>
            Set the core parameters. Eligibility requirements can be configured after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Code <span className="text-red-400">*</span></label>
              <input
                className={inputClass}
                placeholder="e.g. CQA-001"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <p className="text-xs text-slate-400 mt-1">Must be unique. Auto-uppercased.</p>
            </div>
            <div>
              <label className={labelClass}>Name <span className="text-red-400">*</span></label>
              <input
                className={inputClass}
                placeholder="e.g. Certified Quality Auditor"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              className={inputClass}
              rows={3}
              placeholder="Optional overview of the certification scheme…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Standard Version</label>
            <input
              className={inputClass}
              placeholder="ISO/IEC 17024:2012"
              value={standardVersion}
              onChange={(e) => setStandardVersion(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Validity (months) <span className="text-red-400">*</span></label>
              <input type="number" min={1} className={inputClass} value={validityMonths} onChange={(e) => setValidityMonths(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Pass Mark (%) <span className="text-red-400">*</span></label>
              <input type="number" min={0} max={100} className={inputClass} value={passMark} onChange={(e) => setPassMark(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Max Attempts <span className="text-red-400">*</span></label>
              <input type="number" min={1} className={inputClass} value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>CPD Hours Required</label>
              <input type="number" min={0} className={inputClass} value={cpdHoursRequired} onChange={(e) => setCpdHoursRequired(e.target.value)} />
            </div>
          </div>

          <Toggle
            label="Scheme Active"
            description="Inactive schemes are hidden from candidates"
            checked={isActive}
            onChange={setIsActive}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isPending || !code.trim() || !name.trim()}
            className="gap-2"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isPending ? "Creating…" : "Create Scheme"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Toggle sub-component ──────────────────────────────────────────────────────

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 mt-0.5 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
          checked ? "bg-primary" : "bg-slate-200"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
      <div>
        <p className="text-sm font-medium text-slate-800 group-hover:text-slate-900">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export default function SchemeManagementPage({ schemes: initial }: { schemes: Scheme[] }) {
  const router = useRouter();
  const [schemes, setSchemes] = useState(initial);
  const [editing, setEditing] = useState<Scheme | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  function handleSaved(updated: Scheme) {
    setSchemes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditing(null);
    router.refresh();
  }

  function handleCreated(scheme: Scheme) {
    setSchemes((prev) => [scheme, ...prev]);
  }

  return (
    <>
      {editing && (
        <EditModal
          scheme={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      <CreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />

      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Certification Schemes</h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage scheme settings and eligibility requirements (ISO 17024 Cl.6.1).
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" /> New Scheme
          </Button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {schemes.length === 0 ? (
            <div className="p-12 text-center">
              <Award className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-700">No schemes found</p>
              <p className="text-sm text-slate-500 mt-1">Create a certification scheme in Settings.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {schemes.map((scheme) => (
                <div key={scheme.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{scheme.name}</span>
                      <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        {scheme.code}
                      </span>
                      {scheme.isActive ? (
                        <Badge className="border-0 text-xs bg-emerald-100 text-emerald-700 gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </Badge>
                      ) : (
                        <Badge className="border-0 text-xs bg-slate-100 text-slate-500 gap-1">
                          <XCircle className="w-3 h-3" /> Inactive
                        </Badge>
                      )}
                      {scheme.eligibilityEnabled ? (
                        <Badge className="border-0 text-xs bg-blue-100 text-blue-700 gap-1">
                          <Shield className="w-3 h-3" /> Eligibility on
                        </Badge>
                      ) : (
                        <Badge className="border-0 text-xs bg-slate-100 text-slate-400">
                          No eligibility gate
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-slate-400">
                      <span>Validity: {scheme.validityMonths} months</span>
                      <span>Pass: {scheme.passMark}%</span>
                      <span>Max attempts: {scheme.maxAttempts}</span>
                      {scheme.eligibilityEnabled && (
                        <span className="text-blue-500">
                          Auto-approve: {scheme.autoApproveMinutes} min
                        </span>
                      )}
                    </div>
                    {scheme.description && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{scheme.description}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={() => setEditing(scheme)}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Eligibility note */}
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-0.5">Enabling eligibility gates</p>
            <p className="text-xs">
              Once eligibility is enabled for a scheme, all new enrolments for courses linked to that
              scheme will require a candidate application. Existing enrolments are not affected.
              Review pending applications at{" "}
              <a href="/manage/applications" className="underline font-medium">
                Manage Applications
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
