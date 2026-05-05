"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronLeft, CreditCard, Loader2, ShoppingCart, CheckCircle2, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateVAT } from "@/lib/tax";

type CartCourse = { id: string; title: string; currency: string; price: number };
type CartItem = { id: string; courseId: string; seats: number; unitPrice: string; course: CartCourse };
type Cart = { items: CartItem[] };

type PaymentMethod = "stripe" | "paystack";

function PaystackIcon() {
  return (
    <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
      <rect width="32" height="32" rx="6" fill="#011B33" />
      <path d="M8 14h16M8 18h16" stroke="#00C3F7" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function StripeIcon() {
  return (
    <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
      <rect width="32" height="32" rx="6" fill="#635BFF" />
      <path d="M14.5 12.5c0-1.1.9-1.5 2.3-1.5 2 0 4.6.6 6.2 1.7V8.3C21.3 7.5 19.1 7 16.8 7c-4.4 0-7.3 2.3-7.3 6.1 0 6 8.3 5 8.3 7.6 0 1.3-1.1 1.7-2.6 1.7-2.2 0-5.1-.9-7-2.2v4.4c2 .9 4 1.4 7 1.4 4.5 0 7.6-2.2 7.6-6.1-.1-6.4-8.3-5.3-8.3-7.4z" fill="white" />
    </svg>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState<string>(""); // loaded from profile/org
  const [method, setMethod] = useState<PaymentMethod>("stripe");
  const [paying, setPaying] = useState(false);

  const isNigerian = country.toUpperCase() === "NIGERIA";

  const fetchData = useCallback(async () => {
    try {
      const [cartRes, profileRes] = await Promise.all([
        fetch("/api/cart"),
        fetch("/api/profile/country"),
      ]);
      const cartData = await cartRes.json();
      setCart(cartData);

      if (profileRes.ok) {
        const { country: c } = await profileRes.json() as { country: string };
        setCountry(c ?? "");
        // Nigerian users default to Paystack; international default to Stripe
        setMethod(c?.toUpperCase() === "NIGERIA" ? "paystack" : "stripe");
      }
    } catch {
      toast.error("Failed to load checkout");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handlePay() {
    setPaying(true);
    try {
      const endpoint = method === "stripe"
        ? "/api/payments/stripe/initiate"
        : "/api/payments/paystack/cart";

      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Payment initiation failed");
        return;
      }

      // Stripe returns { url }, Paystack returns { authorizationUrl }
      const redirectUrl: string = data.url ?? data.authorizationUrl;
      if (!redirectUrl) {
        toast.error("No redirect URL from payment provider");
        return;
      }

      window.location.href = redirectUrl;
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const items = cart?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="max-w-2xl space-y-6">
        <Link href="/cart" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition">
          <ChevronLeft className="w-4 h-4" /> Back to cart
        </Link>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center gap-4 text-center">
          <ShoppingCart className="w-12 h-12 text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-700">Your cart is empty</h2>
          <Button onClick={() => router.push("/courses")}>Browse Courses</Button>
        </div>
      </div>
    );
  }

  const currency = items[0]!.course.currency;
  const subtotal = items.reduce((s, i) => s + Number(i.unitPrice) * i.seats, 0);
  const vat = calculateVAT(country || "Nigeria", subtotal);
  const total = subtotal + vat.amount;

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/cart" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition">
        <ChevronLeft className="w-4 h-4" /> Back to cart
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Checkout</h1>
        <p className="text-sm text-slate-500 mt-1">Review your order and choose a payment method.</p>
      </div>

      {/* Order summary */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-slate-900">Order Summary</h2>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{item.course.title}</p>
                {item.seats > 1 && (
                  <p className="text-xs text-slate-500">{item.seats} seats × {currency} {Number(item.unitPrice).toFixed(2)}</p>
                )}
              </div>
              <span className="text-sm font-semibold text-slate-900 shrink-0">
                {currency} {(Number(item.unitPrice) * item.seats).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-3 space-y-1.5">
          <div className="flex justify-between text-sm text-slate-600">
            <span>Subtotal</span><span>{currency} {subtotal.toFixed(2)}</span>
          </div>
          {vat.rate > 0 && (
            <div className="flex justify-between text-sm text-slate-600">
              <span>{vat.label}</span><span>{currency} {vat.amount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-100">
            <span>Total</span><span>{currency} {total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Payment method */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-slate-900">Payment Method</h2>
        <div className="space-y-2">
          {/* Stripe — always shown */}
          <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${method === "stripe" ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"}`}>
            <input
              type="radio"
              name="method"
              value="stripe"
              checked={method === "stripe"}
              onChange={() => setMethod("stripe")}
              className="sr-only"
            />
            <StripeIcon />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">Pay with Stripe</p>
              <p className="text-xs text-slate-500">Cards, Apple Pay, Google Pay — international</p>
            </div>
            {method === "stripe" && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
          </label>

          {/* Paystack — Nigerian users only */}
          {isNigerian && (
            <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${method === "paystack" ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"}`}>
              <input
                type="radio"
                name="method"
                value="paystack"
                checked={method === "paystack"}
                onChange={() => setMethod("paystack")}
                className="sr-only"
              />
              <PaystackIcon />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">Pay with Paystack</p>
                <p className="text-xs text-slate-500">Cards, bank transfer, USSD — Nigeria</p>
              </div>
              {method === "paystack" && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
            </label>
          )}
        </div>
      </div>

      {/* Place order */}
      <Button
        onClick={handlePay}
        disabled={paying}
        className="w-full gap-2 h-12 text-base"
      >
        {paying
          ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing…</>
          : <><CreditCard className="w-5 h-5" /> Place Order — {currency} {total.toFixed(2)}</>
        }
      </Button>

      <p className="text-center text-xs text-slate-400">
        By placing your order you agree to our terms of service. Payments are processed securely.
      </p>
    </div>
  );
}
