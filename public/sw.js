// Minimal app-shell service worker — makes the PWA installable and keeps the
// UI from going to a blank browser error page on a dropped connection.
//
// Deliberately does NOT cache anything else: no /api/ responses, no page
// HTML beyond the static offline fallback, no exam/certificate data. This is
// a certification platform — serving stale or offline copies of exam
// questions, certificate status, or any authenticated page would be
// incorrect, not just unhelpful. Bump CACHE_NAME on any shell asset change
// so old caches are dropped on activate.
const CACHE_NAME = "clmep-shell-v1";
const SHELL_ASSETS = [
  "/offline",
  "/manifest.json",
  "/web-app-manifest-192x192.png",
  "/web-app-manifest-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch API routes or auth callbacks — always hit the network so
  // exam state, certificate status, and session handling stay authoritative.
  if (url.pathname.startsWith("/api/")) return;

  // Page navigations: network-first, falling back to the offline shell only
  // when the network is genuinely unreachable. Never serve a cached page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline").then((res) => res || Response.error()))
    );
    return;
  }

  // Next.js build assets are content-hashed and immutable — safe to
  // cache-first and serve without ever going stale.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return res;
          })
      )
    );
    return;
  }

  // Everything else (fonts, images, other pages) passes straight through —
  // no interception, no caching.
});
