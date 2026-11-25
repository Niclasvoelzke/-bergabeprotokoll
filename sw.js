// Service Worker für das Übergabeprotokoll-Formular
// Ziel: Nach dem ersten Öffnen funktioniert die Seite komplett offline,
// auch nach Neustart des iPads oder Wochen ohne Internetverbindung.

const CACHE_NAME = 'uebergabeprotokoll-v10';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './uebergabeprotokoll.html',
  './selbstauskunft.html',
  './nebenkosten.html',
  './nk-app.js',
  './vendor/supabase-2.45.4.js',
  './icon-180-v2.png',
  './manifest.json',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './favicon-32.png'
];

// Beim Installieren: Seite sofort in den Cache legen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Alte Cache-Versionen aufräumen, wenn eine neue Version aktiv wird
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Strategie: Erst versuchen, frische Version aus dem Netz zu holen
// (damit Updates ankommen, wenn Internet da ist). Klappt das nicht
// (kein Internet), wird die zwischengespeicherte Version ausgeliefert.
// Nur eigene App-Dateien (GET, gleiche Herkunft) werden zwischengespeichert.
// Anfragen an Supabase (Login, Daten, Belege) gehen immer direkt ans Netz
// und landen nie im Cache.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return response;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
