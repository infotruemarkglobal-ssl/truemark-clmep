"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Bell, CheckCheck, Award, BookOpen, AlertCircle, Info, FileText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  readAt: string | null;
  sentAt: string;
};

// Maps support both UPPER_CASE (from API/DB) and lower_case (legacy) keys
const TYPE_ICONS: Record<string, React.ElementType> = {
  CERTIFICATE_ISSUED: Award,     certificate_issued: Award,
  EXAM_RESULT: FileText,         exam_result: FileText,
  EXAM_SUBMITTED: FileText,
  ENROLMENT: BookOpen,           enrolment: BookOpen,
  ENROLMENT_CONFIRMATION: BookOpen,
  PAYMENT_CONFIRMATION: BookOpen,
  EXAM_ELIGIBLE: Award,
  PROGRESS: BookOpen,
  APPEAL_UPDATE: AlertCircle,    appeal_update: AlertCircle,
  CPD_REMINDER: Bell,            cpd_reminder: Bell,
  RENEWAL_DUE: AlertCircle,      renewal_due: AlertCircle,
  RENEWAL_REMINDER: AlertCircle,
  ORG_MEMBER_ADDED: Users,
  VERIFICATION: Award,
  ACCOUNT: Users,                account: Users,
  SYSTEM: Info,                  system: Info,
  SYSTEM_ALERT: Info,
};

const TYPE_COLORS: Record<string, string> = {
  CERTIFICATE_ISSUED: "bg-emerald-100 text-emerald-700",   certificate_issued: "bg-emerald-100 text-emerald-700",
  EXAM_RESULT: "bg-blue-100 text-blue-700",                exam_result: "bg-blue-100 text-blue-700",
  EXAM_SUBMITTED: "bg-blue-100 text-blue-700",
  ENROLMENT: "bg-primary/10 text-primary",                 enrolment: "bg-primary/10 text-primary",
  ENROLMENT_CONFIRMATION: "bg-primary/10 text-primary",
  PAYMENT_CONFIRMATION: "bg-emerald-100 text-emerald-700",
  EXAM_ELIGIBLE: "bg-purple-100 text-purple-700",
  PROGRESS: "bg-primary/10 text-primary",
  APPEAL_UPDATE: "bg-amber-100 text-amber-700",            appeal_update: "bg-amber-100 text-amber-700",
  CPD_REMINDER: "bg-purple-100 text-purple-700",           cpd_reminder: "bg-purple-100 text-purple-700",
  RENEWAL_DUE: "bg-orange-100 text-orange-700",            renewal_due: "bg-orange-100 text-orange-700",
  RENEWAL_REMINDER: "bg-orange-100 text-orange-700",
  ORG_MEMBER_ADDED: "bg-indigo-100 text-indigo-700",
  VERIFICATION: "bg-emerald-100 text-emerald-700",
  ACCOUNT: "bg-slate-100 text-slate-600",                  account: "bg-slate-100 text-slate-600",
  SYSTEM: "bg-slate-100 text-slate-600",                   system: "bg-slate-100 text-slate-600",
  SYSTEM_ALERT: "bg-red-100 text-red-600",
};

export default function NotificationsPage({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const [marking, setMarking] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markAllRead() {
    if (unreadCount === 0) return;
    setMarking(true);
    try {
      await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
      router.refresh();
    } catch {
      toast.error("Failed to mark notifications as read");
    } finally {
      setMarking(false);
    }
  }

  async function markRead(id: string) {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      router.refresh();
    } catch {
      // silent
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-slate-500 text-sm mt-1">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" className="gap-2" onClick={markAllRead} disabled={marking}>
            <CheckCheck className="w-4 h-4" />
            {marking ? "Marking…" : "Mark all read"}
          </Button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] ?? Info;
              const colorClass = TYPE_COLORS[n.type] ?? "bg-slate-100 text-slate-600";
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-4 px-4 py-4 transition hover:bg-slate-50 cursor-pointer",
                    !n.read && "bg-primary/5"
                  )}
                  onClick={() => {
                    if (!n.read) markRead(n.id);
                    if (n.link) router.push(n.link);
                  }}
                >
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", colorClass)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-sm font-medium", n.read ? "text-slate-700" : "text-slate-900")}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                        <span className="text-xs text-slate-400 whitespace-nowrap">
                          {format(new Date(n.sentAt), "d MMM")}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Types legend */}
      {notifications.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Array.from(new Set(notifications.map((n) => n.type))).map((type) => {
            const Icon = TYPE_ICONS[type] ?? Info;
            const colorClass = TYPE_COLORS[type] ?? "bg-slate-100 text-slate-600";
            return (
              <Badge key={type} className={cn("gap-1 border-0 text-xs", colorClass)}>
                <Icon className="w-3 h-3" />
                {type.replace(/_/g, " ")}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
