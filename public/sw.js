// Minimal service worker: exists to satisfy PWA installability criteria and
// give a friendly offline fallback for navigations, not to cache app pages
// or API/WS traffic. Wisp is fundamentally a realtime app (matchmaking,
// chat, WebRTC signaling all need a live connection) — caching stale HTML
// or API responses would actively cause bugs, so this deliberately does not
// implement a cache-first or stale-while-revalidate strategy for anything
// but the tiny offline fallback page itself.
const CACHE_NAME = "wisp-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL)),
  );
});
