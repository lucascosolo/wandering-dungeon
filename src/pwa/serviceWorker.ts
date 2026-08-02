/// <reference types="vite/client" />
/**
 * Service worker registration. The worker itself is `public/sw.js` — read the
 * comment at the top of it for why the caching strategy is network-first.
 *
 * Nothing in here may be able to stop the game loading. A device with service
 * workers unavailable (iOS private browsing, a locked-down webview, an insecure
 * origin) is a device that plays online only; it is not a dead install. Every
 * path is therefore guarded and every rejection is swallowed into the console.
 */

/** Re-check for a new build this often while the tab is open. */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

/** Set once the player has accepted a reload, so `controllerchange` fires once. */
let reloading = false;

/**
 * Register the worker, and call `onUpdateReady` when a new build has installed
 * and is waiting behind the running one. The callback is handed a function that
 * activates it — the reload is the player's to trigger, never ours: forcing one
 * mid-run destroys the run in progress.
 */
export function registerServiceWorker(
  onUpdateReady: (activate: () => void) => void
): void {
  if (!('serviceWorker' in navigator)) return;

  // Never in dev. A worker serving the app shell is the classic "why is my edit
  // not showing up" — and this one is registered from a prod build on the same
  // machine often enough that the unregister below is not theoretical.
  if (import.meta.env.DEV) {
    void navigator.serviceWorker
      .getRegistrations()
      .then(registrations => registrations.forEach(registration => void registration.unregister()))
      .catch(() => undefined);
    return;
  }

  window.addEventListener('load', () => {
    // updateViaCache: 'none' — sw.js has no content hash in its name, so without
    // this the browser may serve the worker itself from the HTTP cache and never
    // notice a new build at all.
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(registration => watch(registration, onUpdateReady))
      .catch(error => console.warn('Service worker registration failed', error));
  });
}

function watch(
  registration: ServiceWorkerRegistration,
  onUpdateReady: (activate: () => void) => void
): void {
  const activate = (): void => {
    const waiting = registration.waiting;
    if (!waiting) {
      // Nothing to hand over to — reload anyway rather than leaving a prompt
      // the player has already tapped sitting there doing nothing.
      window.location.reload();
      return;
    }
    waiting.postMessage('SKIP_WAITING');
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  // A build that finished installing during a previous visit is already waiting
  // before any event fires here.
  if (registration.waiting && navigator.serviceWorker.controller) {
    onUpdateReady(activate);
  }

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // No controller means this is the very first install, not an update —
      // there is no old build to replace and nothing to tell the player.
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        onUpdateReady(activate);
      }
    });
  });

  const check = (): void => void registration.update().catch(() => undefined);
  window.setInterval(check, UPDATE_INTERVAL_MS);
  // An installed PWA is usually resumed rather than launched, so returning to
  // it is the moment most likely to find a new build.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}
