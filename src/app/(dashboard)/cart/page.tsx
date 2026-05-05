"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ShoppingCart, Trash2, Loader2, ChevronLeft, Minus, Plus, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateVAT } from "@/lib/tax";

type CartCourse = {
  id: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  currency: string;
  price: number;
};

type CartItem = {
  id: string;
  courseId: string;
  seats: number;
  unitPrice: string;
  course: CartCourse;
};

type Cart = { items: CartItem[] };

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // itemId currently updating
  const [clearing, setClearing] = useState(false);

  const fetchCart = useCallback(async () => {
    try {
      const res = await fetch("/api/cart");
      const data = await res.json();
      setCart(data);
    } catch {
      toast.error("Failed to load cart");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCart(); }, [fetchCart]);

  async function updateSeats(itemId: string, seats: number) {
    setBusy(itemId);
    try {
      const res = await fetch(`/api/cart/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats }),
      });
      if (!res.ok) throw new Error();
      setCart((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((i) => (i.id === itemId ? { ...i, seats } : i)),
        };
      });
    } catch {
      toast.error("Failed to update seats");
    } finally {
      setBusy(null);
    }
  }

  async function removeItem(itemId: string) {
    setBusy(itemId);
    try {
      const res = await fetch(`/api/cart/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCart((prev) => {
        if (!prev) return prev;
        return { ...prev, items: prev.items.filter((i) => i.id !== itemId) };
      });
      toast.success("Item removed");
    } catch {
      toast.error("Failed to remove item");
    } finally {
      setBusy(null);
    }
  }

  async function clearCart() {
    setClearing(true);
    try {
      await fetch("/api/cart", { method: "DELETE" });
      setCart({ items: [] });
      toast.success("Cart cleared");
    } catch {
      toast.error("Failed to clear cart");
    } finally {
      setClearing(false);
    }
  }

  async function checkout(item: CartItem) {
    setBusy(item.id);
    try {
      const res = await fetch("/api/payments/paystack/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: item.courseId, seats: item.seats }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Checkout failed");
        return;
      }
      window.location.href = data.authorizationUrl;
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBusy(null);
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
        <Link
          href="/courses"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition"
        >
          <ChevronLeft className="w-4 h-4" /> Browse courses
        </Link>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center gap-4 text-center">
          <ShoppingCart className="w-12 h-12 text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-700">Your cart is empty</h2>
          <p className="text-sm text-slate-500">Add a course to get started.</p>
          <Button onClick={() => router.push("/courses")} className="mt-2">
            Browse Courses
          </Button>
        </div>
      </div>
    );
  }

  // Use the first item's course currency for display (all should match)
  const currency = items[0]?.course.currency ?? "NGN";
  const country = "Nigeria"; // TODO: pull from session/profile when available

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.seats,
    0,
  );
  const vat = calculateVAT(country, subtotal);
  const total = subtotal + vat.amount;

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition"
      >
        <ChevronLeft className="w-4 h-4" /> Browse courses
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your Cart</h1>
          <p className="text-sm text-slate-500 mt-1">
            {items.length} {items.length === 1 ? "course" : "courses"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={clearCart}
          disabled={clearing}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 gap-2"
        >
          {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          Clear all
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const lineTotal = Number(item.unitPrice) * item.seats;
          const isUpdating = busy === item.id;
          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex gap-4"
            >
              {/* Thumbnail */}
              <div className="w-20 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                {item.course.thumbnailUrl ? (
                  <img
                    src={item.course.thumbnailUrl}
                    alt={item.course.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-6 h-6 text-slate-300" />
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <Link
                  href={`/courses/${item.course.slug}`}
                  className="text-sm font-semibold text-slate-900 hover:text-primary transition truncate block"
                >
                  {item.course.title}
                </Link>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currency} {Number(item.unitPrice).toFixed(2)} / seat
                </p>

                {/* Seats control */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-slate-500">Seats:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isUpdating || item.seats <= 1}
                      onClick={() => updateSeats(item.id, item.seats - 1)}
                      className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">
                      {isUpdating ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : item.seats}
                    </span>
                    <button
                      type="button"
                      disabled={isUpdating || item.seats >= 500}
                      onClick={() => updateSeats(item.id, item.seats + 1)}
                      className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Line total + actions */}
              <div className="flex flex-col items-end justify-between shrink-0">
                <span className="text-sm font-bold text-slate-900">
                  {currency} {lineTotal.toFixed(2)}
                </span>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={isUpdating}
                    className="text-xs text-slate-400 hover:text-red-500 transition disabled:opacity-40"
                    aria-label="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <Button
                    size="sm"
                    onClick={() => checkout(item)}
                    disabled={isUpdating}
                    className="text-xs h-7 px-3"
                  >
                    {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Pay Now"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Order summary */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
        <h3 className="font-semibold text-slate-900">Order Summary</h3>
        <div className="flex justify-between text-sm text-slate-600">
          <span>Subtotal</span>
          <span>{currency} {subtotal.toFixed(2)}</span>
        </div>
        {vat.rate > 0 && (
          <div className="flex justify-between text-sm text-slate-600">
            <span>{vat.label}</span>
            <span>{currency} {vat.amount.toFixed(2)}</span>
          </div>
        )}
        <div className="border-t border-slate-200 pt-3 flex justify-between font-bold text-slate-900">
          <span>Total</span>
          <span>{currency} {total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
