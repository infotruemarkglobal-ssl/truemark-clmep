"use client";

import { useEffect } from "react";

// Registers the app-shell service worker (public/sw.js) so the app is
// installable as a PWA. The worker itself only caches static, non-sensitive
// assets — see sw.js for what is deliberately never cached.
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability degrades gracefully — the app still works without the SW.
    });
  }, []);

  return null;
}
