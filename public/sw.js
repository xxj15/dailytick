/**
 * Daily Tick 서비스 워커.
 *
 * 브리핑은 매일 아침 바뀌므로 지면은 언제나 네트워크를 먼저 본다.
 * 캐시는 '한 번 읽은 지면을 지하철에서도 다시 펼쳐보는' 용도일 뿐이다.
 *
 * - 해시가 붙은 정적 자산·폰트·아이콘: 캐시 우선 (내용이 바뀌면 주소가 바뀐다)
 * - 페이지 이동: 네트워크 우선, 실패하면 마지막으로 본 지면 → 오프라인 안내
 * - /api, RSC 요청, GET 외 요청: 손대지 않는다 (학습 기록·로그인은 항상 서버가 판단한다)
 */

// 캐시 전략을 바꾸면 버전을 올린다. 이전 버전 캐시는 activate에서 지운다.
const VERSION = "v1";
const STATIC_CACHE = `dailytick-static-${VERSION}`;
const PAGE_CACHE = `dailytick-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";

// 지난 호를 계속 넘겨봐도 캐시가 끝없이 불어나지 않게 한다.
const MAX_CACHED_PAGES = 30;

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("dailytick-"))
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/icons/")
  );
}

function isRscRequest(request, url) {
  return request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function trimPageCache(cache) {
  const keys = await cache.keys();
  // keys()는 넣은 순서대로 돌려주므로 앞에서부터 오래된 지면이다.
  await Promise.all(
    keys
      .slice(0, Math.max(0, keys.length - MAX_CACHED_PAGES))
      .map((key) => cache.delete(key)),
  );
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      // 같은 주소를 다시 넣으면 순서가 갱신되지 않으므로 지우고 넣는다.
      await cache.delete(request);
      await cache.put(request, response.clone());
      trimPageCache(cache);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    return (
      (await caches.match(OFFLINE_URL)) ??
      new Response("오프라인 상태입니다.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (isRscRequest(request, url)) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  }
});
