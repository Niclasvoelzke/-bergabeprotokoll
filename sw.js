// Service Worker für das Übergabeprotokoll-Formular
// Ziel: Nach dem ersten Öffnen funktioniert die Seite komplett offline,
// auch nach Neustart des iPads oder Wochen ohne Internetverbindung.

const CACHE_NAME = 'uebergabeprotokoll-v2';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './selbstauskunft.html'
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
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
