# Roadmap

Requested work not yet scheduled into a commit. Take one task at a time, not a
batch. Every task ships green on `npx tsc --noEmit`, `npm test`, and
`npm run build`; that bar is assumed below rather than repeated per task.

Tasks are ordered by dependency. Phase 1 is load-bearing — Phase 2 content is
priced against decisions made there, so building it out of order means tuning
twice.

---

# Epic: Run structure

Runs are 5 floors of the same activity at higher numbers. This turns them into
2–5 regions of 5 floors, each region closing on a boss, with length and
difficulty chosen at the title screen.

Two findings from the current code drive the ordering:

- **Scaling does not survive a longer run.** It is linear in `level` with no
  ceiling: `enemyCount = 3 + level` puts 28 enemies on floor 25, `hp + (level-1)*4`
  gives a Crawler 114 HP against the player's `attackPower: 12`, and
  `attackPower + (level-1)` has a Behemoth hitting for 39. Longer runs are
  blocked on replacing this.
- **Save/resume is cheap.** `GameState` is plain data and already carries
  `rngState: rng.serialize()` (`src/core/game.ts`). Persistence is close to
  `JSON.stringify` into the installed-and-unused `idb-keyval`.

## Phase 1 — Frame

### ~~1a. Title screen shell~~ — shipped

`src/ui/titleScreen.ts`. Continue and Settings are present but disabled; 2b and
1c enable them. The end modal gained a Main Menu button, so the title is
reachable after the first run rather than being a one-time splash.

### ~~1b. Run configuration~~ — shipped

`src/core/runConfig.ts`. `FINAL_FLOOR` is gone; `state.config.finalFloor` drives
victory, the opening log line, and the HUD's `1/15` floor readout.

Took a slice of 3c early: the difficulty tier is applied as an incoming-damage
multiplier in `damagePlayer` (gentle 0.7 / standard 1.0 / brutal 1.3), because a
picker whose choice did nothing would have been a lie. 3c still owns applying
difficulty to the region curves once 3b exists.

### ~~1c. Settings screen with rebindable keys~~ — shipped

`src/ui/keybinds.ts` + `src/ui/settingsScreen.ts`. All 13 actions rebind, two
slots each so the arrows/WASD pairing survives. `controls.ts` reads the table per
keypress, and `idb-keyval` is no longer unused — the first persisted thing in the
game, which de-risks 2a.

Reachable from the title screen only. An in-run settings entry needs a pause
screen that does not exist yet; file it with 2b if it starts to bite.

### ~~2a. Persist and restore a run~~ — shipped

`src/core/save.ts`. `GameState` is plain data end to end, so idb-keyval's
structured clone is the whole serializer — no custom encoding. Autosaves on every
turn and at turn 0; ~138 KB a write.

`decodeRun` refuses a finished run and a save from another `SAVE_VERSION`, so a
save that outlives its run cannot be resumed even if 2b's clear never lands.

`loadRun` has no caller yet — 2b is the button.

### ~~2b. Continue wiring~~ — shipped

Continue reports the floor and turn it would resume, and the save is re-read
every time the title opens rather than cached — the run just played may have
cleared it.

Beyond the task: one save slot means New Game destroys the run in progress, so
Descend now asks first when there is one. Losing a twenty-floor run to a mistap
is not recoverable.

### ~~Checkpoint — Frame is navigable~~ — reached
A run can be configured, started, quit, resumed, and finished at any of the four
lengths. Scaling is still wrong; that is 3a–3c, and it is now the only thing
between the game and a playable 25-floor run.

### 3a. Region model

Map floor number to a region index and a region descriptor table. No behaviour
change yet — this is the seam everything in Phase 2 hangs off.

Done when: a pure function maps floor → region for all four run lengths, unit
tested at every boundary.

Files: `src/core/regions.ts` (new), `src/core/state.ts`. Scope: S.

### 3b. Region-based enemy scaling

