"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export default function PaymentToast({ status }: { status: string }) {
  useEffect(() => {
    if (status === "success") {
      toast.success("Payment confirmed! You are now enrolled.");
    } else if (status === "failed") {
      toast.error("Payment was not completed. Please try again.");
    } else if (status === "error") {
      toast.error("Something went wrong with your payment. Contact support if charged.");
    } else if (status === "missing") {
      toast.error("Payment reference missing. Please try again.");
    }
  }, [status]);

  return null;
}
