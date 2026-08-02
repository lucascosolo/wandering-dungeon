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

### ~~3a. Region model~~ — shipped

`src/core/regions.ts`. Pure functions over the floor number; nothing was added to
`GameState`. The region is derived, not stored — a cached copy would be one more
thing to keep in sync across descent, save/resume, and the rescue paths.

`isRegionEnd` already marks 5/10/15/20/25 for 5a.

### ~~3b. Region-based enemy scaling~~ — shipped

Per-region curves on the `Region` descriptor. Nothing grows with the floor
number any more: floor 25 caps at 8 enemies, ×1.6 HP, +4 attack.

Also moved species unlocks off the floor number onto `runProgress`, because
`minLevel` was the same defect — every species was out by floor 4, so the back
half of a 25-floor run had nothing left to reveal and a 10-floor run met a
Collapse Behemoth in starting armor. That is a slice of 4a; 4a still owns giving
each region its *own* species rather than a shared ladder.

Measured with an autoplay bot (armor swaps, shield, potions) over 10 seeds,
median depth: short 3 → 7, long 3 → 12, extreme 3 → 6. Short runs went from 0/10
completions to 2/10.

**The wall was never floor 25 — it was floors 2-4**, on every run length,
including Short. That is what the linear ramp was really doing.

### ~~3c. Difficulty multipliers~~ — shipped in 1b

1b implemented this early and the entry was never closed. The tier is applied as
an incoming-damage multiplier in `damagePlayer` — the one choke point every
source of player HP loss already flows through — and
`tests/engine.test.ts` guards that each tier measurably changes damage taken.

**Deliberately not extended to the region curves.** Difficulty stays one lever.
Scaling enemy count and HP by tier as well would compound with the damage
multiplier, so Brutal would land far harder than its 1.3× reads, and it would
need a retune of the curves 3b just settled. If a tier should feel *different*
rather than just harsher, that is a new entry — the honest version is per-tier
region curves, not a second multiplier stacked on the first.

### Checkpoint — Frame complete
All four lengths are completable and balanced enough to playtest. Ground the
next tuning pass in `logs/<run-id>.json` rather than guessing.

## Phase 2 — Content

Five enemy species exist and all unlock by floor 4; there are three shift types.
Stretched over 25 floors with no additions, a longer run is the same fight for
five times as long. This phase is the bulk of the work, not a polish pass.

### ~~4a. Per-region enemy species~~ — shipped

Each region gets two exclusive species drawn from a region-scoped pool. The
roster now has a distinct tactical identity per region: telegraph bracing and
ambushes in the Shifting Halls, exit pursuit in the Fracture Deeps, stasis and
sealing pressure in the Ashen Warrens, route refraction in the Glass Expanse,
and shift-type-specific hunters in the Unmaking.

Done: regions share no species and each has two of its own. The shared legacy
pool remains in the data table only as a migration fallback for future content.

Depends on 3a, 3b. Files: `src/core/game.ts`, `src/core/regions.ts`,
`src/core/state.ts`. Scope: M.

### ~~4b. Per-region hazards~~ — shipped

A region-specific environmental threat beyond the three existing shift types.

All five hazards shipped: Shifting Halls doors inflict mild, telegraphed hinge
stress; a Fracture Deeps shift can shear the targeted group under the player;
Ashen Warrens corridors vent choking ash before a shift; and Glass Expanse
shifts can spray shards beside the player. The Unmaking stairs demand a toll
before the final descent. All route through armor, shield, difficulty, and run
logs.

Done when: each region contributes one hazard, and hazard damage routes through
`damagePlayer` like every other source.

Depends on 3a. Files: `src/core/regions.ts`, `src/core/engine.ts`,
`src/core/damage.ts`. Scope: M.

### ~~4c. Region identity~~ — shipped

Palette and a floor-entry banner so a region is recognisable on sight. ASCII
only — no tilesets.

Shipped: terrain palettes derive from the region descriptor, and an accessible
entry banner announces each region without adding state or changing viewport
layout. Color reinforces identity while the region name remains the readable
fallback.

Done: entering a new region is visually unmistakable.

Depends on 3a. Files: `src/render/canvasRenderer.ts`, `src/ui/hud.ts`,
`src/styles/main.css`. Scope: S.

### ~~5a. Boss floor generation~~ — shipped

Every 5th floor is an arena, not a normal floor: one chamber, no loot scatter,
exit sealed until the boss dies.

Shipped: floors 5/10/15/20/25 generate as deterministic single-room arenas
with one shift group, no corridors, and no loot scatter. The stairs remain
walkable for pathfinding but descent is sealed until every live arena guardian
is defeated; the boss-specific gate arrives in 5b. The existing door and shift
invariants remain intact on the corridor-free layout.

Depends on 3a. Files: `src/core/game.ts`, `src/core/engine.ts`,
`tests/shift.test.ts`. Scope: M.

