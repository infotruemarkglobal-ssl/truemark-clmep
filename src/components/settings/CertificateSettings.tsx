"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PenLine, Upload, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  initialDirectorName: string | null;
  initialDirectorSigUrl: string | null;
};

export default function CertificateSettings({ initialDirectorName, initialDirectorSigUrl }: Props) {
  const [directorName, setDirectorName] = useState(initialDirectorName ?? "");
  const [directorSigUrl, setDirectorSigUrl] = useState(initialDirectorSigUrl);
  const [savingName, setSavingName] = useState(false);
  const [uploadingSig, setUploadingSig] = useState(false);
  const [removingSig, setRemovingSig] = useState(false);

  async function saveDirectorName() {
    if (!directorName.trim()) return;
    setSavingName(true);
    try {
      const res = await fetch("/api/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "cert_director_name", value: directorName.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      toast.success("Director name saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingName(false);
    }
  }

  async function uploadSig(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSig(true);
    try {
      const fd = new FormData();
      fd.append("signature", file);
      const res = await fetch("/api/platform-settings/director-signature", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      const { signatureUrl } = await res.json();
      setDirectorSigUrl(signatureUrl);
      toast.success("Director signature saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingSig(false);
      e.target.value = "";
    }
  }

  async function removeSig() {
    setRemovingSig(true);
    try {
      const res = await fetch("/api/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "cert_director_signature_url", value: "" }),
      });
      if (!res.ok) throw new Error("Failed");
      setDirectorSigUrl(null);
      toast.success("Signature removed");
    } catch {
      toast.error("Failed to remove signature");
    } finally {
      setRemovingSig(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 md:col-span-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <PenLine className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">Certificate Signatures</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure the Director of Certification name and signature that appears on all issued PDF certificates.
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Director name */}
        <div className="space-y-2">
          <Label htmlFor="directorName" className="text-sm">Director of Certification — Name</Label>
          <div className="flex gap-2">
            <Input
              id="directorName"
              value={directorName}
              onChange={(e) => setDirectorName(e.target.value)}
              placeholder="e.g. Dr. Sarah Adeyemi"
              className="flex-1"
            />
            <Button
              type="button"
              size="sm"
              onClick={saveDirectorName}
              disabled={savingName || !directorName.trim()}
              className="gap-2 shrink-0"
            >
              <Save className="w-4 h-4" />
              {savingName ? "Saving…" : "Save"}
            </Button>
          </div>
          <p className="text-xs text-slate-400">This name appears below the Director signature line on certificates.</p>
        </div>

        {/* Director signature image */}
        <div className="space-y-2">
          <Label className="text-sm">Director of Certification — Signature Image</Label>
          {directorSigUrl ? (
            <div className="flex items-end gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={directorSigUrl}
                alt="Director signature"
                className="h-14 border border-slate-200 rounded-lg bg-slate-50 p-2 object-contain"
              />
              <div className="flex gap-2">
                <label className="cursor-pointer">
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={uploadSig} />
                  <span className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer",
                    uploadingSig && "opacity-50 pointer-events-none"
                  )}>
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingSig ? "Uploading…" : "Replace"}
                  </span>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5 text-xs h-8"
                  onClick={removeSig}
                  disabled={removingSig}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {removingSig ? "Removing…" : "Remove"}
                </Button>
              </div>
            </div>
          ) : (
            <label className="cursor-pointer w-fit block">
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={uploadSig} />
              <span className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:border-primary hover:text-primary transition",
                uploadingSig && "opacity-50 pointer-events-none"
              )}>
                <Upload className="w-4 h-4" />
                {uploadingSig ? "Uploading…" : "Upload signature image"}
              </span>
            </label>
          )}
          <p className="text-xs text-slate-400">PNG recommended, transparent background, max 2 MB.</p>
        </div>
      </div>
    </div>
  );
}