Replace linear-in-level HP, attack, and count with per-region curves that step
at region boundaries and stay flat within one.

Done when: no stat grows unbounded with floor number, floor 25 is survivable in
`tests/run.test.ts`, and the 114-HP-Crawler case is gone.

Depends on 3a. Files: `src/core/game.ts`, `tests/run.test.ts`. Scope: M.

### 3c. Difficulty multipliers

Apply the 1b difficulty tier on top of region curves at a single choke point.

Done when: each tier measurably changes incoming damage with no other call site
reading difficulty.

Depends on 1b, 3b. Files: `src/core/game.ts`, `src/core/damage.ts`. Scope: S.

### Checkpoint — Frame complete
All four lengths are completable and balanced enough to playtest. Ground the
next tuning pass in `logs/<run-id>.json` rather than guessing.

## Phase 2 — Content

Five enemy species exist and all unlock by floor 4; there are three shift types.
Stretched over 25 floors with no additions, a longer run is the same fight for
five times as long. This phase is the bulk of the work, not a polish pass.

### 4a. Per-region enemy species

Each region gets its own species drawn from a region-scoped pool rather than one
global table gated by `minLevel`.

Done when: regions share no species by default and each has at least two of its
own.

Depends on 3a, 3b. Files: `src/core/game.ts`, `src/core/regions.ts`,
`src/core/state.ts`. Scope: M.

### 4b. Per-region hazards

A region-specific environmental threat beyond the three existing shift types.

Done when: each region contributes one hazard, and hazard damage routes through
`damagePlayer` like every other source.

Depends on 3a. Files: `src/core/regions.ts`, `src/core/engine.ts`,
`src/core/damage.ts`. Scope: M.

### 4c. Region identity

Palette and a floor-entry banner so a region is recognisable on sight. ASCII
only — no tilesets.

Done when: entering a new region is visually unmistakable.

Depends on 3a. Files: `src/render/canvasRenderer.ts`, `src/ui/hud.ts`,
`src/styles/main.css`. Scope: S.

### 5a. Boss floor generation

Every 5th floor is an arena, not a normal floor: one chamber, no loot scatter,
exit sealed until the boss dies.

Done when: floors 5/10/15/20/25 generate as arenas and the exit refuses to open
early. `syncDoors` and the shift system must stay correct on this layout.

Depends on 3a. Files: `src/core/game.ts`, `src/core/engine.ts`,
`tests/shift.test.ts`. Scope: M.

### 5b. Boss entities

One boss per region with behaviour distinct from the standard chase-and-hit AI.

Done when: each region's boss is beatable and does something no normal enemy
does.

Depends on 5a, 4a. Files: `src/core/game.ts`, `src/core/engine.ts`,
`src/core/state.ts`. Scope: L — split per boss if it runs long.

### 5c. Boss reward and region transition

Killing a boss opens the exit, pays out, and marks the region cleared.

Done when: a boss kill is the only way onward and the payout is visible.

Depends on 5b. Files: `src/core/engine.ts`, `src/ui/hud.ts`. Scope: S.

### 6a. Coins

A currency that drops from enemies and floors, tracked on `Player`, shown in the
HUD.

Done when: coins accumulate across floors and survive save/resume.

Depends on 2a. Files: `src/core/state.ts`, `src/core/game.ts`,
`src/ui/hud.ts`. Scope: S.

### 6b. Shop

A merchant on each boss floor after the kill, selling a rolled stock. This is
the run's choice point — spend now or save for a better region — and the
player-facing difficulty valve.

Done when: purchases deduct coins, stock is seeded per boss floor, and the shop
cannot be re-rolled by leaving and returning.

Depends on 5c, 6a. Files: `src/core/shop.ts` (new), `src/ui/`,
`src/core/engine.ts`. Scope: M.

### 6c. Shop pricing pass

Price stock against real coin income once 6a/6b are live.

Done when: pricing is grounded in `logs/<run-id>.json` income per region rather
than guessed.

