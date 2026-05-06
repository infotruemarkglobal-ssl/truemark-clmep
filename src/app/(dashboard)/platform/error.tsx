"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
        <p className="text-slate-500 text-sm mb-2">
          This page encountered an unexpected error.
        </p>
        {error.digest && (
          <p className="text-xs text-slate-400 mb-6 font-mono">ID: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Try again
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard")} className="gap-2">
            <Home className="w-4 h-4" /> Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
