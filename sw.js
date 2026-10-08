/* re:Invent 2026 출장 앱 — Service Worker (cache-first, offline ready) */
const CACHE = "reinvent2026-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/data.js",
  "./js/mock_sessions.js",
  "./js/app.js",
  "./js/sessions.js",
  "./js/planner.js",
  "./js/transport.js",
  "./js/prep.js",
  "./js/expenses.js",
  "./js/transfer.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: false }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        const url = new URL(e.request.url);
        if (url.origin === location.origin && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
