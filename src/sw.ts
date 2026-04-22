/// <reference lib="webworker" />

export {};

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const STATIC_CACHE = "smrai-static-v1";
const API_CACHE = "smrai-api-v1";
const STATIC_ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/favicon.ico"];
const PRECACHE_ASSETS = self.__WB_MANIFEST || [];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([...STATIC_ASSETS, ...PRECACHE_ASSETS.map((asset) => asset.url)]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![STATIC_CACHE, API_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function makeCacheRequest(request: Request) {
  if (request.method === "GET") {
    return request;
  }

  const body = await request.clone().text();
  const encoded = btoa(`${request.url}:${body}`).replace(/[+/=]/g, "");
  return new Request(`${self.location.origin}/__api-cache__/${encoded}`);
}

async function networkFirst(request: Request) {
  const cache = await caches.open(API_CACHE);
  const cacheRequest = await makeCacheRequest(request);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(cacheRequest, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(cacheRequest);
    if (cached) {
      return cached;
    }
    throw new Error("Offline and no cached response available");
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/") && ["GET", "POST"].includes(request.method)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.method === "GET") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