### ~~5b. Boss entities~~ — shipped

All five regional bosses are shipped: floor 5 spawns the Hinge Sovereign, a
distinct arena entity whose ranged signature attack synchronizes with a pending
shift, and floor 10 spawns the Rift Regent, which marks a tile for a delayed,
dodgeable rift strike. Floor 15 adds the Cinder Gatekeeper, whose stasis-driven
ash interdict controls the exit radius, and floor 20's Prism Refractor marks a
visible tile from the authoritative pending shift for a dodgeable glass fault,
and floor 25 closes with the Null Testament, which marks a nearby refuge from
the Unmaking. Every boss uses a distinct telegraphed behaviour and remains
beatable with normal movement, combat, and defensive items.

Done when: each region's boss is beatable and does something no normal enemy
does.

Depends on 5a, 4a. Files: `src/core/game.ts`, `src/core/engine.ts`,
`src/core/state.ts`. Scope: L — split per boss if it runs long.

### ~~5c. Boss reward and region transition~~ — shipped

Killing a boss opens the exit, pays out a visible Hourglass Shard reward, and
records the region as cleared in the run state. The gate is boss-specific, so a
dead or missing ordinary enemy cannot keep a defeated arena locked.

Done when: a boss kill is the only way onward and the payout is visible.

Depends on 5b. Files: `src/core/engine.ts`, `src/ui/hud.ts`. Scope: S.

### ~~6a. Coins~~ — shipped

A currency that drops from enemies and floors, tracked on `Player`, shown in the
HUD.

Done when: coins accumulate across floors and survive save/resume.

Depends on 2a. Files: `src/core/state.ts`, `src/core/game.ts`,
`src/ui/hud.ts`. Scope: S.

### ~~6b. Shop~~ — shipped

A merchant on each boss floor after the kill, selling a rolled stock. This is
the run's choice point — spend now or save for a better region — and the
player-facing difficulty valve.

Done when: purchases deduct coins, stock is seeded per boss floor, the shop
cannot be re-rolled by leaving and returning, and the merchant is a body on the
floor the player walks up to rather than a menu they carry.

Depends on 5c, 6a. Files: `src/core/shop.ts` (new), `src/ui/`,
`src/core/engine.ts`. Scope: M.

The merchant is rolled once inside `awardBossDefeats` and stored on `GameState`,
so closing the modal, walking back into him, or resuming a save all read the
same stock. `BUY_ITEM` is a free action — charging a turn would let the arena
shift apart while the player read a price list. Stock always leads with a Health
Potion; the shop is the difficulty valve and a valve that can roll shut is not a
valve.

He stands on a tile — `ShopState.position`, placed by `pickSpawnPosition` in the
same breath as the stock roll — and draws as `&`. Walking into him trades, the
same shape as walking into an enemy attacking, and is free for the same reason
`BUY_ITEM` is. Tap-to-travel routes to his tile, so the last step of the walk is
that bump; anywhere else he is a wall to the router, because he is solid. Rooms
only, since a merchant parked in a corridor could seal the stairs on a floor that
has stopped shifting. Bought out, he greys and takes a dashed ring — an empty
stall is a persistent state, and those read on the map.

### ~~6c. Shop pricing pass~~ — shipped

Price stock against real coin income once 6a/6b are live.

Done when: pricing is grounded in `logs/<run-id>.json` income per region rather
than guessed.

Depends on 6b. Files: `src/core/shop.ts`. Scope: S.

**Shipped**: the base prices were right and did not move; the region markup was
wrong and did. It ran at `regionIndex * 0.35`, which raises the counter 2.4x
from the first region to the last, against an income curve that climbs 3.2x —
so the stall's share of a region's income drifted from 1.28x in region 0 to
1.86x in region 3, and the deepest shops, which should be the run's hardest
spending decision, were the easiest. `REGION_MARKUP` is now 0.55, which lands
region 4 on 3.2 and holds every region between 1.16x and 1.43x.

Grounded two ways. Seven logs carry coin telemetry, of which the pre-rescale one
is excluded: two clean runs reached the first shop with **20 and 22 coins**
against a ~32-coin stall, and a model of a full clear (`enemyCount * 4 floors *
coinsPerKill`, plus boss bounty and pile trickle) puts the same shop at 41. The
same model at the logs' observed ~35% clear rate predicts 18 — close enough to
the measured 20-22 to price the four regions no log has reached yet.

Region 0 is untouched by construction, which is the point: it is the only region
with observed rather than modelled income, and rushing it still buys two of the
four while clearing it still buys the stall.

The residual wobble is `coinsPerKill`'s step — it pays the same in regions 1 and
2, and again in 3 and 4, so income climbs every other region while a linear
markup climbs every one. No linear slope removes that, and matching it exactly
would mean pricing off the same step function from two places.

