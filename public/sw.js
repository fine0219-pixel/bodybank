// 버전 올리면 캐시 갱신됨. 배포 때마다 숫자 올리면 확실.
const CACHE = "bodybank-v" + "20260728a";

self.addEventListener("install", (e) => {
  self.skipWaiting(); // 새 SW 즉시 활성화
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // 옛날 캐시 전부 삭제
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // API·Supabase는 항상 네트워크
  if (req.url.includes("/api/") || req.url.includes("supabase")) return;
  // 그 외: 네트워크 우선, 실패 시 캐시 (항상 최신 시도)
  e.respondWith(
    fetch(req)
      .then((res) => {
        // 성공하면 캐시 갱신
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
