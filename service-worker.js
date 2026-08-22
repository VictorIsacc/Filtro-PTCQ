const CACHE_VERSION = 'v6-20260823';
const CACHE_PREFIX = 'ptcq-6x49-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-32.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

const XLSX_LIBRARY = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' })));

    // La librería de Excel es opcional: un fallo del CDN no debe impedir
    // que el resto de la aplicación se instale y funcione con TXT/CSV.
    try {
      const response = await fetch(XLSX_LIBRARY, { cache: 'no-cache' });
      if (response.ok) {
        const runtime = await caches.open(RUNTIME_CACHE);
        await runtime.put(XLSX_LIBRARY, response);
      }
    } catch (_) {}

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const valid = new Set([CACHE_NAME, RUNTIME_CACHE]);
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith(CACHE_PREFIX) && !valid.has(key))
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    const cachePromise = caches.open(CACHE_NAME);
    const networkUpdate = cachePromise.then(async cache => {
      const response = await fetch(request);
      if (response.ok) await cache.put('./index.html', response.clone());
      return response;
    });

    // La aplicación instalada abre inmediatamente el index precargado. La
    // copia de red se actualiza en segundo plano para el siguiente arranque.
    event.waitUntil(networkUpdate.then(() => undefined).catch(() => undefined));
    event.respondWith((async () => {
      const cache = await cachePromise;
      const cached = (await cache.match('./index.html')) || (await cache.match('./'));
      if (cached) return cached;
      return networkUpdate;
    })());
    return;
  }

  const url = new URL(request.url);
  if (url.href === XLSX_LIBRARY) {
    event.respondWith((async () => {
      const runtime = await caches.open(RUNTIME_CACHE);
      const cached = await runtime.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await runtime.put(request, response.clone());
      return response;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const runtime = await caches.open(RUNTIME_CACHE);
      await runtime.put(request, response.clone());
    }
    return response;
  })());
});