### ~~7. Escalating unraveling~~ — shipped

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

It ships with its story, not after it. A thing that chases you and cannot be
fought only frightens if the player knows what it is before it appears;
unexplained, it reads as a bug in the enemy AI. So this task includes an opening
splash at run start — who the player is, what they are descending into, and what
is coming down behind them — shown before the first turn rather than as a log
line that scrolls away. Beats along the way (first sighting, the descent that
does not shake it) carry the rest.

The splash mechanism exists twice already — level-up and boss-defeat, in
`src/ui/hud.ts` — but the opening one is a prompt, not a notification: it holds
until dismissed, so it cannot reuse their `pointer-events: none`
fire-and-forget shape unaltered.

Done when: it tracks the player through the map, is escapable via the exit, does
not deadlock on a floor whose geometry just shifted, and a new run opens on
framing that explains it before it is first seen.

Depends on 7 (shipped). Files: `src/core/state.ts`, `src/core/engine.ts`,
`src/core/map/pathfinding.ts`, `src/ui/titleScreen.ts`, `src/ui/hud.ts`,
`src/styles/main.css`. Scope: L.

### 9. Weapon types

Ranged and stronger melee weapons, reusing the equipment slot and comparison
prompt built for armor. Feeds Phase 2 — regions and shops need things worth
finding.

Done when: weapons equip through the armor pattern and at least one changes
attack range rather than just its number.

Depends on 4a. Files: `src/core/state.ts`, `src/core/game.ts`,
`src/core/engine.ts`, `src/ui/hud.ts`. Scope: L — split ranged from melee if it
runs long.

### ~~10a. Experience and levels~~ — shipped

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

### ~~10b. Level-up splash~~ — shipped

A brief overlay naming the new level and what it gained. Level-ups are the
payoff that makes 10a legible — a silent stat bump teaches nothing.

Done when: the splash names each stat gained, does not consume a turn, and does
not interrupt a queued tap-to-travel walk mid-step.

Depends on 10a. Files: `src/ui/hud.ts`, `src/main.ts`, `src/styles/main.css`.
Scope: S.

### ~~10c. XP curve pass~~ — shipped

Tune XP per species and the level curve against real kill counts once 10a/10b
are live.

Done when: the curve is grounded in `logs/<run-id>.json` kills per region rather
than guessed, and a full-clear run is measurably stronger at the boss than a
rush run.

**Shipped**: `xpToNextLevel` moved from `100 + 60 * (level - 1)` to
`50 + 45 * (level - 1)`. Per-species XP did **not** move — `ENEMY_TABLE`'s
`hp / 6 + attack` shape holds up against the logs, and `xpPerKill`'s
`1 + 0.25 * region` already sits just above the 1.6x enemy HP step, so a deeper
kill stays better value. The defect was where the crossings landed, not what a
kill was worth.

**What the logs said.** Of 38 traces, seven carry XP and only one is a clean
floor-1 run that reached a guardian: it banked 118 XP across the whole of
region 0 — 63% of the 188 its floors held, so nobody sweeps a floor — and
crossed level 2 *on the Hinge Sovereign's own bounty*. The entire first region
was fought at level 1, and the reward for beating its guardian arrived after the
fight it existed to help with. Region 0 was the only region that missed its
pre-guardian level at `100 + 60`, but it is the region every player sees, and
the two 10-floor traces confirm the knock-on: a whole victory paid out two
level-ups.

**What changed.** Nothing about how much XP a run earns — that is set by
`xpPerKill` — only where the thresholds fall. At the observed 63% rate every
region now buys a level on its ordinary floors before its arena floor
(L1→2, 2→4, 4→5, 6→7, 7→8), and a 10-floor victory pays out three.

**The incentive is in the slope.** A run that fights its floors meets the final
guardian near level 8 — 156 max HP and 19 attack, tracking the 1.6x enemy HP
and +4 attack it is walking into. One that runs the stairs and fights only
guardians arrives at level 4, deliberately under-scaled. Two tests in
`tests/engine.test.ts` score this off `REGIONS` and `xpPerKill` rather than
typed totals, so changing a species or an enemy count re-scores the curve.

Depends on 10b. Files: `src/core/game.ts`. Scope: S.

### ~~11. Armor modifiers~~ — shipped

Armor is a three-step ladder and then it is over. `ARMOR_TIERS` hands out Padded
Vest, Scrap Plating, then Warden Carapace by floor, each strictly better than the
last and each carrying exactly one stat (`defense`). Once the Carapace is on
around floor 4, armor stops being a decision for the rest of a 25-floor run, and
every later piece on the ground is an obvious decline.

Give each piece a **rolled modifier** alongside `defense`, so a deeper find is a
different trade rather than a bigger number — the question becomes "which armor
suits this region" instead of "is this one higher". Rolling on the piece rather
than on the tier is the whole point: two Warden Carapaces should not be the same
Carapace.

