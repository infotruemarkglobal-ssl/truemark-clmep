"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Building2, ChevronLeft, ChevronRight, Loader2,
  FileText, Globe, Upload, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ORG_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;

const INDUSTRIES = [
  "Healthcare", "Education", "Manufacturing", "IT/Technology",
  "Finance/Banking", "Oil & Gas", "Government", "NGO/Non-profit",
  "Consulting", "Other",
] as const;

const COUNTRIES = [
  "Nigeria", "Ghana", "Kenya", "South Africa", "Egypt",
  "United Kingdom", "United States", "Canada", "Australia",
  "Germany", "France", "India", "Singapore", "UAE",
  "Rwanda", "Tanzania", "Uganda", "Ethiopia", "Senegal",
  "Cameroon", "Ivory Coast", "Zambia", "Zimbabwe", "Botswana", "Other",
];

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  registrationNo: z.string().optional(),
  country: z.string().min(1, "Country is required"),
  website: z.string().url("Enter a valid URL, e.g. https://example.com").or(z.literal("")).optional(),
  industry: z.string().min(1, "Industry is required"),
  size: z.enum(ORG_SIZES).optional(),
  description: z
    .string()
    .min(50, "Please write at least 50 characters")
    .max(500, "Maximum 500 characters"),
  cacDocumentUrl: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

// Fields that must pass validation before advancing from each step
const STEP_REQUIRED: Record<number, (keyof FormData)[]> = {
  1: ["name", "country"],
  2: ["industry", "description"],
  3: [],
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive mt-1">{message}</p>;
}

