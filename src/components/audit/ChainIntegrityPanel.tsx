"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ShieldCheck, ShieldAlert, ExternalLink, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChainResult = {
  totalRows: number;
  hashMismatches: string[];
  chainBreaks: string[];
  legacyRowCount: number;
  intact: boolean;
};

type AnchorResult = { anchorId: string; valid: boolean; reason?: string; genTime?: string } | null;

export default function ChainIntegrityPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chain, setChain] = useState<ChainResult | null>(null);
  const [anchor, setAnchor] = useState<AnchorResult>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  async function runCheck() {
    setLoading(true);
    try {
      const res = await fetch("/api/audit-anchors/verify", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setChain(body.chain);
      setAnchor(body.anchor);
      setCheckedAt(new Date().toISOString());
    } catch {
      setChain(null);
      setAnchor(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!chain && !loading) runCheck(); }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition text-sm font-medium text-slate-700"
      >
        <span className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          Chain integrity &amp; external notarisation
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="p-4 border-t border-slate-100 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
            </div>
          )}

          {!loading && chain && (
            <>
              <div className={cn("rounded-xl border p-4 flex items-start gap-3", chain.intact ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50")}>
                {chain.intact ? <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
                <div>
                  <p className={cn("text-sm font-semibold", chain.intact ? "text-emerald-700" : "text-red-700")}>
                    {chain.intact ? "Chain intact — no tampering detected" : "Chain integrity issue detected"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {chain.totalRows.toLocaleString()} rows checked ({chain.legacyRowCount.toLocaleString()} predate chaining) · {chain.hashMismatches.length} content mismatch(es) · {chain.chainBreaks.length} chain break(s)
                  </p>
                  {!chain.intact && (
                    <p className="text-xs text-red-600 mt-1">
                      {chain.hashMismatches.length > 0 && `Row(s) with edited content: ${chain.hashMismatches.slice(0, 5).join(", ")}. `}
                      {chain.chainBreaks.length > 0 && `Row(s) indicating a deleted predecessor: ${chain.chainBreaks.slice(0, 5).join(", ")}.`}
                    </p>
                  )}
                </div>
              </div>

              {anchor && (
                <div className={cn("rounded-xl border p-4 flex items-start gap-3", anchor.valid ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
                  {anchor.valid ? <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
                  <div>
                    <p className={cn("text-sm font-semibold", anchor.valid ? "text-emerald-700" : "text-amber-700")}>
                      {anchor.valid ? "Latest external anchor verified" : "Latest external anchor could not be verified"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {anchor.valid && anchor.genTime
                        ? `A real RFC 3161 timestamp authority attested this chain state existed at ${format(new Date(anchor.genTime), "d MMM yyyy, HH:mm:ss")} UTC.`
                        : anchor.reason}
                    </p>
                  </div>
                </div>
              )}
              {!anchor && (
                <p className="text-xs text-slate-400">No external anchor has been created yet — the daily notarisation cron creates one automatically.</p>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">{checkedAt && `Checked ${format(new Date(checkedAt), "d MMM yyyy, HH:mm:ss")}`}</p>
                <Button size="sm" variant="outline" onClick={runCheck} disabled={loading} className="gap-1.5">
                  Re-check
                </Button>
              </div>
            </>
          )}

          <a
            href="https://www.rfc-editor.org/rfc/rfc3161"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> About RFC 3161 timestamping
          </a>
        </div>
      )}
    </div>
  );
}
