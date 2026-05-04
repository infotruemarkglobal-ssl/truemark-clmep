// TODO: STRIPE_NOT_INTEGRATED — stripePaymentId is a reserved DB column for a future Stripe
// integration. Paystack is the active provider. See docs/STRIPE.md for integration plan.
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { CreditCard, TrendingUp, Clock, XCircle } from "lucide-react";

export const metadata: Metadata = { title: "Payments — TrueMark Platform" };

async function getPaymentStats() {
  const [completed, pending, failed, revenue] = await Promise.all([
    db.purchase.count({ where: { status: "COMPLETED" } }),
    db.purchase.count({ where: { status: "PENDING" } }),
    db.purchase.count({ where: { status: "FAILED" } }),
    db.purchase.aggregate({ where: { status: "COMPLETED" }, _sum: { amount: true } }),
  ]);
  return { completed, pending, failed, revenue: revenue._sum.amount ?? 0 };
}

async function getPayments() {
  return db.purchase.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
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
    },
  });
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
  REFUNDED: "bg-slate-100 text-slate-600",
};

export default async function PlatformPaymentsPage() {
  const [stats, payments] = await Promise.all([getPaymentStats(), getPayments()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
        <p className="text-sm text-slate-500 mt-1">All payment transactions on the platform</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: `₦${stats.revenue.toLocaleString()}`, icon: TrendingUp, color: "bg-emerald-50" },
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
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">No payments yet.</td>
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
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {p.organisationId ? "Organisation" : "Individual"}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-800 whitespace-nowrap">
                    {p.currency} {p.amount.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {(p.paidAt ?? p.createdAt).toLocaleDateString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
