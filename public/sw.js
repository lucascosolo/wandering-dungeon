/*
 * The Wandering Dungeon service worker.
 *
 * NETWORK-FIRST, deliberately. The obvious PWA recipe is cache-first for the
 * app shell, and it is the wrong one during an alpha: we ship several builds a
 * week, and cache-first means a tester keeps playing last week's bundle and
 * files bugs against code that no longer exists. Every request therefore goes
 * to the network first and the cache is refreshed from the response; the cache
 * exists only so the game still opens with no signal.
 *
 * The cost of this choice is a slower first paint on a bad connection. That is
 * the trade we want: correctness of build over a few hundred milliseconds.
 *
 * Hand-written rather than generated, so there is no build-time precache
 * manifest — nothing here knows the hashed asset names, and it does not need
 * to. Assets enter the cache the first time they are actually fetched.
 */

/* Bumping this name is what evicts the previous build's cache on activate. */
const CACHE = 'wandering-dungeon-v1';

/**
 * The minimum needed to boot offline. The hashed JS/CSS bundles are not listed
 * — they are named at build time and get cached on first fetch instead.
 */
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  // No skipWaiting(): a new worker must not take over mid-run. It waits until
  // the player taps Reload in the update prompt, which posts SKIP_WAITING.
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // Individually, not addAll: addAll is atomic, so one 404 in the list
      // would fail the whole install and leave the app with no offline copy.
      Promise.all(SHELL.map(url => cache.add(url).catch(() => undefined)))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/** Anything that is not a plain same-origin GET is none of this worker's business. */
function isCacheable(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  // The dev server's run-log endpoint (vite/runLogPlugin.ts). POST-only today,
  // so the method check already covers it; named here so a future GET on it
  // does not silently start being cached.
  if (url.pathname.startsWith('/__runlog')) return false;
  return true;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (!isCacheable(request)) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // Only cache a real success. An opaque or error response written into
        // the cache becomes the offline fallback, which is worse than none.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // A navigation to any URL is the app shell — the game is one page.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/index.html');
          if (shell) return shell;
        }
        return new Response('Offline and not cached.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      })
  );
});
