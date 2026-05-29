// Minimal service worker: cache the app shell so the PWA opens offline.
// Audio + the /api/episodes feed are always fetched live (network-first).
const CACHE = "qalam-shell-v1";
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
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
