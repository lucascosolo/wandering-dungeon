# The Wandering Dungeon

A turn-based ASCII roguelite for the phone. Descend, fight, loot — except the
dungeon rearranges itself underneath you. Walls move, corridors seal, the stairs
you were walking to may not be there when you arrive. Shifts are telegraphed a
turn ahead; the warning tiles are the only thing standing between you and a wall
closing on your head.

Runs are short (a few floors) to long (twenty-plus), on three difficulties.
Everything is seeded, so a run can be replayed exactly.

---

## For alpha testers

**Play at:** `https://<DOMAIN-NOT-YET-POINTED>` — the domain is not live yet;
this line gets the real URL when it is.

Nothing to install and no account. It runs in the browser, saves your run on the
device, and works offline after the first load.

### Put it on your home screen

- **iPhone / iPad (Safari):** open the URL → Share → *Add to Home Screen*. Launch
  it from there and it runs fullscreen with no browser chrome.
- **Android (Chrome):** open the URL → menu → *Install app* / *Add to Home
  screen*.

When a new build ships you will see a small **"A new version of the dungeon is
ready"** panel. Tap **Reload** to take it, or **Later** to finish the run first —
it will not reload underneath you.

### Reporting a bug

Please include:

1. **The seed.** When you die or win, the end screen prints `seed: <value>` at
   the bottom. That value plus the run's length and difficulty reproduces the
   run exactly, so it is the single most useful thing in a report.
2. **What you did and what you expected instead** — the turn or floor it
   happened on if you noticed.
3. **The device and browser** (e.g. "iPhone 13, Safari, installed to home
   screen").
4. If the game showed a **"Something broke"** panel, the message on it verbatim.
   That panel also has a *Reset Save* button — it erases the run and your key
   bindings and reloads, and is the way out of an install that will not start.

A run that ends in a crash is worth reporting even without a seed.

---

## For developers

Project rules, architecture, and the documentation map are in `CLAUDE.md` —
read that before changing game logic. This file is only how to run it.

```
npm install
npm run dev      # dev server on port 3000
npx tsc --noEmit # type check
npm test         # Vitest (tests/**/*.test.ts)
npm run build    # tsc, then vite build into dist/
npm run preview  # serve the built dist/ — the only way to exercise the service worker
```

Run `tsc`, `npm test` and `npm run build` before calling a change done.

### PWA bits

- `public/manifest.json`, `public/sw.js` (hand-written, **network-first** so a
  tester never runs a stale build) and `src/pwa/serviceWorker.ts` (registration;
  it deliberately does nothing in dev, and unregisters any worker it finds
  there, so an edit never hides behind a cache).
- `public/icon-192.png` / `icon-512.png` are generated — regenerate with
  `node scripts/generate-icons.mjs` after a palette change rather than editing
  the PNGs.

### Deploying

`npm run build` produces a fully static `dist/`. Serve it at the root of the
origin (`base` is `/`) with any static host. Two server-side requirements: HTTPS
(no service worker without it) and `sw.js` served with no long-lived
`Cache-Control`, or a new build can sit behind a cached worker.
