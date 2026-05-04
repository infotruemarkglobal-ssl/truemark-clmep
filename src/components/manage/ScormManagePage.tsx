"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Upload, Package, Trash2, Users, ExternalLink, CheckCircle2, AlertCircle, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type SCORMPackage = {
  id: string;
  title: string;
  version: string;
  launchUrl: string;
  createdAt: string;
  sessionCount: number;
  lesson: { id: string; title: string; courseTitle: string } | null;
};

type AvailableLesson = { id: string; title: string; courseTitle: string };

export default function ScormManagePage({
  packages,
  availableLessons,
}: {
  packages: SCORMPackage[];
  availableLessons: AvailableLesson[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lessonId, setLessonId] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFilePick(files: FileList | null) {
    if (!files?.length) return;
    const file = files[0];
    if (!file.name.endsWith(".zip")) {
      toast.error("Please select a .zip SCORM package");
      return;
    }
    setSelectedFile(file);
  }

  async function uploadPackage() {
    if (!selectedFile) { toast.error("Select a .zip file first"); return; }
    setUploading(true);
    setUploadProgress(0);

    try {
      const form = new FormData();
      form.append("file", selectedFile);
      if (lessonId) form.append("lessonId", lessonId);

      // Use XMLHttpRequest for real upload progress
      const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/scorm/packages");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 90));
          }
        };
        xhr.onload = () => {
          setUploadProgress(100);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              reject(new Error(JSON.parse(xhr.responseText).error ?? "Upload failed"));
            } catch {
              reject(new Error("Upload failed"));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(form);
      });

      toast.success(`SCORM package "${result.title}" uploaded and extracted`);
      setSelectedFile(null);
      setLessonId("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function deletePackage(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This will remove the extracted files and all learner session data.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/scorm/packages/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Package deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SCORM Packages</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload SCORM 1.2 and SCORM 2004 packages. The engine tracks completion, score, and suspend data automatically.
        </p>
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-primary" /> Upload New Package
        </h2>

        {/* Drop zone */}
        <div
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition mb-4",
            dragOver ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
            selectedFile && "border-emerald-300 bg-emerald-50"
          )}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFilePick(e.dataTransfer.files);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => handleFilePick(e.target.files)}
          />
          {selectedFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileArchive className="w-8 h-8 text-emerald-600" />
              <div className="text-left">
                <p className="font-semibold text-slate-900">{selectedFile.name}</p>
                <p className="text-sm text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-medium text-slate-700">Drop your SCORM .zip here</p>
              <p className="text-sm text-slate-400 mt-1">or click to browse — max 500 MB</p>
              <p className="text-xs text-slate-400 mt-2">Supports SCORM 1.2 and SCORM 2004 packages</p>
            </>
          )}
        </div>

        {/* Link to lesson */}
        <div className="mb-4">
          <Label>Link to Lesson (optional)</Label>
          <select
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
          >
            <option value="">— Unlinked (upload only) —</option>
            {availableLessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.courseTitle} → {l.title}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Only SCORM-type lessons without an existing package are listed.
          </p>
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Uploading &amp; extracting…</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}

        <Button
          onClick={uploadPackage}
          disabled={!selectedFile || uploading}
          className="gap-2"
        >
          <Upload className="w-4 h-4" />
          {uploading ? "Processing…" : "Upload Package"}
        </Button>
      </div>

      {/* Packages list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-900 text-sm">{packages.length} Package{packages.length !== 1 ? "s" : ""}</h2>
        </div>

        {packages.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">No SCORM packages uploaded yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {packages.map((pkg) => (
              <div key={pkg.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 text-sm">{pkg.title}</p>
                    <Badge className="bg-slate-100 text-slate-600 border-0 text-[10px]">
                      SCORM {pkg.version}
                    </Badge>
                    {pkg.lesson ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Linked
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] gap-1">
                        <AlertCircle className="w-3 h-3" /> Unlinked
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                    {pkg.lesson && (
                      <p>{pkg.lesson.courseTitle} → {pkg.lesson.title}</p>
                    )}
                    <p className="font-mono text-[10px] text-slate-400">Launch: {pkg.launchUrl}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right text-xs text-slate-500 hidden sm:block">
                    <p className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {pkg.sessionCount} sessions
                    </p>
                    <p className="text-slate-400">{format(new Date(pkg.createdAt), "d MMM yyyy")}</p>
                  </div>
                  <a
                    href={`/scorm/player/${pkg.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition"
                    title="Preview"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => deletePackage(pkg.id, pkg.title)}
                    disabled={deleting === pkg.id}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
