/**
 * Groove Lab Service Worker (P4-07)
 * Versioned Cache-First for App Shell & Stale-While-Revalidate for dynamic assets.
 * Offline-first progressive web application.
 */

const CACHE_VERSION = "groove-v2.1.9";
const CACHE_NAME = `groove-app-shell-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable.png",
  "/icons/icon-192.svg",
];

// Install: precache App Shell.
// NOTE: deliberately does NOT call skipWaiting() here — the new worker waits until
// the page asks for it (`applyUpdate()` posts SKIP_WAITING), so "update available"
// stays a user-driven decision instead of swapping assets under a running session.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
});

// Activate: clean up older cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key.startsWith("groove-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Message: handle skipWaiting trigger
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch: Strategy depending on request type
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignore non-GET requests or chrome-extension schemes
  if (request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // 1. Static hashed assets (/assets/*) and icons -> Cache First
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 2. Navigation / HTML -> Network First with Cache Fallback (offline support)
  if (request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match("/index.html");
          });
        })
    );
    return;
  }

  // 3. Update metadata (/version.json, /changelog.json) -> Network First, always.
  //
  //    These two files decide whether the user is told about a new release and
  //    what that release changed, so serving a cached body while online is a
  //    user-visible bug: an updated client reported the new version but its
  //    changelog stopped one release short, because the old stale-while-revalidate
  //    rule handed back the cached archive and nothing re-rendered after the
  //    background revalidation. Network-first makes the deployed worker itself the
  //    backstop, so clients still running the old UI are fixed too.
  //
  //    `/version.json` is fetched with a per-check `?t=` cache buster, so caching
  //    it only grew Cache Storage by one entry per check — it is never written now.
  //    `/changelog.json` falls back to cache so the history still opens offline.
  if (url.pathname === "/version.json" || url.pathname === "/changelog.json") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (
            url.pathname === "/changelog.json" &&
            networkResponse &&
            networkResponse.status === 200
          ) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // 4. Other requests -> Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
