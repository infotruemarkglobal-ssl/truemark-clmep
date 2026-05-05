// TODO: STRIPE_NOT_INTEGRATED — stripePaymentId is a reserved DB column for a future Stripe
// integration. Paystack is the active provider. See docs/STRIPE.md for integration plan.
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { CreditCard, TrendingUp, Clock, XCircle } from "lucide-react";

export const metadata: Metadata = { title: "Payments — TrueMark Platform" };

const PAGE_SIZE = 20;

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
};

function currencySymbol(code: string | null | undefined): string {
  return CURRENCY_SYMBOLS[code ?? "NGN"] ?? code ?? "₦";
}

async function getPaymentStats() {
  const [completed, pending, failed, revenueByGroup] = await Promise.all([
    db.purchase.count({ where: { status: "COMPLETED" } }),
    db.purchase.count({ where: { status: "PENDING" } }),
    db.purchase.count({ where: { status: "FAILED" } }),
    db.purchase.groupBy({
      by: ["currency"],
      where: { status: "COMPLETED" },
      _sum: { amount: true },
    }),
  ]);
  return { completed, pending, failed, revenueByGroup };
}

async function getPayments(page: number) {
  const skip = (page - 1) * PAGE_SIZE;

  const [rawPayments, total] = await Promise.all([
    db.purchase.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        description: true,
        stripePaymentId: true,
        paystackReference: true,
        paidAt: true,
        refundedAt: true,
        createdAt: true,
        userId: true,
        organisationId: true,
        courseId: true,
        // Purchase has an organisation relation but no user relation in schema.
        // User names are resolved via a secondary lookup below.
        organisation: { select: { id: true, name: true } },
      },
    }),
    db.purchase.count(),
  ]);

  // Resolve individual payers — Purchase has no Prisma user relation, so collect
  // unique non-null userIds from this page and batch-fetch in one query.
  const userIds = [...new Set(rawPayments.flatMap((p) => (p.userId ? [p.userId] : [])))];
  const usersOnPage = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const userMap = new Map(usersOnPage.map((u) => [u.id, u]));

  const payments = rawPayments.map((p) => ({
    ...p,
    resolvedUser: p.userId ? (userMap.get(p.userId) ?? null) : null,
  }));

  return { payments, total };
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
  REFUNDED: "bg-slate-100 text-slate-600",
};

export default async function PlatformPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const [stats, { payments, total }] = await Promise.all([
    getPaymentStats(),
    getPayments(page),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const revenueEntries = stats.revenueByGroup.map((r) => ({
    currency: r.currency ?? "NGN",
    amount: r._sum.amount ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
        <p className="text-sm text-slate-500 mt-1">All payment transactions on the platform</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue card — adapts to single or multiple currencies */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50">
            <TrendingUp className="w-4 h-4 text-slate-700" />
          </div>
          <div>
            {revenueEntries.length === 0 && (
              <p className="text-xl font-bold tabular-nums text-slate-900">₦0</p>
            )}
            {revenueEntries.length === 1 && (
              <p className="text-xl font-bold tabular-nums text-slate-900">
                {currencySymbol(revenueEntries[0].currency)}
                {revenueEntries[0].amount.toLocaleString()}
              </p>
            )}
            {revenueEntries.length > 1 && (
              <div className="space-y-0.5">
                {revenueEntries.map((r) => (
                  <p key={r.currency} className="text-sm font-bold tabular-nums text-slate-900">
                    {currencySymbol(r.currency)}
                    {r.amount.toLocaleString()}{" "}
                    <span className="text-xs font-normal text-slate-400">{r.currency}</span>
                  </p>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500">Total Revenue</p>
          </div>
        </div>

        {[
          { label: "Completed", value: stats.completed, icon: CreditCard, color: "bg-blue-50" },
          { label: "Pending", value: stats.pending, icon: Clock, color: "bg-amber-50" },
          { label: "Failed", value: stats.failed, icon: XCircle, color: "bg-red-50" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${s.color}`}>
              <s.icon className="w-4 h-4 text-slate-700" />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left font-medium text-slate-500">Reference</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Description</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Payer</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Status</th>
                <th className="px-5 py-3 text-right font-medium text-slate-500">Amount</th>
                <th className="px-5 py-3 text-left font-medium text-slate-500">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    No payments yet.
                  </td>
                </tr>
              )}
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                    {p.paystackReference ?? p.stripePaymentId ?? p.id.slice(0, 12)}
                  </td>
                  <td className="px-5 py-3 text-slate-700 max-w-xs truncate">
                    {p.description ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    {p.organisation ? (
                      <div>
                        <p className="font-medium text-slate-800 whitespace-nowrap">
                          {p.organisation.name}
                        </p>
                        <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-700">
                          Organisation
                        </span>
                      </div>
                    ) : p.resolvedUser ? (
                      <div>
                        <p className="font-medium text-slate-800 whitespace-nowrap">
                          {p.resolvedUser.firstName} {p.resolvedUser.lastName}
                        </p>
                        <p className="text-xs text-slate-400 truncate max-w-45">
                          {p.resolvedUser.email}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">Unknown</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-600"}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-800 whitespace-nowrap">
                    {currencySymbol(p.currency)} {p.amount.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {(p.paidAt ?? p.createdAt).toLocaleDateString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {from}–{to} of {total}
            </p>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link
                  href={`?page=${page - 1}`}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition"
                >
                  Previous
                </Link>
              ) : (
                <span className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-50 border border-slate-100 rounded-md cursor-not-allowed">
                  Previous
                </span>
              )}
              <span className="text-xs text-slate-500 tabular-nums">
                {page} / {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={`?page=${page + 1}`}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition"
                >
                  Next
                </Link>
              ) : (
                <span className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-50 border border-slate-100 rounded-md cursor-not-allowed">
                  Next
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