function StepIndicator({ step }: { step: number }) {
  const labels = ["Basic Info", "Profile", "Documents"];
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              s < step
                ? "bg-emerald-500 text-white"
                : s === step
                ? "bg-primary text-white"
                : "bg-slate-200 text-slate-500"
            }`}
          >
            {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
          </div>
          <span
            className={`hidden sm:block text-xs font-medium transition-colors ${
              s === step ? "text-slate-900" : "text-slate-400"
            }`}
          >
            {labels[s - 1]}
          </span>
          {s < 3 && (
            <div
              className={`h-0.5 w-8 sm:w-16 transition-colors ${
                s < step ? "bg-emerald-400" : "bg-slate-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function NewOrgForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cacUrl, setCacUrl] = useState("");
  const [cacFileName, setCacFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema), mode: "onTouched" });

  const descriptionValue = watch("description") ?? "";

  async function handleNext() {
    const valid = await trigger(STEP_REQUIRED[step]);
    if (valid) setStep((s) => s + 1);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File must be under 5 MB");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/candidate/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      const url = data.url ?? "";
      setCacUrl(url);
      setCacFileName(file.name);
      setValue("cacDocumentUrl", url);
      toast.success("Document uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          registrationNo: data.registrationNo || undefined,
          country: data.country,
          website: data.website || undefined,
          industry: data.industry,
          size: data.size || undefined,
          description: data.description,
          cacDocumentUrl: cacUrl || undefined,
        }),
      });

      const result = (await res.json()) as {
        id?: string;
        name?: string;
        error?: string | object;
      };

      if (!res.ok) {
        toast.error(
          typeof result.error === "string"
            ? result.error
            : "Failed to create organisation. Check the form and try again."
        );
        return;
      }

      toast.success(`Organisation "${result.name}" created`);
      router.push(`/organisations/${result.id}`);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/platform/organisations"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition"
      >
        <ChevronLeft className="w-4 h-4" /> Back to organisations
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Create New Organisation</h1>
        <p className="text-slate-500 text-sm mt-1">
          Step {step} of 3 — complete all sections to register the organisation.
        </p>
      </div>

      <StepIndicator step={step} />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* ── Step 1: Basic Info ── */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" /> Basic Information
            </h2>

            <div className="space-y-1.5">
              <Label htmlFor="name">
                Organisation Name <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Input
                id="name"
                placeholder="Acme Industries Ltd."
                autoComplete="organization"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="registrationNo">
                RC / Registration No{" "}
                <span className="text-slate-400 font-normal text-xs">(optional)</span>
              </Label>
              <Input
                id="registrationNo"
                placeholder="RC-1234567"
                {...register("registrationNo")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="country">
                Country <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <select
                id="country"
                aria-invalid={!!errors.country}
                className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-transparent text-slate-700 focus:outline-none focus:ring-2 focus:ring-ring/50"
                {...register("country")}
              >
                <option value="">Select a country…</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <FieldError message={errors.country?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="website">
                Website{" "}
                <span className="text-slate-400 font-normal text-xs">(optional)</span>
              </Label>
              <Input
                id="website"
                type="url"
                placeholder="https://yourcompany.com"
                autoComplete="url"
                aria-invalid={!!errors.website}
                {...register("website")}
              />
              <FieldError message={errors.website?.message} />
            </div>
          </div>
        )}

        {/* ── Step 2: Profile ── */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-400" /> Organisation Profile
            </h2>

            <div className="space-y-1.5">
              <Label htmlFor="industry">
                Industry <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <select
                id="industry"
                aria-invalid={!!errors.industry}
                className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-transparent text-slate-700 focus:outline-none focus:ring-2 focus:ring-ring/50"
                {...register("industry")}
              >
                <option value="">Select an industry…</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
              <FieldError message={errors.industry?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="size">
                Organisation Size{" "}
                <span className="text-slate-400 font-normal text-xs">(optional)</span>
              </Label>
              <select
                id="size"
                className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-transparent text-slate-700 focus:outline-none focus:ring-2 focus:ring-ring/50"
                {...register("size")}
              >
                <option value="">Select size…</option>
                {ORG_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} employees
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">
                Description <span className="text-destructive" aria-hidden>*</span>{" "}
                <span className="text-slate-400 font-normal text-xs">(min 50 characters)</span>
              </Label>
              <textarea
                id="description"
                rows={5}
                placeholder="Describe what this organisation does, their core objectives, and areas of specialisation…"
                aria-invalid={!!errors.description}
                className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-transparent text-slate-700 focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
                {...register("description")}
              />
              <div className="flex items-start justify-between gap-2">
                <FieldError message={errors.description?.message} />
                <span
                  className={`text-xs shrink-0 ml-auto ${
                    descriptionValue.length < 50 ? "text-slate-400" : "text-emerald-600"
                  }`}
                >
                  {descriptionValue.length}/500
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Documents ── */}
        {step === 3 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" /> Supporting Documents
            </h2>
            <p className="text-sm text-slate-500">
              Upload the organisation&apos;s Certificate of Incorporation or CAC document. PDF
              only, max 5 MB. This step is optional — you can upload documents later from the
              organisation profile.
            </p>

            <div className="space-y-2">
              <Label>
                CAC / Incorporation Document{" "}
                <span className="text-slate-400 font-normal text-xs">
                  (optional · PDF · max 5 MB)
                </span>
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileUpload}
              />
              {cacFileName ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-emerald-800 truncate">{cacFileName}</p>
                    <p className="text-xs text-emerald-600">Uploaded successfully</p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-700 underline shrink-0"
                    onClick={() => {
                      setCacUrl("");
                      setCacFileName("");
                      setValue("cacDocumentUrl", "");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex flex-col items-center gap-2 p-8 border-2 border-dashed border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6" />
                  )}
                  <span className="text-sm font-medium">
                    {uploading ? "Uploading…" : "Click to upload PDF"}
                  </span>
                  {!uploading && (
                    <span className="text-xs text-slate-400">PDF documents only · max 5 MB</span>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="flex items-center justify-between mt-6">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          )}

          {step < 3 ? (
            <Button type="button" onClick={handleNext} className="gap-2">
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={submitting || uploading} className="gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Creating…" : "Create Organisation"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
