"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building2, ChevronLeft, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Mirrors the API schema in POST /api/organisations.
// The manager block is all-or-nothing: if any field is filled, all three are required.
const schema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    registrationNo: z.string().optional(),
    country: z.string().optional(),
    website: z
      .string()
      .url("Enter a valid URL, e.g. https://example.com")
      .or(z.literal(""))
      .optional(),
    managerFirstName: z.string().optional(),
    managerLastName: z.string().optional(),
    managerEmail: z
      .string()
      .email("Enter a valid email address")
      .or(z.literal(""))
      .optional(),
  })
  .superRefine((data, ctx) => {
    const anyManagerField =
      data.managerFirstName?.trim() ||
      data.managerLastName?.trim() ||
      data.managerEmail?.trim();

    if (anyManagerField) {
      if (!data.managerFirstName?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["managerFirstName"],
          message: "Required when adding an org manager",
        });
      }
      if (!data.managerLastName?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["managerLastName"],
          message: "Required when adding an org manager",
        });
      }
      if (!data.managerEmail?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["managerEmail"],
          message: "Required when adding an org manager",
        });
      }
    }
  });

type FormData = z.infer<typeof schema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive mt-1">{message}</p>;
}

export default function NewOrgForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          // Strip empty strings — API treats missing field as "not provided"
          registrationNo: data.registrationNo || undefined,
          country: data.country || undefined,
          website: data.website || undefined,
          managerFirstName: data.managerFirstName || undefined,
          managerLastName: data.managerLastName || undefined,
          managerEmail: data.managerEmail || undefined,
        }),
      });

      const result = await res.json() as { id?: string; name?: string; error?: string | object };

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
      {/* Back link */}
      <Link
        href="/platform/organisations"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition"
      >
        <ChevronLeft className="w-4 h-4" /> Back to organisations
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Create New Organisation</h1>
        <p className="text-slate-500 text-sm mt-1">
          Set up a new client organisation. You can add more details after creation.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        {/* ── Organisation details ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="p-6 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" /> Organisation Details
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
                aria-describedby={errors.name ? "name-error" : undefined}
                {...register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  Country{" "}
                  <span className="text-slate-400 font-normal text-xs">(optional)</span>
                </Label>
                <Input
                  id="country"
                  placeholder="Nigeria"
                  autoComplete="country-name"
                  {...register("country")}
                />
              </div>
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
                aria-describedby={errors.website ? "website-error" : undefined}
                {...register("website")}
              />
              <FieldError message={errors.website?.message} />
            </div>
          </div>
        </div>

        {/* ── Optional org manager ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" /> Org Manager Account{" "}
                <span className="text-slate-400 font-normal text-xs">(optional)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                If you provide manager details, a platform account will be created (or an existing
                account will be linked) and a welcome email sent with temporary credentials.
                All three fields are required together.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="managerFirstName">First Name</Label>
                <Input
                  id="managerFirstName"
                  placeholder="Jane"
                  autoComplete="given-name"
                  aria-invalid={!!errors.managerFirstName}
                  aria-describedby={errors.managerFirstName ? "mgr-fn-error" : undefined}
                  {...register("managerFirstName")}
                />
                <FieldError message={errors.managerFirstName?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="managerLastName">Last Name</Label>
                <Input
                  id="managerLastName"
                  placeholder="Smith"
                  autoComplete="family-name"
                  aria-invalid={!!errors.managerLastName}
                  aria-describedby={errors.managerLastName ? "mgr-ln-error" : undefined}
                  {...register("managerLastName")}
                />
                <FieldError message={errors.managerLastName?.message} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="managerEmail">Email Address</Label>
              <Input
                id="managerEmail"
                type="email"
                placeholder="jane@company.com"
                autoComplete="email"
                aria-invalid={!!errors.managerEmail}
                aria-describedby={errors.managerEmail ? "mgr-email-error" : undefined}
                {...register("managerEmail")}
              />
              <FieldError message={errors.managerEmail?.message} />
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Creating…" : "Create Organisation"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
