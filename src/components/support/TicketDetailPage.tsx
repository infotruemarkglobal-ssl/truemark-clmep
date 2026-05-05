"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ChevronLeft, Send, Loader2, Lock, UserCheck, AlertTriangle,
  Clock, RefreshCw, CheckCircle2, XCircle, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type MsgUser = { id: string; firstName: string; lastName: string; role: string };

type Message = {
  id: string;
  userId: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  user: MsgUser;
};

type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  user: { id: string; firstName: string; lastName: string; email: string; role: string };
  organisation: { id: string; name: string } | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  messages: Message[];
};

// ── Style maps ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  OPEN:        "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  RESOLVED:    "bg-emerald-100 text-emerald-700",
  CLOSED:      "bg-slate-100 text-slate-500",
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW:    "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-50 text-blue-700",
  HIGH:   "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  OPEN:        Clock,
  IN_PROGRESS: RefreshCw,
  RESOLVED:    CheckCircle2,
  CLOSED:      XCircle,
};

const AGENT_ROLES = ["SUPPORT_AGENT", "SUPER_ADMIN"];

// ── Main component ────────────────────────────────────────────────────────────

export default function TicketDetailPage({
  initialTicket,
  currentUserId,
  currentUserRole,
}: {
  initialTicket: Ticket;
  currentUserId: string;
  currentUserRole: string;
}) {
  const router = useRouter();
  const isAgent = AGENT_ROLES.includes(currentUserRole);

  const [ticket, setTicket] = useState(initialTicket);
  const [messages, setMessages] = useState<Message[]>(initialTicket.messages);
  const [text, setText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send message ────────────────────────────────────────────────────────────

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);

    // Optimistic insert
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      userId: currentUserId,
      content: text.trim(),
      isInternal,
      createdAt: new Date().toISOString(),
      user: {
        id: currentUserId,
        firstName: "You",
        lastName: "",
        role: currentUserRole,
      },
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");

    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: optimistic.content, isInternal }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to send message");
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setText(optimistic.content);
        return;
      }
      // Replace optimistic with server message
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? data : m)));
      // Auto-advance status shown in header
      if (isAgent && ticket.status === "OPEN" && !isInternal) {
        setTicket((t) => ({ ...t, status: "IN_PROGRESS" }));
      }
    } finally {
      setSending(false);
    }
  }

  // ── Status update ───────────────────────────────────────────────────────────

  async function handleStatusChange(status: string) {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Update failed"); return; }
      setTicket((t) => ({ ...t, status: data.status, resolvedAt: data.resolvedAt }));
      toast.success(`Status updated to ${status.replace("_", " ")}`);
    } finally {
      setUpdatingStatus(false);
    }
  }

  // ── Assign to me ────────────────────────────────────────────────────────────

  async function handleAssignSelf() {
    setAssigning(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: currentUserId }),
      });
      if (!res.ok) { toast.error("Assignment failed"); return; }
      toast.success("Assigned to you");
      router.refresh();
    } finally {
      setAssigning(false);
    }
  }

  const StatusIcon = STATUS_ICON[ticket.status] ?? Clock;

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Back */}
      <Link href="/support" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition">
        <ChevronLeft className="w-4 h-4" /> Support
      </Link>

      {/* Ticket header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-mono text-xs text-slate-400">{ticket.ticketNumber}</span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1", STATUS_STYLES[ticket.status])}>
                <StatusIcon className="w-2.5 h-2.5" />
                {ticket.status.replace("_", " ")}
              </span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", PRIORITY_STYLES[ticket.priority])}>
                {ticket.priority}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {ticket.category}
              </span>
            </div>
            <h1 className="text-lg font-bold text-slate-900">{ticket.subject}</h1>
            <p className="text-xs text-slate-500 mt-1">
              Opened by {ticket.user.firstName} {ticket.user.lastName}
              {ticket.organisation && ` · ${ticket.organisation.name}`}
              {" · "}{format(new Date(ticket.createdAt), "d MMM yyyy, HH:mm")}
            </p>
          </div>

          {/* Agent controls */}
          {isAgent && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {!ticket.assignedTo || ticket.assignedTo.id !== currentUserId ? (
                <Button size="sm" variant="outline" onClick={handleAssignSelf} disabled={assigning} className="gap-1.5">
                  {assigning ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                  Assign to me
                </Button>
              ) : (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <UserCheck className="w-3 h-3" /> Assigned to you
                </span>
              )}

              <select
                value={ticket.status}
                disabled={updatingStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
              >
                {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          )}

          {/* Reopen for non-agents when closed */}
          {!isAgent && ticket.status === "CLOSED" && (
            <Button size="sm" variant="outline" onClick={() => handleStatusChange("OPEN")} className="gap-1.5 shrink-0">
              <RotateCcw className="w-3 h-3" /> Reopen
            </Button>
          )}
        </div>
      </div>

      {/* Message thread */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
          {messages.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No messages yet.</div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.userId === currentUserId;
              const isAgentMsg = AGENT_ROLES.includes(msg.user.role);
              return (
                <div
                  key={msg.id}
                  className={cn("p-4 flex gap-3", {
                    "bg-slate-50": msg.isInternal,
                    "flex-row-reverse": isOwn,
                  })}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                    isAgentMsg ? "bg-primary/10 text-primary" : "bg-slate-200 text-slate-600",
                  )}>
                    {msg.user.firstName[0]}{msg.user.lastName?.[0] ?? ""}
                  </div>

                  {/* Bubble */}
                  <div className={cn("flex-1 space-y-1", isOwn && "items-end flex flex-col")}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-700">
                        {isOwn ? "You" : `${msg.user.firstName} ${msg.user.lastName}`}
                        {isAgentMsg && !isOwn && (
                          <span className="ml-1 text-primary font-normal">· Support</span>
                        )}
                      </span>
                      {msg.isInternal && (
                        <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                          <Lock className="w-2.5 h-2.5" /> Internal
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400">
                        {format(new Date(msg.createdAt), "d MMM, HH:mm")}
                      </span>
                    </div>
                    <div className={cn(
                      "text-sm rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap max-w-lg",
                      isOwn
                        ? "bg-primary text-white rounded-tr-sm"
                        : msg.isInternal
                        ? "bg-amber-50 text-amber-900 border border-amber-200 rounded-tl-sm"
                        : "bg-slate-100 text-slate-800 rounded-tl-sm",
                    )}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area — hidden for CLOSED tickets unless agent */}
        {(ticket.status !== "CLOSED" || isAgent) && (
          <div className="border-t border-slate-100 p-4">
            {isAgent && (
              <div className="flex items-center gap-2 mb-3">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="w-3.5 h-3.5 rounded"
                  />
                  <span className="text-xs text-slate-600 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Internal note (not visible to customer)
                  </span>
                </label>
              </div>
            )}

            <form onSubmit={handleSend} className="flex gap-2">
              <textarea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(e as unknown as React.FormEvent);
                }}
                placeholder={isInternal ? "Add an internal note…" : "Type a message…"}
                className={cn(
                  "flex-1 text-sm border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring/50",
                  isInternal ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white",
                )}
              />
              <Button type="submit" disabled={sending || !text.trim()} size="sm" className="self-end gap-1.5 px-4">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send
              </Button>
            </form>
            <p className="text-[11px] text-slate-400 mt-1">⌘ Enter to send</p>
          </div>
        )}

        {ticket.status === "CLOSED" && !isAgent && (
          <div className="border-t border-slate-100 px-5 py-4 flex items-center gap-2 text-sm text-slate-500">
            <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0" />
            This ticket is closed. Reopen it if you need further assistance.
          </div>
        )}
      </div>
    </div>
  );
}
