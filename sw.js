/* Wine Tasting Companion — offline cache (network-first so updates show) */
const CACHE = "wtc-v16";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data/tasting-schema.js",
  "./data/rewards.js",
  "./data/palate.js",
  "./data/grapes.js",
  "./data/regions.js",
  "./data/theory.js",
  "./data/wines.js",
  "./manifest.webmanifest",
  "./assets/parchment.jpg",
  "./assets/stain1.png",
  "./assets/stain2.png",
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
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // let fonts etc. hit network
  // network-first: always prefer fresh content (wine data, Amy's chart),
  // fall back to cache only when offline.
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() =>
      caches.match(e.request).then((hit) => hit || caches.match("./index.html"))
    )
  );
});
