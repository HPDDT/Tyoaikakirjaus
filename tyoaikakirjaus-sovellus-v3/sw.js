// Service worker: sovellus aukeaa myös ilman verkkoa. Kirjaukset jonotetaan sovelluksessa (lib.js).
// Polut ovat suhteellisia, jotta sovellus toimii myös alikansiossa (esim. GitHub Pages: /tyoaikakirjaus/).
const VERSION = 'tyoaika-v3.4';
const BASE = new URL('./', self.location).href;
const SHELL = ['', 'index.html', 'styles.css', 'app.js', 'lib.js', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png'].map((p) => BASE + p);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' ohittaa selaimen HTTP-välimuistin, jotta uusi versio saa varmasti uudet tiedostot
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
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

  // Sovelluksen omat tiedostot: verkko ensin (aina uusin versio), ilman verkkoa välimuistista.
  // Jos verkko ei vastaa 4 sekunnissa, käytetään välimuistia, jotta sovellus aukeaa nopeasti heikollakin yhteydellä.
  if (url.href.startsWith(BASE)) {
    const key = req.mode === 'navigate' ? BASE + 'index.html' : url.origin + url.pathname;
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const net = fetch(req.url, { cache: 'no-cache' }).then((r) => {
        if (r.ok) cache.put(key, r.clone());
        return r;
      });
      net.catch(() => {});
      const timeout = new Promise((ok) => setTimeout(() => ok(null), 4000));
      try {
        const r = await Promise.race([net, timeout]);
        if (r) return r;
        return (await cache.match(key)) || (await net);
      } catch (_) {
        return (await cache.match(key)) || Response.error();
      }
    })());
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
