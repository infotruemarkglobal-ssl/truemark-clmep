import { db } from "@/lib/db";
import { startOfDay } from "date-fns";
import Link from "next/link";
import { MessageSquare, Clock, CheckCircle2, TrendingUp, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PRIORITY_COLOR: Record<string, string> = {
  LOW:    "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH:   "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

const STATUS_COLOR: Record<string, string> = {
  OPEN:        "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  RESOLVED:    "bg-emerald-100 text-emerald-700",
  CLOSED:      "bg-slate-100 text-slate-500",
};

export default async function SupportAgentDashboard() {
  const today = startOfDay(new Date());

  const [open, inProgress, resolvedToday, recentTickets] = await Promise.all([
    db.supportTicket.count({ where: { status: "OPEN" } }),
    db.supportTicket.count({ where: { status: "IN_PROGRESS" } }),
    db.supportTicket.count({
      where: { status: "RESOLVED", resolvedAt: { gte: today } },
    }),
    db.supportTicket.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        priority: true,
        status: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const serialised = recentTickets.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    priority: t.priority,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    userName: `${t.user.firstName} ${t.user.lastName}`,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Support Queue Overview</h1>
        <p className="text-slate-500 text-sm mt-1">Real-time view of all support tickets.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Open
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{open}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Clock className="w-4 h-4" /> In Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Resolved Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{resolvedToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Avg Response
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-400">N/A</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent tickets */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900 text-sm">Recent Tickets</h2>
          <div className="flex items-center gap-3">
            <Link
              href="/support?status=OPEN"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
            >
              Open tickets
            </Link>
            <Link
              href="/support"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
            >
              View all →
            </Link>
          </div>
        </div>

        {serialised.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
            <MessageSquare className="w-8 h-8 opacity-40" />
            <p className="text-sm">No tickets yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="px-5 py-3 font-medium">#</th>
                  <th className="px-5 py-3 font-medium">Subject</th>
                  <th className="px-5 py-3 font-medium hidden sm:table-cell">User</th>
                  <th className="px-5 py-3 font-medium">Priority</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium hidden md:table-cell">Created</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {serialised.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3 text-xs text-slate-400 font-mono whitespace-nowrap">
                      {t.ticketNumber}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900 max-w-xs truncate">
                      {t.subject}
                    </td>
                    <td className="px-5 py-3 text-slate-500 hidden sm:table-cell whitespace-nowrap">
                      {t.userName}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          PRIORITY_COLOR[t.priority] ?? "bg-slate-100 text-slate-600",
                        )}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_COLOR[t.status] ?? "bg-slate-100 text-slate-500",
                        )}
                      >
                        {t.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs hidden md:table-cell whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/support/${t.id}`}
                        className="inline-flex items-center gap-0.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
                      >
                        View <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