Candidates, all expressible against systems that already exist:

- **shift-facing** — reduced fallout damage, or a telegraph that lands a turn earlier
- **pressure-facing** — slower shift-countdown decay, or immunity to one region hazard
- **economy-facing** — a coin-find bonus, or cheaper shop stock
- **risk-facing** — more defense bought against a longer ability cooldown

The comparison prompt is the feature. `pendingArmorOffer` already exists for the
swap decision, but it currently compares one number; with modifiers it has to
show what is being *lost* as well as gained, or the roll is invisible.

Done when: armor carries at least one rolled modifier, the swap prompt names what
is gained and lost, each effect is applied through the system it modifies rather
than special-cased inside `damagePlayer`, and a rolled modifier survives
save/resume.

Pairs with 9 — both add depth to the equipment slot and share the comparison
plumbing. If only one gets built, do 9 first; weapons have no depth at all today,
whereas armor at least has a ladder.

Depends on 4b for the hazard-facing rolls; the rest depend on nothing unbuilt.
Files: `src/core/state.ts`, `src/core/game.ts`, `src/core/damage.ts`,
`src/core/engine.ts`, `src/ui/hud.ts`. Scope: M.

**Shipped**: six modifiers in `src/core/armorModifiers.ts`, rolled per piece in
`createArmor` — Bulwark (shoves an attacker 1-2 tiles back), Thorned (returns 2-5
damage), Bracing (20-40% off shift fallout), Ballast (holds off 1-2 pressure
tiers), Prospecting (1-2 extra coins per kill and per pile), Ponderous (2-3
defense bought with as many turns of Fallout Shield recharge). Each is read by the
system it modifies — `shiftInterval`, `applyFalloutDamage`, `useAbility`, the
enemy turn — and `damagePlayer` gained no branch. Thorns routes through the same
`damageEnemy` the player's own swing uses, so a thorns kill pays the same XP and
coins in the same words.

The roll draws from a stream derived from the floor generator rather than the
generator itself. Two draws taken from the main stream re-phase everything the
floor rolls after them, which moved the completability bot's median depth from 6
to 5 without changing a rule — see the comment on `createArmor`.

**Not implemented from the candidate list**, so it is not lost: an *earlier
telegraph* (the shift-facing alternative to reduced fallout — the telegraph is
plan-time rehearsal keyed on exact `shiftCountdown` values, so moving it a turn
earlier is a change to the rehearsal schedule, not a modifier read), *immunity to
one region hazard* (the pressure-facing alternative to slower decay — hazards are
inline `if` blocks with no table to key an immunity off, and this is the one
candidate the roadmap marks as depending on 4b), and *cheaper shop stock* (the
economy-facing alternative to a coin bonus — stock is priced once when it is
rolled, at boss death, so a piece worn afterwards could not affect it without
moving pricing to open time).

### 12. Chests

Floor coins are now a deliberate trickle — a pile is 1-3 coins and a whole floor
scatters two or three of them. That makes the ground read cleanly, but it also
means nothing on a floor is worth a detour. A chest is the thing worth the
detour.

Chests are **rarer than coin piles and distinct from them**: not every floor has
one, they are a separate glyph, and opening one is an action rather than a
walk-over pickup. What is inside is rolled when the floor is built, not when the
chest is opened — the same reason shop stock is rolled once in 6b, or a player
saves and reloads until the roll suits them.

Contents, one per chest:

- **a larger coin sum** — 3-5, several piles' worth in one place, so the chest is
  felt against the trickle rather than lost in it
- **a special item** — a consumable off the loot pool, or a piece the floor's
  `ARMOR_TIERS` step would not otherwise hand out

Pairs with the coin rescale: the trickle is what makes a chest legible as a
find, and the chest is what makes exploring a floor pay instead of beelining the
stairs. Neither half works alone — small coins with nothing else to look for is
just a poorer floor.

Done when: chests spawn on a fraction of normal floors, opening one costs a turn
and yields exactly one rolled reward, an already-looted chest reads as spent at a
glance on the map — a distinct glyph or colour, not a log line the player has to
remember — contents are fixed at floor build time and survive save/resume, and an
unopened chest is still unopened after a shift moves the geometry around it.

Depends on 6a. Pairs with 9 and 11 if the item roll is to include equipment.
Files: `src/core/state.ts`, `src/core/game.ts`, `src/core/engine.ts`,
`src/render/canvasRenderer.ts`. Scope: M.

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

Constraint: the game is a PWA with no backend — static files, saves in
IndexedDB, and a network-first service worker (`public/sw.js`) that keeps a
cache so the game still opens with no signal once it has been loaded online at
least once. Anything requiring a server or a store account is a much bigger
change than it looks.
