// Service worker: sovellus aukeaa myös ilman verkkoa. Kirjaukset jonotetaan sovelluksessa (lib.js).
const VERSION = 'tyoaika-v2';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app.js', '/lib.js', '/config.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png',
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.28.1/lib/msal-browser.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    await Promise.all(CDN.map((u) => fetch(new Request(u, { mode: 'cors' })).then((r) => r.ok && cache.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Microsoftin kirjautuminen ja Excel-rajapinta aina verkosta
  if (url.hostname.endsWith('microsoftonline.com') || url.hostname.endsWith('microsoft.com')) return;

  // Sivu: verkko ensin, muuten välimuistista
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((r) => {
      const copy = r.clone(); caches.open(VERSION).then((c) => c.put('/index.html', copy));
      return r;
    }).catch(() => caches.match('/index.html')));
    return;
  }

  // Omat tiedostot: välimuisti heti, päivitys taustalla
  if (url.origin === self.location.origin) {
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Kirjastot ja fontit: välimuisti ensin
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok || r.type === 'opaque') cache.put(req, r.clone());
      return r;
    }));
  }
});
