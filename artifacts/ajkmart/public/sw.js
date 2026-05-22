/**
 * AJKMart PWA Service Worker
 * Cache-first strategy for static assets; network-first for API calls.
 * Push notification support for real-time order/ride updates.
 */

const CACHE_NAME = "ajkmart-v1";
const API_PATTERN = /\/api\//;

/* Files to pre-cache on install */
const PRECACHE_URLS = ["/", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  /* Skip non-GET and API requests (always go to network for live data) */
  if (request.method !== "GET" || API_PATTERN.test(request.url)) {
    event.respondWith(fetch(request));
    return;
  }

  /* Cache-first for static assets */
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(() => caches.match("/"));
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "AJKMart", body: "You have a new notification" };
  try {
    if (event.data) data = event.data.json();
  } catch {
    data.body = event.data ? event.data.text() : data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "AJKMart", {
      body: data.body || "",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: data.tag || "ajkmart-notification",
      data: {
        orderId: data.orderId,
        rideId: data.rideId,
        url: data.url,
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  let targetUrl = "/";
  if (notifData.url) {
    targetUrl = notifData.url;
  } else if (notifData.rideId) {
    targetUrl = "/ride";
  } else if (notifData.orderId) {
    targetUrl = "/orders";
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
