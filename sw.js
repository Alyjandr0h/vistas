// Keeps the app itself working offline and up to date. Photos and songs always come fresh from
// Wikimedia and jw.org; only the calligraphy font and saved-photo thumbnails are kept on the phone.
// Bump VERSION whenever the app's files change.
const VERSION = 'vistas-v6';
const APP_FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'photos.json',
  'js/app.js', 'js/photos.js', 'js/music.js', 'js/shuffle.js', 'js/store.js', 'js/toast.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'img/painting-day.jpg', 'img/painting-night.jpg',
];

// Always ask the server (it answers "unchanged" cheaply), so the page and its scripts are never a mix
// of an old and a new version right after an update.
const fresh = request => new Request(request, { cache: 'no-cache' });

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION)
    .then(cache => cache.addAll(APP_FILES.map(file => new Request(file, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('vistas-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // The app's own files: the newest version when online, the saved copy when not.
  if (url.origin === self.location.origin) {
    event.respondWith(fetch(fresh(request))
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
    return;
  }

  // The calligraphy font, so the greeting looks right even without internet.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.open('fonts').then(async cache => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }));
    return;
  }

  // Thumbnails in the "Saved" grid stay available offline.
  if ((url.hostname === 'upload.wikimedia.org' && url.pathname.includes('/330px-'))
      || (url.hostname === 'images.pexels.com' && url.searchParams.get('w') === '330')) {
    event.respondWith(caches.open('saved-photos')
      .then(cache => cache.match(request))
      .then(hit => hit || fetch(request)));
  }
});
