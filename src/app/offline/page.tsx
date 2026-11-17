import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import RetryButton from "./RetryButton";

export const metadata: Metadata = { title: "You're Offline" };

// Shown by the service worker (public/sw.js) when a navigation fails with no
// network and nothing cached for the requested page. Kept fully static —
// no data fetching, since the whole point is that it must render offline.
export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <WifiOff className="w-9 h-9 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">You&apos;re offline</h1>
        <p className="text-slate-500 mb-8">
          This page needs an internet connection. Reconnect and try again — your
          progress on anything already submitted is safe.
        </p>
        <RetryButton />
      </div>
    </div>
  );
}
