const CACHE = "bodybank-v1";
self.addEventListener("install", (e) => {
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  // API 요청은 항상 네트워크로 (캐시하면 안 됨)
  if (e.request.url.includes("/api/") || e.request.url.includes("supabase")) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
