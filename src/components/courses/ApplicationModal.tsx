"use client";

import { useState, useTransition } from "react";
import {
  X, CheckCircle2, ChevronRight, ChevronLeft, Upload,
  AlertTriangle, ClipboardList, FileText, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type Requirements = {
  minExperienceYears: number | null;
  requiredQualifications: string[] | null;
  requiresDocuments: boolean;
  requiresEmployerLetter: boolean;
  requiresIdDocument: boolean;
  eligibilityNotes: string | null;
  autoApproveMinutes: number;
};

type PreviousRejection = {
  id: string;
  rejectionReason: string | null;
  reviewedAt: string | null;
  declaredExperience: number | null;
  declaredQualification: string | null;
  priorCertNumbers: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  courseId: string;
  schemeName: string;
  requirements: Requirements;
  previousRejection: PreviousRejection | null;
};

const QUALIFICATION_OPTIONS = [
  "High School / Secondary School Certificate",
  "Diploma / Associate Degree",
  "Bachelor's Degree",
  "Master's Degree",
  "Doctoral Degree (PhD)",
  "Professional Qualification / Chartered Status",
  "Vocational / Trade Certificate",
  "Other",
];

const STEPS = ["Requirements", "Declarations", "Documents", "Legal Declaration"] as const;

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i < step ? "bg-blue-600 w-6" : i === step ? "bg-blue-400 w-8" : "bg-slate-200 w-6"
          }`}
        />
      ))}
    </div>
  );
}

async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/candidate/upload", { method: "POST", body: form });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? "Upload failed");
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

export default function ApplicationModal({
  open,
  onClose,
  courseId,
  schemeName,
  requirements,
  previousRejection,
}: Props) {
  const [step, setStep] = useState(0);
  const [understood, setUnderstood] = useState(false);
  const [experience, setExperience] = useState<string>(
    previousRejection?.declaredExperience?.toString() ?? "",
  );
  const [qualification, setQualification] = useState(
    previousRejection?.declaredQualification ?? "",
  );
  const [priorCertNums, setPriorCertNums] = useState<string[]>(
    previousRejection?.priorCertNumbers
      ? (JSON.parse(previousRejection.priorCertNumbers) as string[])
      : [""],
  );

  const [idDocUrl, setIdDocUrl] = useState<string | null>(null);
  const [qualDocUrl, setQualDocUrl] = useState<string | null>(null);
  const [empLetterUrl, setEmpLetterUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  const [legalConfirmed, setLegalConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ applicationRef: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const needsDocStep =
    requirements.requiresIdDocument ||
    requirements.requiresEmployerLetter ||
    requirements.requiresDocuments;

  // Build visible steps (Documents step is conditional)
  const visibleSteps = needsDocStep ? STEPS : (["Requirements", "Declarations", "Legal Declaration"] as const);
  const totalSteps = visibleSteps.length;

  // Translate local step index to actual step name
  function stepName() {
    return visibleSteps[step];
  }

  function canAdvanceStep0() {
    return understood;
  }

  function canAdvanceStep1() {
    if (requirements.minExperienceYears && !experience) return false;
    if (requirements.requiredQualifications?.length && !qualification) return false;
    return true;
  }

  function canAdvanceDocStep() {
    if (requirements.requiresIdDocument && !idDocUrl) return false;
    if (requirements.requiresEmployerLetter && !empLetterUrl) return false;
    return true;
  }

  function canSubmit() {
    return legalConfirmed;
  }

  async function handleUpload(field: "id" | "qual" | "employer", file: File) {
    setUploading((u) => ({ ...u, [field]: true }));
    setUploadErrors((e) => ({ ...e, [field]: "" }));
    try {
      const url = await uploadFile(file);
      if (field === "id") setIdDocUrl(url);
      else if (field === "qual") setQualDocUrl(url);
      else setEmpLetterUrl(url);
    } catch (err) {
      setUploadErrors((e) => ({
        ...e,
        [field]: err instanceof Error ? err.message : "Upload failed",
      }));
    } finally {
      setUploading((u) => ({ ...u, [field]: false }));
    }
  }

  function handleSubmit() {
    setSubmitError(null);
    startTransition(async () => {
      const payload = {
        courseId,
        declaredExperience: experience ? parseInt(experience, 10) : undefined,
        declaredQualification: qualification || undefined,
        priorCertNumbers: priorCertNums.filter(Boolean).length
          ? priorCertNums.filter(Boolean)
          : undefined,
        idDocumentUrl: idDocUrl ?? undefined,
        qualificationDocUrl: qualDocUrl ?? undefined,
        employerLetterUrl: empLetterUrl ?? undefined,
      };

      const res = await fetch("/api/scheme-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { applicationRef?: string; error?: string };
      if (!res.ok) {
        setSubmitError(
          typeof data.error === "string" ? data.error : "Submission failed. Please try again.",
        );
        return;
      }
      setSubmitted({ applicationRef: data.applicationRef! });
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Application — {schemeName}</h2>
            <div className="mt-1.5">
              <StepIndicator step={step} total={totalSteps} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* ── Success state ─────────────────────────────────────────────── */}
          {submitted ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">Application Submitted</p>
                <p className="text-sm text-slate-500 mt-1">
                  Reference:{" "}
                  <span className="font-mono font-semibold text-slate-700">
                    {submitted.applicationRef}
                  </span>
                </p>
              </div>
              <p className="text-sm text-slate-600">
                A Certification Officer will review your application. You will be notified within{" "}
                <strong>{requirements.autoApproveMinutes} minutes</strong> — applications are
                automatically approved if not reviewed in time.
              </p>
              <Button className="w-full" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : (
            <>
              {/* ── Step 0: Requirements overview ──────────────────────────── */}
              {stepName() === "Requirements" && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <ClipboardList className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-800">Eligibility Requirements</p>
                      <p className="text-sm text-slate-500 mt-0.5">
                        This certification scheme has formal eligibility requirements. Please review
                        them carefully before applying.
                      </p>
                    </div>
                  </div>

                  {previousRejection && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-amber-800">
                            Previous application rejected
                          </p>
                          {previousRejection.rejectionReason && (
                            <p className="text-sm text-amber-700 mt-0.5">
                              Reason: {previousRejection.rejectionReason}
                            </p>
                          )}
                          <p className="text-xs text-amber-600 mt-1">
                            You may reapply. Your previous answers have been pre-filled.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <ul className="space-y-2 text-sm">
                    {requirements.minExperienceYears && (
                      <li className="flex items-center gap-2 text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                        Minimum {requirements.minExperienceYears} year
                        {requirements.minExperienceYears !== 1 ? "s" : ""} of relevant work
                        experience
                      </li>
                    )}
                    {requirements.requiredQualifications?.map((q) => (
                      <li key={q} className="flex items-center gap-2 text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                        Qualification: {q}
                      </li>
                    ))}
                    {requirements.requiresIdDocument && (
                      <li className="flex items-center gap-2 text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                        Government-issued ID document
                      </li>
                    )}
                    {requirements.requiresDocuments && (
                      <li className="flex items-center gap-2 text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                        Qualification certificate / supporting documents
                      </li>
                    )}
                    {requirements.requiresEmployerLetter && (
                      <li className="flex items-center gap-2 text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                        Employer letter confirming work experience
                      </li>
                    )}
                  </ul>

                  {requirements.eligibilityNotes && (
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600">
                      <p className="font-medium text-slate-700 mb-1">Additional notes</p>
                      <p>{requirements.eligibilityNotes}</p>
                    </div>
                  )}

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-blue-600"
                      checked={understood}
                      onChange={(e) => setUnderstood(e.target.checked)}
                    />
                    <span className="text-sm text-slate-700 group-hover:text-slate-900">
                      I have read and understood the eligibility requirements for this certification.
                    </span>
                  </label>
                </div>
              )}

              {/* ── Step 1: Self-declarations ─────────────────────────────── */}
              {stepName() === "Declarations" && (
                <div className="space-y-5">
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-800">Self-declaration</p>
                      <p className="text-sm text-slate-500 mt-0.5">
                        Please confirm your qualifications and experience. All information is
                        subject to verification.
                      </p>
                    </div>
                  </div>

                  {requirements.minExperienceYears !== null &&
                    requirements.minExperienceYears !== undefined && (
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700">
                          Years of relevant experience
                          <span className="text-red-500 ml-1">*</span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          placeholder={`Minimum ${requirements.minExperienceYears} year(s)`}
                          value={experience}
                          onChange={(e) => setExperience(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}

                  {!!requirements.requiredQualifications?.length && (
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">
                        Highest relevant qualification
                        <span className="text-red-500 ml-1">*</span>
                      </label>
                      <select
                        value={qualification}
                        onChange={(e) => setQualification(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select a qualification…</option>
                        {QUALIFICATION_OPTIONS.map((q) => (
                          <option key={q} value={q}>
                            {q}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Prior certification numbers{" "}
                      <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <p className="text-xs text-slate-500">
                      If you hold relevant certifications from other bodies, enter their numbers
                      here.
                    </p>
                    {priorCertNums.map((val, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          type="text"
                          placeholder={`Certification number ${idx + 1}`}
                          value={val}
                          maxLength={100}
                          onChange={(e) => {
                            const updated = [...priorCertNums];
                            updated[idx] = e.target.value;
                            setPriorCertNums(updated);
                          }}
                          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {priorCertNums.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setPriorCertNums((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-slate-400 hover:text-red-500 transition-colors p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {priorCertNums.length < 5 && (
                      <button
                        type="button"
                        onClick={() => setPriorCertNums((prev) => [...prev, ""])}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        + Add another
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Documents step ───────────────────────────────────────── */}
              {stepName() === "Documents" && (
                <div className="space-y-5">
                  <div className="flex items-start gap-3">
                    <Upload className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-800">Document Uploads</p>
                      <p className="text-sm text-slate-500 mt-0.5">
                        Upload supporting documents. Accepted formats: PDF, JPEG, PNG (max 5MB
                        each).
                      </p>
                    </div>
                  </div>

                  {requirements.requiresIdDocument && (
                    <FileUploadField
                      label="Government-issued ID document"
                      required
                      uploaded={!!idDocUrl}
                      uploading={!!uploading.id}
                      error={uploadErrors.id}
                      onChange={(f) => handleUpload("id", f)}
                    />
                  )}

                  {requirements.requiresDocuments && (
                    <FileUploadField
                      label="Qualification certificate / supporting document"
                      required={false}
                      uploaded={!!qualDocUrl}
                      uploading={!!uploading.qual}
                      error={uploadErrors.qual}
                      onChange={(f) => handleUpload("qual", f)}
                    />
                  )}

                  {requirements.requiresEmployerLetter && (
                    <FileUploadField
                      label="Employer letter confirming experience"
                      required
                      uploaded={!!empLetterUrl}
                      uploading={!!uploading.employer}
                      error={uploadErrors.employer}
                      onChange={(f) => handleUpload("employer", f)}
                    />
                  )}
                </div>
              )}

              {/* ── Legal Declaration ─────────────────────────────────────── */}
              {stepName() === "Legal Declaration" && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-800">Legal Declaration</p>
                      <p className="text-sm text-slate-500 mt-0.5">
                        Please read and confirm the following declaration before submitting your
                        application.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 leading-relaxed space-y-3">
                    <p>
                      I declare that all information provided in this application is accurate and
                      complete to the best of my knowledge and belief.
                    </p>
                    <p>
                      I understand that providing false or misleading information may result in:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-slate-600">
                      <li>Immediate cancellation of my application</li>
                      <li>Revocation of any certification awarded</li>
                      <li>Potential legal proceedings</li>
                    </ul>
                    <p>
                      I agree to notify TrueMark Global of any material changes to my circumstances
                      that may affect my continued eligibility for this certification.
                    </p>
                  </div>

                  {submitError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {submitError}
                    </div>
                  )}

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-blue-600"
                      checked={legalConfirmed}
                      onChange={(e) => setLegalConfirmed(e.target.checked)}
                    />
                    <span className="text-sm text-slate-700 group-hover:text-slate-900">
                      I confirm this declaration is true, and I consent to TrueMark Global
                      recording my IP address and the date/time of this submission for legal
                      compliance purposes.
                    </span>
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer navigation */}
        {!submitted && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-between gap-3">
            {step > 0 ? (
              <Button
                variant="outline"
                onClick={() => setStep((s) => s - 1)}
                disabled={isPending}
                className="gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
            ) : (
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}

            {step < totalSteps - 1 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={
                  (stepName() === "Requirements" && !canAdvanceStep0()) ||
                  (stepName() === "Declarations" && !canAdvanceStep1()) ||
                  (stepName() === "Documents" && !canAdvanceDocStep())
                }
                className="gap-1.5 ml-auto"
              >
                Continue <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit() || isPending}
                className="ml-auto"
              >
                {isPending ? "Submitting…" : "Submit Application"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FileUploadField({
  label,
  required,
  uploaded,
  uploading,
  error,
  onChange,
}: {
  label: string;
  required: boolean;
  uploaded: boolean;
  uploading: boolean;
  error?: string;
  onChange: (file: File) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {uploaded ? (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          File uploaded successfully
        </div>
      ) : (
        <label className="flex items-center gap-3 rounded-lg border-2 border-dashed border-slate-200 px-4 py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
          <Upload className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-sm text-slate-500">
            {uploading ? "Uploading…" : "Click to choose file (PDF, JPEG, PNG · max 5MB)"}
          </span>
          <input
            type="file"
            className="sr-only"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onChange(file);
            }}
          />
        </label>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
