import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PaymentCallback from "@/components/payments/PaymentCallback";

export const metadata: Metadata = { title: "Payment Verification" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; courseId?: string }>;
}) {
  const { reference, courseId } = await searchParams;

  // No reference means the user navigated here directly — nothing to verify.
  if (!reference) redirect("/courses");

  return <PaymentCallback reference={reference} courseId={courseId} />;
}
