"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { redeemSsoTicket } from "@/app/(auth)/login/sso/complete/actions";

export default function CompleteSsoLogin() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const ticket = searchParams.get("ticket");
  const [error, setError] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!ticket) {
      router.replace("/login/sso?error=expired_flow");
      return;
    }

    redeemSsoTicket(ticket).then((result) => {
      // Only reached on failure — success calls redirect() inside the
      // server action, which never resolves this promise from the client's
      // perspective (React's runtime intercepts the NEXT_REDIRECT throw).
      if (result?.error) setError(true);
    });
  }, [ticket, router]);

  if (error) {
    return (
      <>
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="font-semibold text-slate-900">That sign-in link already expired or was used</p>
        <p className="text-sm text-slate-500 mt-1">
          <a href="/login/sso" className="text-primary hover:underline">Try signing in again</a>
        </p>
      </>
    );
  }

  return (
    <>
      <Loader2 className="w-8 h-8 text-primary mx-auto mb-3 animate-spin" />
      <p className="font-medium text-slate-700">Signing you in…</p>
    </>
  );
}
