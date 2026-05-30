// Minimal service worker: cache the app shell so the PWA opens offline.
// Audio + the /api/* JSON endpoints are always fetched live (network-first).
const CACHE = "podlab-shell-v3";
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/state.js",
  "/select.js",
  "/theme.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/favicon.svg",
  "/icons/apple-touch-icon.png",
  // favicon-16/32 and the maskable icon variants are intentionally omitted:
  // the SVG favicon covers modern browsers and the maskables are fetched lazily
  // at PWA-install time, so they don't need to be in the offline shell.
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache the API or audio media.
  if (url.pathname.startsWith("/api/") || e.request.destination === "audio") return;
  // Cache-first for the static shell.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
