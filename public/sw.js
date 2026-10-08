// Makes Lists installable and open instantly. Data always comes from Supabase (another origin), never this cache.
// - Pages: network first (revalidated), so a new deploy shows up on the next open; cached copy only when offline.
// - /assets/*: cache first. Vite puts a content hash in every filename, so they never change.
// ponytail: old hashed assets pile up in the cache across deploys (small); prune on activate if it ever matters.
const CACHE = 'lists-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return

  if (req.mode === 'navigate') {
    e.respondWith(
      // no-cache: always ask GitHub whether the page changed (a cheap 304 if not). Otherwise the
      // browser's own 10-minute HTTP cache can keep serving the previous deploy.
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./')),
    )
  } else if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          }),
      ),
    )
  }
})
