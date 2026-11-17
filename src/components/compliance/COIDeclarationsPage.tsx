"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Shield, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Declaration = {
  id: string;
  declarationText: string;
  hasConflict: boolean;
  conflictDetails: string | null;
  riskLevel: string;
  status: string;
  declaredAt: string;
  expiresAt: string;
  userId: string;
  user: { firstName: string; lastName: string; email: string; role: string };
  subject: { firstName: string; lastName: string; email: string } | null;
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "border-slate-200 text-slate-600 bg-slate-50",
  UNDER_REVIEW: "border-amber-200 text-amber-700 bg-amber-50",
  RESOLVED: "border-emerald-200 text-emerald-700 bg-emerald-50",
};

const RISK_STYLES: Record<string, string> = {
  LOW: "border-slate-200 text-slate-500 bg-slate-50",
  MEDIUM: "border-amber-200 text-amber-700 bg-amber-50",
  HIGH: "border-red-200 text-red-700 bg-red-50",
};

function DeclarationRow({ d, canReviewAll, currentUserId, onChanged }: { d: Declaration; canReviewAll: boolean; currentUserId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function transition(status: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/coi/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      toast.success(`Declaration moved to ${status.replace("_", " ").toLowerCase()}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const isOwn = d.userId === currentUserId;

  return (
    <div className="px-5 py-4 border-b border-slate-100 last:border-0">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-slate-900 text-sm">{d.user.firstName} {d.user.lastName}</span>
            <span className="text-xs text-slate-400">{d.user.role}</span>
            <Badge variant="outline" className={cn("text-[10px]", d.hasConflict ? "border-red-200 text-red-700 bg-red-50" : "border-emerald-200 text-emerald-700 bg-emerald-50")}>
              {d.hasConflict ? "Conflict declared" : "No conflict"}
            </Badge>
            {d.hasConflict && (
              <Badge variant="outline" className={cn("text-[10px]", RISK_STYLES[d.riskLevel])}>
                {d.riskLevel} risk
              </Badge>
            )}
            <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLES[d.status])}>
              {d.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-sm text-slate-600">{d.declarationText}</p>
          {d.hasConflict && d.conflictDetails && (
            <p className="text-xs text-slate-500 mt-1">Details: {d.conflictDetails}</p>
          )}
          <div className="flex gap-4 mt-1.5 text-xs text-slate-400">
            {d.subject && <span>Concerns: {d.subject.firstName} {d.subject.lastName} ({d.subject.email})</span>}
            <span>Declared {new Date(d.declaredAt).toLocaleDateString()}</span>
            <span>Expires {new Date(d.expiresAt).toLocaleDateString()}</span>
          </div>
        </div>
        {canReviewAll && !isOwn && d.status !== "RESOLVED" && (
          <div className="flex gap-1.5 shrink-0">
            {d.status === "ACTIVE" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => transition("UNDER_REVIEW")}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Start review"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={busy} onClick={() => transition("RESOLVED")}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Resolve"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function COIDeclarationsPage({ canReviewAll, currentUserId }: { canReviewAll: boolean; currentUserId: string }) {
  const [mine, setMine] = useState<Declaration[] | null>(null);
  const [all, setAll] = useState<Declaration[] | null>(null);
  const [tab, setTab] = useState<"mine" | "all">("mine");

  const [hasConflict, setHasConflict] = useState(false);
  const [declarationText, setDeclarationText] = useState("");
  const [conflictDetails, setConflictDetails] = useState("");
  const [subjectEmail, setSubjectEmail] = useState("");
  const [riskLevel, setRiskLevel] = useState("LOW");
  const [submitting, setSubmitting] = useState(false);

  const loadMine = useCallback(async () => {
    const res = await fetch("/api/coi");
    const body = await res.json();
    setMine(body.declarations ?? []);
  }, []);

  const loadAll = useCallback(async () => {
    if (!canReviewAll) return;
    const res = await fetch("/api/coi?scope=all");
    const body = await res.json();
    setAll(body.declarations ?? []);
  }, [canReviewAll]);

  useEffect(() => { loadMine(); }, [loadMine]);
  useEffect(() => { if (tab === "all") loadAll(); }, [tab, loadAll]);

  async function submit() {
    if (declarationText.trim().length < 10) {
      toast.error("Describe the declaration in at least 10 characters");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/coi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          declarationText,
          hasConflict,
          conflictDetails: hasConflict ? conflictDetails || null : null,
          subjectEmail: hasConflict ? subjectEmail : "",
          riskLevel: hasConflict ? riskLevel : "LOW",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.formErrors?.[0] ?? body.error ?? "Failed");
      toast.success("Declaration recorded");
      setDeclarationText("");
      setConflictDetails("");
      setSubjectEmail("");
      setHasConflict(false);
      setRiskLevel("LOW");
      loadMine();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" /> Conflict of Interest Declarations
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          ISO 17024 Cl.4.3 impartiality-risk process — declare, and have reviewed, any relationship that could
          compromise an objective certification decision.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">New declaration</h2>
        <div>
          <Label htmlFor="coi-text">Declaration</Label>
          <Textarea
            id="coi-text"
            className="mt-1.5"
            rows={2}
            placeholder="e.g. I confirm I have no undisclosed relationships with candidates I may assess this period."
            value={declarationText}
            onChange={(e) => setDeclarationText(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={hasConflict} onChange={(e) => setHasConflict(e.target.checked)} className="rounded border-slate-300" />
          This declaration names an actual conflict
        </label>
        {hasConflict && (
          <div className="grid sm:grid-cols-2 gap-4 pl-1 border-l-2 border-amber-200">
            <div className="sm:col-span-2 pl-3">
              <Label htmlFor="coi-subject">Candidate&apos;s email (leave blank if the conflict is general, not case-specific)</Label>
              <Input id="coi-subject" type="email" className="mt-1.5" placeholder="candidate@example.com" value={subjectEmail} onChange={(e) => setSubjectEmail(e.target.value)} />
            </div>
            <div className="pl-3">
              <Label htmlFor="coi-risk">Risk level</Label>
              <select id="coi-risk" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div className="sm:col-span-2 pl-3">
              <Label htmlFor="coi-details">Details</Label>
              <Textarea id="coi-details" className="mt-1.5" rows={2} placeholder="Describe the nature of the relationship" value={conflictDetails} onChange={(e) => setConflictDetails(e.target.value)} />
            </div>
          </div>
        )}
        <Button onClick={submit} disabled={submitting} className="gap-2">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Submit declaration
        </Button>
      </div>

      {canReviewAll ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "mine" | "all")}>
          <TabsList>
            <TabsTrigger value="mine">My declarations</TabsTrigger>
            <TabsTrigger value="all">All declarations</TabsTrigger>
          </TabsList>
          <TabsContent value="mine">
            <DeclarationList declarations={mine} canReviewAll={canReviewAll} currentUserId={currentUserId} onChanged={loadMine} />
          </TabsContent>
          <TabsContent value="all">
            <DeclarationList declarations={all} canReviewAll={canReviewAll} currentUserId={currentUserId} onChanged={loadAll} />
          </TabsContent>
        </Tabs>
      ) : (
        <DeclarationList declarations={mine} canReviewAll={canReviewAll} currentUserId={currentUserId} onChanged={loadMine} />
      )}
    </div>
  );
}

function DeclarationList({ declarations, canReviewAll, currentUserId, onChanged }: { declarations: Declaration[] | null; canReviewAll: boolean; currentUserId: string; onChanged: () => void }) {
  if (declarations === null) {
    return <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>;
  }
  if (declarations.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
        <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">No declarations yet.</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {declarations.map((d) => (
        <DeclarationRow key={d.id} d={d} canReviewAll={canReviewAll} currentUserId={currentUserId} onChanged={onChanged} />
      ))}
    </div>
  );
}
