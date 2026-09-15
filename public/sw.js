/**
 * Groove Lab Service Worker (P4-07)
 * Versioned Cache-First for App Shell & Stale-While-Revalidate for dynamic assets.
 * Offline-first progressive web application.
 */

const CACHE_VERSION = "groove-v1.16.17";
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

  // 3. Other requests -> Stale-While-Revalidate
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
