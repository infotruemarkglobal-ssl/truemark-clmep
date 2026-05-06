"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Search, Shield, ChevronRight, ExternalLink } from "lucide-react";

type Entry = {
  certificateNumber: string;
  issuedAt: string;
  expiresAt: string | null;
  holderName: string;
  scheme: { id: string; name: string; code: string; description: string | null };
};

type Scheme = { id: string; name: string; code: string };

type Props = { entries: Entry[]; schemes: Scheme[] };

export default function CertificateRegistry({ entries, schemes }: Props) {
  const [query, setQuery] = useState("");
  const [schemeFilter, setSchemeFilter] = useState("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (schemeFilter !== "all" && e.scheme.id !== schemeFilter) return false;
      if (!q) return true;
      return (
        e.holderName.toLowerCase().includes(q) ||
        e.certificateNumber.toLowerCase().includes(q)
      );
    });
  }, [entries, query, schemeFilter]);

  // Group by scheme
  const grouped = useMemo(() => {
    const map = new Map<string, { scheme: Entry["scheme"]; items: Entry[] }>();
    for (const e of filtered) {
      if (!map.has(e.scheme.id)) {
        map.set(e.scheme.id, { scheme: e.scheme, items: [] });
      }
      map.get(e.scheme.id)!.items.push(e);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.scheme.name.localeCompare(b.scheme.name),
    );
  }, [filtered]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-10 sm:px-6">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-7 h-7 text-blue-700 flex-shrink-0" />
            <h1 className="text-2xl font-bold text-slate-900">
              TrueMark Global — Certificate Register
            </h1>
          </div>
          <p className="text-slate-500 text-sm max-w-2xl">
            Publicly verified certifications issued under ISO/IEC 17024:2012. This register lists
            all currently active certificates. Employers and third parties may use it to confirm
            the validity of a holder&apos;s credentials.
          </p>

          {/* Search + filter */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                placeholder="Search by name or certificate number…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={schemeFilter}
              onChange={(e) => setSchemeFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All schemes</option>
              {schemes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            {filtered.length.toLocaleString()} active{" "}
            {filtered.length === 1 ? "certificate" : "certificates"}
            {query || schemeFilter !== "all" ? " matching your filters" : " in the register"}
          </p>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 space-y-8">
        {grouped.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No certificates match your search.</p>
            {(query || schemeFilter !== "all") && (
              <button
                onClick={() => { setQuery(""); setSchemeFilter("all"); }}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          grouped.map(({ scheme, items }) => (
            <section key={scheme.id}>
              <div className="mb-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-base font-semibold text-slate-800">{scheme.name}</h2>
                  <span className="text-xs font-mono text-slate-400">{scheme.code}</span>
                  <span className="ml-auto text-xs text-slate-400">
                    {items.length} {items.length === 1 ? "holder" : "holders"}
                  </span>
                </div>
                {scheme.description && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{scheme.description}</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5 font-medium">Name</th>
                      <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Certificate No.</th>
                      <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Valid From</th>
                      <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Valid Until</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((entry) => (
                      <tr
                        key={entry.certificateNumber}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {entry.holderName}
                          <p className="sm:hidden text-xs text-slate-400 font-mono mt-0.5">
                            {entry.certificateNumber}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600 hidden sm:table-cell">
                          {entry.certificateNumber}
                        </td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                          {format(new Date(entry.issuedAt), "d MMM yyyy")}
                        </td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                          {entry.expiresAt
                            ? format(new Date(entry.expiresAt), "d MMM yyyy")
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/verify/${entry.certificateNumber}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            Verify
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}

        {/* Footer */}
        <footer className="pt-4 border-t border-slate-200 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Shield className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Truemark Global Certification Registry · ISO/IEC 17024:2012 Accredited ·{" "}
                <a
                  href="https://www.iso.org/standard/52993.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-600 transition-colors inline-flex items-center gap-0.5"
                >
                  Cl.6.7 Public Register
                  <ExternalLink className="w-3 h-3" />
                </a>
              </span>
            </div>
            <Link
              href="/about"
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              About TrueMark Global →
            </Link>
          </div>
          <p className="text-xs text-slate-400">
            This register displays the name and certificate details of active certificate holders
            who have been certified by Truemark Global. Only the minimum information necessary to
            confirm a person&apos;s certification status is published, in accordance with applicable
            data protection legislation. For enquiries:{" "}
            <a
              href="mailto:certificates@truemark.global"
              className="text-blue-600 hover:underline"
            >
              certificates@truemark.global
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
