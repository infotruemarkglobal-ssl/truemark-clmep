"use client";

import { useActionState } from "react";
import { Shield, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyMfaCode } from "./actions";

export default function MfaVerifyForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifyMfaCode, null);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Two-factor verification</h2>
        <p className="text-slate-500 text-sm mt-1">
          Enter the 6-digit code from your authenticator app.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="code">Authentication code</Label>
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
            autoFocus
          />
          {state?.error && (
            <p className="text-sm text-destructive mt-1">{state.error}</p>
          )}
        </div>
        <Button type="submit" className="w-full gap-2" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Verifying…
            </>
          ) : (
            <>
              Verify
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </form>

      <p className="text-center text-xs text-slate-400">
        Lost access to your authenticator?{" "}
        <a href="mailto:support@truemarkglobal.com" className="text-primary hover:underline">
          Contact support
        </a>
      </p>
    </div>
  );
}
