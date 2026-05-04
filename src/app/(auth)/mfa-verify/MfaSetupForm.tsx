"use client";

import { useActionState, useState } from "react";
import { Shield, ArrowRight, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmMfaSetup } from "./actions";
import Image from "next/image";

export default function MfaSetupForm({
  next,
  qrDataUrl,
  secret,
}: {
  next: string;
  qrDataUrl: string;
  secret: string;
}) {
  const [state, action, pending] = useActionState(confirmMfaSetup, null);
  const [copied, setCopied] = useState(false);

  function copySecret() {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Format secret in groups of 4 for readability
  const formattedSecret = secret.match(/.{1,4}/g)?.join(" ") ?? secret;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Set up two-factor authentication</h2>
        <p className="text-slate-500 text-sm mt-1">
          Your role requires 2FA. Scan the QR code with your authenticator app, then enter the code below.
        </p>
      </div>

      {/* QR code */}
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl border-2 border-slate-200 p-2 bg-white">
          <Image src={qrDataUrl} alt="TOTP QR code" width={220} height={220} unoptimized />
        </div>
        <p className="text-xs text-slate-500">
          Use Google Authenticator, Authy, or any TOTP app.
        </p>
      </div>

      {/* Manual entry fallback */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
        <p className="text-xs text-slate-500 mb-1 font-medium">Can&apos;t scan? Enter this key manually:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono text-slate-700 break-all">{formattedSecret}</code>
          <button
            type="button"
            onClick={copySecret}
            className="shrink-0 text-slate-400 hover:text-slate-600 transition"
            aria-label="Copy secret key"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Confirm code */}
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000000"
            className="mt-1 text-center text-2xl tracking-[0.5em] font-mono"
          />
          {state?.error && (
            <p className="text-sm text-destructive mt-1">{state.error}</p>
          )}
        </div>
        <Button type="submit" className="w-full gap-2" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Activating…
            </>
          ) : (
            <>
              Activate &amp; Continue
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