Depends on 6b. Files: `src/core/shop.ts`. Scope: S.

### 7. Escalating unraveling

Shift cadence and severity ramp the longer the player lingers on a floor,
rewarding efficient exits. Pressure is **per-floor** — `turnCount` never resets
per floor, so a run-long counter would tax floor 1 dawdling for the rest of the
run.

Done when: a floor measurably tightens over time, resets on descent, and the
telegraph fidelity guard in `tests/shift.test.ts` stays green.

Depends on 3a. Files: `src/core/state.ts`, `src/core/engine.ts`,
`src/core/shift/shiftSystem.ts`. Scope: M.

### 8. Pursuer

An entity that hunts the player across a floor and cannot be killed, only
outrun. Pairs with 7 as the visible face of rising pressure.

Done when: it tracks the player through the map, is escapable via the exit, and
does not deadlock on a floor whose geometry just shifted.

Depends on 7. Files: `src/core/state.ts`, `src/core/engine.ts`,
`src/core/map/pathfinding.ts`. Scope: M.

### 9. Weapon types

Ranged and stronger melee weapons, reusing the equipment slot and comparison
prompt built for armor. Feeds Phase 2 — regions and shops need things worth
finding.

Done when: weapons equip through the armor pattern and at least one changes
attack range rather than just its number.

Depends on 4a. Files: `src/core/state.ts`, `src/core/game.ts`,
`src/core/engine.ts`, `src/ui/hud.ts`. Scope: L — split ranged from melee if it
runs long.

### 10a. Experience and levels

Kills grant XP; XP raises a player level that ramps `maxHp` and `attackPower`.
The point is incentive, not power: right now nothing rewards clearing a floor
over walking past it to the stairs.

This **pulls against 7** — pressure rewards leaving fast, XP rewards staying to
fight. That tension is the design, but only if both are tuned together: if
pressure outpaces XP, fighting is never worth it and 10a is dead weight. Build
10a first and tune 7 against it.

Done when: kills grant XP, levels raise stats through one choke point, and
progress survives save/resume.

Depends on 3b. Files: `src/core/state.ts`, `src/core/engine.ts`,
`src/core/game.ts`. Scope: M.

### 10b. Level-up splash

A brief overlay naming the new level and what it gained. Level-ups are the
payoff that makes 10a legible — a silent stat bump teaches nothing.

Done when: the splash names each stat gained, does not consume a turn, and does
not interrupt a queued tap-to-travel walk mid-step.

Depends on 10a. Files: `src/ui/hud.ts`, `src/main.ts`, `src/styles/main.css`.
Scope: S.

### 10c. XP curve pass

Tune XP per species and the level curve against real kill counts once 10a/10b
are live.

Done when: the curve is grounded in `logs/<run-id>.json` kills per region rather
than guessed, and a full-clear run is measurably stronger at the boss than a
rush run.

Depends on 10b. Files: `src/core/game.ts`. Scope: S.

---

# Independent — feel

No dependency on the epic. Pick these up between phases.

## Impact effects for shifts and combat

Shifts and altercations should read as events. Candidates: screen shake on a
collapse, hit-stop on a kill, heavier particle bursts, a flash on the struck
glyph.

The render loop is on-demand — effects that animate must keep marking the frame
dirty while they run, the way particles do via `ParticleSystem.active`.

## Pickup feedback

Walking over a `*` produces no acknowledgement. Candidates: a burst on the tile,
the item name rising off it, a highlight on the hotbar slot it landed in.

## Show cooldowns

`state.abilityCooldown` already gates `ui.abilityBtn.disabled` in `updateHud`,
so the number exists and simply is not shown. Same for `stasisTurnsRemaining`.

---

# Independent — monetization

## Donation screen

A revenue path that does not turn the HUD into ad space. One entry point from
the title screen (1a), nothing on the play surface.

Constraint: the game is an offline PWA with no backend, so anything requiring a
server or a store account is a much bigger change than it looks.
