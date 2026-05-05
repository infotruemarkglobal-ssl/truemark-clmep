"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  MessageSquare, Plus, Search, Filter, ChevronRight, Loader2,
  Clock, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  user: { firstName: string; lastName: string; email: string };
  organisation: { name: string } | null;
  assignedTo: { firstName: string; lastName: string } | null;
  _count: { messages: number };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  OPEN:        "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  RESOLVED:    "bg-emerald-100 text-emerald-700",
  CLOSED:      "bg-slate-100 text-slate-500",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  OPEN:        Clock,
  IN_PROGRESS: RefreshCw,
  RESOLVED:    CheckCircle2,
  CLOSED:      XCircle,
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW:    "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-50 text-blue-600",
  HIGH:   "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

const CATEGORIES = ["BILLING", "TECHNICAL", "ACCOUNT", "EXAM", "CERTIFICATION", "GENERAL"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES   = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

// ── New ticket form ───────────────────────────────────────────────────────────

function NewTicketForm({ onCreated }: { onCreated: (ticket: { id: string }) => void }) {
  const [form, setForm] = useState({
    subject: "", category: "GENERAL", priority: "MEDIUM", message: "",
  });
  const [saving, setSaving] = useState(false);

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to create ticket");
        return;
      }
      toast.success(`Ticket ${data.ticketNumber} created`);
      onCreated(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="subject">Subject <span className="text-destructive" aria-hidden>*</span></Label>
        <Input id="subject" placeholder="Brief description of your issue" value={form.subject} onChange={(e) => set("subject", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <select id="category" value={form.category} onChange={(e) => set("category", e.target.value)}
            className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-ring/50">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority</Label>
          <select id="priority" value={form.priority} onChange={(e) => set("priority", e.target.value)}
            className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-ring/50">
            {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="message">Describe your issue <span className="text-destructive" aria-hidden>*</span></Label>
        <textarea id="message" rows={5} placeholder="Please provide as much detail as possible…"
          value={form.message} onChange={(e) => set("message", e.target.value)}
          className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none" />
      </div>

      <Button type="submit" disabled={saving} className="gap-2 w-full">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Plus className="w-4 h-4" /> Submit Ticket</>}
      </Button>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TicketListPage({
  initialTickets,
  userRole,
}: {
  initialTickets: Ticket[];
  userRole: string;
}) {
  const router = useRouter();
  const isAgent = ["SUPPORT_AGENT", "SUPER_ADMIN"].includes(userRole);
  const canCreate = !isAgent;

  const [tickets, setTickets] = useState(initialTickets);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMine, setFilterMine] = useState(false);

  const filtered = useMemo(() => {
    let list = tickets;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        t.subject.toLowerCase().includes(q) ||
        t.ticketNumber.toLowerCase().includes(q) ||
        t.user.email.toLowerCase().includes(q)
      );
    }
    if (filterStatus)   list = list.filter((t) => t.status === filterStatus);
    if (filterPriority) list = list.filter((t) => t.priority === filterPriority);
    if (filterCategory) list = list.filter((t) => t.category === filterCategory);
    return list;
  }, [tickets, search, filterStatus, filterPriority, filterCategory]);

  function handleCreated(ticket: { id: string }) {
    setShowNew(false);
    router.push(`/support/${ticket.id}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isAgent ? "Support Queue" : "My Support Tickets"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAgent
              ? `${filtered.length} ticket${filtered.length !== 1 ? "s" : ""} total`
              : "Track your support requests and get help from the team."}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowNew((v) => !v)} className="gap-2">
            <Plus className="w-4 h-4" />
            {showNew ? "Cancel" : "New Ticket"}
          </Button>
        )}
      </div>

      {/* New ticket form */}
      {showNew && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-slate-400" /> New Support Ticket
          </h2>
          <NewTicketForm onCreated={handleCreated} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search tickets…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isAgent && (
          <>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-ring/50">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>

            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-ring/50">
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-ring/50">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <button
              type="button"
              onClick={() => setFilterMine((v) => !v)}
              className={cn(
                "text-sm px-3 py-2 rounded-lg border transition font-medium",
                filterMine ? "bg-primary text-white border-primary" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300",
              )}
            >
              Assigned to me
            </button>
          </>
        )}
      </div>

      {/* Ticket list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="font-medium text-slate-500">
              {tickets.length === 0 ? "No tickets yet" : "No tickets match your search"}
            </p>
            {tickets.length === 0 && canCreate && (
              <p className="text-sm text-slate-400 mt-1">Click "New Ticket" to get help from the support team.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((ticket) => {
              const StatusIcon = STATUS_ICON[ticket.status] ?? Clock;
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => router.push(`/support/${ticket.id}`)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition text-left"
                >
                  <StatusIcon className={cn("w-4 h-4 shrink-0", {
                    "text-blue-500": ticket.status === "OPEN",
                    "text-amber-500": ticket.status === "IN_PROGRESS",
                    "text-emerald-500": ticket.status === "RESOLVED",
                    "text-slate-400": ticket.status === "CLOSED",
                  })} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-slate-400 shrink-0">{ticket.ticketNumber}</span>
                      <span className="font-semibold text-sm text-slate-900 truncate">{ticket.subject}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {isAgent && (
                        <span className="text-xs text-slate-500">
                          {ticket.user.firstName} {ticket.user.lastName}
                          {ticket.organisation && ` · ${ticket.organisation.name}`}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{ticket.category}</span>
                      <span className="text-xs text-slate-400">{ticket._count.messages} msg</span>
                      <span className="text-xs text-slate-400">{format(new Date(ticket.updatedAt), "d MMM, HH:mm")}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", PRIORITY_STYLES[ticket.priority])}>
                      {ticket.priority}
                    </span>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", STATUS_STYLES[ticket.status])}>
                      {ticket.status.replace("_", " ")}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
