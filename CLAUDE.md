# The Wandering Dungeon

A small offline roguelike PWA. No frameworks — TypeScript, Vite, an HTML5
canvas, and vanilla DOM for the HUD. ~3,000 lines of source total; the whole
game state fits in your head, so prefer reading the actual file over guessing.

## Tech Stack

- TypeScript 5 (strict), Vite 5 (dev server on **port 3000**, not the Vite
  default), Vitest, no UI framework
- Deterministic seeded RNG (`seedrandom` via `src/core/rng.ts`) — every roll in
  the game goes through `SeededRNG`, never `Math.random()` directly (the one
  sanctioned exception is `src/telemetry/runLog.ts`'s run-id timestamp)
- `idb-keyval` is installed but currently unused (persistence is deferred)

## Commands

- Dev server: `npm run dev` (or the `wandering-dungeon` preview config — port 3000)
- Type check: `npx tsc --noEmit`
- Tests: `npm test` (Vitest, `tests/**/*.test.ts`)
- Build: `npm run build` (runs `tsc` then `vite build`)

Run all three (`tsc`, `npm test`, `npm run build`) before calling a change done.
None of them verify how something *feels* in the browser — see Verification below.

## Architecture — read this before touching game logic

- **`dispatchAction(state, action)` in `src/core/engine.ts` is the only way the
  game advances.** It mutates and returns the single `GameState` object. Don't
  add a second code path that mutates state outside it.
- `src/core/game.ts` deliberately has **no import from `engine.ts`** — this
  avoids a cycle (`engine.ts` imports `buildFloor` from `game.ts`). Keep it that way.
- **Plan-time rehearsal pattern** (see `src/core/shift/shiftSystem.ts`): a
  dungeon shift is simulated on a *cloned* copy of the map (`cloneGeometry`),
  diffed against the original (`diffGeometry`), and the diff is stored as a
  `PendingShift`. The telegraph (warning tiles) and the execution both replay
  that same diff verbatim. **Never re-derive shift outcomes at execution time**
  — that was the root cause of a shipped bug where telegraphs didn't match
  what actually happened (see commit `e82520c`). If you touch shift logic,
  the fidelity guard is `tests/shift.test.ts`'s "telegraph fidelity" describe
  block — keep it green.
- Doors are **not** placed once and left alone — `syncDoors()` re-derives them
  from geometry every shift (a door = a room-floor tile adjacent to a
  corridor-floor tile; rooms are solid rectangles with no wall border, so this
  is not a "gap in a wall" check). If you change room/corridor tile logic,
  re-run `tests/shift.test.ts`'s "door consistency" block.
- Fog of war (`floorMap.explored` / `floorMap.visible`) gates both telegraph
  and shift-flash rendering — a tile the player can't see doesn't flash or warn.
- `MAX_EXIT_BLOCKED_STREAK` (shiftSystem.ts) bounds how many shifts in a row
  may seal the exit. This is intentional oscillation, not a bug — the exit is
  allowed to become unreachable for exactly one shift cycle, with
  `carveRescuePath` as the hard fail-safe. Don't "fix" a sealed exit by adding
  a stricter invariant; that's what caused the floor-locks-permanently
  regression during the last fix (see `.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/progress.md`).
- Combat/tuning constants live in two places: `ENEMY_TABLE` in `src/core/game.ts`
  (per-species HP/attack, scaled by `+ (level - 1)`) and
  `src/core/engine.ts` (`SHIELD_BASE_FRACTION`, `ENEMY_AGGRO_RADIUS`, the
  `attackPower + rng.randomInt(-2, 2)` damage roll).
- `tests/run.test.ts` is the end-to-end completability guard — an `autoPlay`
  bot walks toward the exit every turn. If a change breaks it, the game became
  uncompletable, not "a test needs updating." Treat its failure as load-bearing.
- **Playtest data**: `src/telemetry/runLog.ts` + `vite/runLogPlugin.ts` record
  every played run to `logs/<run-id>.json` (git-ignored, dev-server only) — a
  per-turn trace of HP/shield/action/damage plus run totals (damage by source,
  shifts by type, kills, items). Use this instead of guessing at balance; it's
  cheap to read and ground-truths what a real run actually experiences.

## Code Conventions

- **ASCII/glyph rendering only** — ` @ E * + > ` etc. This is an explicit user
  preference. Don't propose or switch to sprites/tilesets without asking first.
- No comments except where the WHY is non-obvious (a hidden constraint, a
  workaround, a subtle invariant). Never explain WHAT the code does. This
  codebase already has a lot of "why" comments on tricky spots (shift
  rehearsal, door sync, exit-blocked streak) — read them before you touch the
  surrounding logic, they usually explain a scar from a previous bug.
- Don't add abstractions, feature flags, or defensive fallbacks for scenarios
  that can't happen in this single-mutable-state architecture. Trust the
  engine's guarantees inside `core/`; validate only at the true boundary
  (`main.ts`'s DOM event handlers, the run-log HTTP endpoint).

## Verification

**This environment's Browser pane tab reports `document.visibilityState ===
"hidden"`** — `requestAnimationFrame`, `ResizeObserver`, and `computer`
screenshots never fire here. A blank/0×0 canvas or a timed-out screenshot is
this limitation, not a rendering bug — don't chase it as one.

For logic/rendering correctness, drive the real Vite modules in-page instead:
```js
const [G, E, R] = await Promise.all([
  import('/src/core/game.ts?t=1'),      // ?t= busts Vite's module cache after an edit
  import('/src/core/engine.ts?t=1'),
  import('/src/render/canvasRenderer.ts?t=1'),
]);
const s = G.createNewGame('seed');
E.dispatchAction(s, { type: 'WAIT' });
const cv = document.createElement('canvas'); cv.width = 900; cv.height = 600;
R.renderFrame(cv.getContext('2d'), s, 900, 600);   // then getImageData to check pixels
```
DOM/CSS checks (`getComputedStyle`, `innerText`, `getBoundingClientRect`) work normally.

**For simple, low-risk UI changes (new glyph, legend text, a CSS tweak), one
quick check is enough — don't stack multiple render/screenshot/pixel-sampling
passes to re-prove the same fact.** The user playtests quickly themselves;
that's cheaper than token-heavy self-verification for anything low-stakes.
Save deep verification for logic bugs where a wrong answer is expensive and
not obvious at a glance (shift telegraph fidelity, balance math, save/load
correctness).

Port 3000 is often already held by another session's `npm run dev` on this
same folder — it serves the same files from disk, so it's fine to reuse
rather than fight over the port.

## Boundaries

- Make appropriately scoped commits and push to `main` when a targeted, scoped
  fix or update is done — this project doesn't use PRs for solo iteration.
- Ask before switching rendering style (see ASCII convention above) or before
  changing the "exit may be temporarily unreachable" design (that was a
  deliberate, explicit design decision, not an oversight).
