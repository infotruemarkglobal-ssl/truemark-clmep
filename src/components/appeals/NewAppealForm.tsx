"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { Scale, ChevronLeft, Paperclip, AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ExamAttempt = {
  id: string;
  examTitle: string;
  percentageScore: number | null;
  submittedAt: string | null;
};

const APPEAL_TYPES = [
  { value: "exam_result", label: "Exam Result" },
  { value: "certification_decision", label: "Certification Decision" },
  { value: "misconduct_finding", label: "Misconduct Finding" },
  { value: "other", label: "Other" },
] as const;

const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
const MAX_FILE_MB = 10;

const schema = z.object({
  type: z.enum(["exam_result", "certification_decision", "misconduct_finding", "other"]),
  subjectId: z.string().optional().nullable(),
  description: z
    .string()
    .min(50, "Please describe your grounds in at least 50 characters")
    .max(2000, "Maximum 2000 characters allowed"),
});

type FormData = z.infer<typeof schema>;

export default function NewAppealForm({ examAttempts }: { examAttempts: ExamAttempt[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: "exam_result", subjectId: null, description: "" },
  });

  const selectedType = watch("type");
  const description = watch("description") ?? "";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) { setSelectedFile(null); return; }

    if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
      setFileError("Only PDF and image files (JPEG, PNG, WebP) are accepted");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(`File must be under ${MAX_FILE_MB} MB`);
      e.target.value = "";
      return;
    }
    setSelectedFile(file);
  }

  function removeFile() {
    setSelectedFile(null);
    setFileError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setServerError(null);
    try {
      let evidenceUrls: string[] | undefined;

      if (selectedFile) {
        const fd = new FormData();
        fd.append("file", selectedFile);
        fd.append("type", selectedFile.type.startsWith("image/") ? "image" : "pdf");
        const uploadRes = await fetch("/api/candidate/upload", { method: "POST", body: fd });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          throw new Error(err.error ?? "Failed to upload evidence file");
        }
        const { url } = await uploadRes.json();
        if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
          evidenceUrls = [url];
        }
      }

      const res = await fetch("/api/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: data.type,
          subjectId: data.subjectId || null,
          description: data.description,
          ...(evidenceUrls ? { evidenceUrls } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to submit appeal");
      }

      toast.success("Appeal submitted. We will acknowledge it within 2 working days.");
      router.push("/appeals");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Heading */}
      <div>
        <Link
          href="/appeals"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Appeals
        </Link>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
            <Scale className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Submit an Appeal</h1>
            <p className="text-sm text-slate-500 mt-1">
              Appeals must be submitted within 28 days of the decision. We will acknowledge your
              appeal within 2 working days and aim to resolve it within 28 days.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {/* Appeal Type */}
          <div className="p-5 space-y-1.5">
            <Label htmlFor="type" className="text-sm font-medium text-slate-700">
              Appeal Type <span className="text-red-500">*</span>
            </Label>
            <select
              id="type"
              {...register("type")}
              className={cn(
                "w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors",
                errors.type ? "border-red-300" : "border-slate-200",
              )}
            >
              {APPEAL_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {errors.type && (
              <p className="text-xs text-red-500">{errors.type.message}</p>
            )}
          </div>

          {/* Related Exam Attempt */}
          {selectedType === "exam_result" && examAttempts.length > 0 && (
            <div className="p-5 space-y-1.5">
              <Label htmlFor="subjectId" className="text-sm font-medium text-slate-700">
                Related Exam Attempt{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </Label>
              <select
                id="subjectId"
                {...register("subjectId")}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
              >
                <option value="">Select an attempt…</option>
                {examAttempts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.examTitle}
                    {a.percentageScore != null ? ` — ${a.percentageScore.toFixed(1)}%` : ""}
                    {a.submittedAt
                      ? ` (${format(new Date(a.submittedAt), "d MMM yyyy")})`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Grounds for Appeal */}
          <div className="p-5 space-y-1.5">
            <Label htmlFor="description" className="text-sm font-medium text-slate-700">
              Grounds for Appeal <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              rows={7}
              placeholder="Describe the grounds for your appeal in detail. Include relevant facts, dates, and why you believe the decision was incorrect…"
              aria-invalid={!!errors.description}
              {...register("description")}
              className="resize-none"
            />
            <div className="flex items-center justify-between">
              {errors.description ? (
                <p className="text-xs text-red-500">{errors.description.message}</p>
              ) : (
                <p className="text-xs text-slate-400">Minimum 50 characters</p>
              )}
              <p
                className={cn(
                  "text-xs tabular-nums",
                  description.length > 2000 ? "text-red-500" : "text-slate-400",
                )}
              >
                {description.length} / 2000
              </p>
            </div>
          </div>

          {/* Supporting Evidence */}
          <div className="p-5 space-y-2">
            <Label className="text-sm font-medium text-slate-700">
              Supporting Evidence{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </Label>
            <p className="text-xs text-slate-500">
              Attach a PDF or image (JPEG, PNG, WebP) up to {MAX_FILE_MB} MB.
            </p>

            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer",
                "hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30",
                selectedFile
                  ? "border-emerald-300 bg-emerald-50/40"
                  : fileError
                    ? "border-red-300 bg-red-50/30"
                    : "border-slate-200",
              )}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleFileChange}
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <Paperclip className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-sm text-emerald-700 font-medium truncate max-w-xs">
                    {selectedFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeFile(); }}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Paperclip className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-500">
                    <span className="font-medium text-emerald-600">Click to upload</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    PDF, JPEG, PNG, WebP up to {MAX_FILE_MB} MB
                  </p>
                </>
              )}
            </div>

            {fileError && (
              <p className="flex items-center gap-1.5 text-xs text-red-500">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {fileError}
              </p>
            )}
          </div>
        </div>

        {/* Server error */}
        {serverError && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {serverError}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Link href="/appeals">
            <Button type="button" variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting} className="min-w-36 gap-1.5">
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit Appeal"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
