// Service worker: sovellus aukeaa myös ilman verkkoa. Kirjaukset jonotetaan sovelluksessa (lib.js).
// Polut ovat suhteellisia, jotta sovellus toimii myös alikansiossa (esim. GitHub Pages: /tyoaikakirjaus/).
const VERSION = 'tyoaika-v3';
const BASE = new URL('./', self.location).href;
const SHELL = ['', 'index.html', 'styles.css', 'app.js', 'lib.js', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png'].map((p) => BASE + p);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
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

  // Taustapalvelu (Google Apps Script) aina verkosta
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  // Sivu ja asetustiedosto: verkko ensin, muuten välimuistista
  if (req.mode === 'navigate' || url.href === BASE + 'config.js') {
    const key = req.mode === 'navigate' ? BASE + 'index.html' : url.href;
    event.respondWith(fetch(req, { cache: 'no-store' }).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
      return r;
    }).catch(() => caches.match(key)));
    return;
  }

  // Omat tiedostot: välimuisti heti, päivitys taustalla
  if (url.href.startsWith(BASE)) {
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Fontit: välimuisti ensin
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok || r.type === 'opaque') cache.put(req, r.clone());
      return r;
    }));
  }
});
