# Jam Polish Implementation Plan

> **For agentic workers:** Use the `scoped-delivery` skill for task chunks. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship Chests, Weapon Types, feel polish, title screen particles, and boss-fight clarity in 5 days for the "unstable" game jam.

**Architecture:** Everything follows existing patterns — `FloorMap.drops[]` for placed items, `GameState` for per-floor state, `dispatchAction` as the only state mutation path, render in `canvasRenderer.ts`. No new subsystems.

**Tech Stack:** TypeScript 5 strict, Vite 5, Vitest, canvas renderer, vanilla DOM HUD.

---

## Global Constraints

- Every change must pass `npx tsc --noEmit`, `npm test`, and `npm run build`.
- The only state mutation path is `dispatchAction` in `engine.ts` — no direct writes.
- No new npm dependencies.
- All seeded RNG goes through `SeededRNG`, never `Math.random()`.
- Everything that changes how a floor reads or plays must survive save/resume.
- Follow existing patterns (look at `state.ts` types, `game.ts` generation, `engine.ts` dispatch, `hud.ts` UI patterns).

---

### Task 1: Chests — Floor loot containers

**Files:**
- Modify: `src/core/state.ts` — add `Chest` type, add `chests` to `FloorMap`
- Modify: `src/core/game.ts` — place chests in `populateFloor`
- Modify: `src/core/engine.ts` — `OPEN_CHEST` action
- Modify: `src/ui/hud.ts` — chest-open prompt
- Modify: `src/ui/controls.ts` — bind chest interaction
- Modify: `src/render/canvasRenderer.ts` — draw chest glyph (unopened/looted)
- Modify: `src/ui/glyphLegend.ts` — add chest to legend
- Test: `tests/chests.test.ts`

**Interfaces:**
- Consumes: `SeededRNG`, `ItemDrop`, `FloorMap`, `GameState`, `dispatchAction`
- Produces: `Chest { id, position, contents, looted }` type, `OPEN_CHEST` action, chest rendering

- [ ] **Step 1: Define Chest type**

Add to `src/core/state.ts`:
```typescript
export interface Chest {
  id: string;
  position: Position;
  contents: Item;
  looted: boolean;
}
```
Add `chests: Chest[]` to `FloorMap`.

- [ ] **Step 2: Test chest type basics**

Create `tests/chests.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/core/game';
import { SHORT } from '../src/core/runConfig';

describe('chests', () => {
  it('some floors have chests', () => {
    // Run several seeds, check at least one spawns a chest
    let seen = false;
    for (let i = 0; i < 20; i++) {
      const game = createNewGame(`chest-test-${i}`, SHORT);
      if (game.floorMap.chests?.length) { seen = true; break; }
    }
    expect(seen).toBe(true);
  });

  it('a chest is not looted when placed', () => {
    // Find a seed with a chest, check looted is false
    let game = createNewGame('chest-looted-test', SHORT);
    // May need a few seeds
    expect(true).toBe(true); // placeholder
  });
});
```

- [ ] **Step 3: Place chests in populateFloor**

In `src/core/game.ts`, after placing drops and armor, add chest placement:
- ~30-50% of non-boss floors get one chest
- Picks an unoccupied walkable tile via `take()`
- Contents rolled from: coin sum (3-5), or a LOOT_POOL consumable, or an armor piece one tier above the floor's current tier
- Coins: `createCoinCache(rng.randomInt(3, 5), id)`
- Consumable: `createItem(LOOT_POOL[rng.randomInt(0, LOOT_POOL.length - 1)], id)`
- Equipment: `createArmor(armorForLevel(level + 1), id, rng)` (one tier ahead, but cap at warden_carapace)

```typescript
// Inside populateFloor, after armor placement:
const chests: Chest[] = [];
if (!isBossFloor && rng.random() < 0.4) {
  const pos = take();
  if (pos) {
    const contents = rollChestContents(rng, level);
    chests.push({ id: `chest_${level}`, position: pos, contents, looted: false });
  }
}
```

- [ ] **Step 4: OPEN_CHEST action**

In `engine.ts`, add to `GameAction`:
```typescript
| { type: 'OPEN_CHEST'; chestId: string }
```

In `dispatchAction`, handle `OPEN_CHEST`:
- Find the chest by id on `state.floorMap.chests`
- If already looted, return null (no-op)
- Mark `looted = true`
- Add contents to drops at the player's position (or directly to inventory if consumable/armor)
- Spend a turn (`state.turnCount++`, `state.floorTurns++`)

- [ ] **Step 5: Chest interaction in controls and HUD**

In `controls.ts`, add chest interaction similar to how armor pickup works — when player is adjacent to a chest, pressing Enter/action opens it.

In `hud.ts`, a brief prompt when walking next to a chest.

- [ ] **Step 6: Render chests**

In `canvasRenderer.ts`:
- Unopened: `C` glyph (cyan/amber)
- Looted: `c` glyph (dim grey) or open outline

- [ ] **Step 7: Glyph legend**

Update `glyphLegend.ts` with chest entry.

- [ ] **Step 8: Save/resume test**

Chests ride on `FloorMap` which gets saved/restored with the full state. Verify that a looted chest stays looted after save/resume.

- [ ] **Step 9: Run all tests**

`npx tsc --noEmit && npm test && npm run build`

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: chests — lootable containers on floors"
```

---

### Task 2: Weapon types — Ranged and heavy melee

**Files:**
- Modify: `src/core/state.ts` — `ItemType` and `Item` for weapons, `Player.weapon`
- Modify: `src/core/game.ts` — `ITEM_TABLE`, weapon generation, `createWeapon`
- Modify: `src/core/engine.ts` — attack range logic, weapon comparison
- Modify: `src/ui/hud.ts` — weapon display, comparison prompt
- Modify: `src/render/canvasRenderer.ts` — arrow glyph for ranged attack
- Test: `tests/weapons.test.ts`

**Interfaces:**
- Consumes: `Enemy`, `Position`, `manhattan`, `armorForLevel`, `SeededRNG`
- Produces: Weapon items, `Player.weapon`, attack range from weapon, compare prompt

- [ ] **Step 1: Define weapon types and Player.weapon**

In `state.ts`, add to `ItemType`:
```typescript
| 'short_blade' | 'war_axe' | 'longbow'
```

Add `weapon: Item | null` to `Player` interface.

Add `range?: number` and `damageBonus?: number` to `Item` (optional, weapon-only fields).

- [ ] **Step 2: Add weapons to ITEM_TABLE**

In `game.ts`:
```typescript
short_blade: {
  type: 'short_blade', name: 'Short Blade',
  description: 'A quick blade. No range bonus, no damage penalty.',
  category: 'weapon',
},
war_axe: {
  type: 'war_axe', name: 'War Axe',
  description: 'Heavy axe. +4 damage, but no ranged attack.',
  category: 'weapon', damageBonus: 4,
},
longbow: {
  type: 'longbow', name: 'Longbow',
  description: 'Ranged weapon. Attack any visible enemy up to 6 tiles away.',
  category: 'weapon', range: 6,
},
```

Add `category: 'weapon'` to `Item['category']` union type.

The existing `attackPower: 12` on Player is the base; weapons modify it or enable ranged.

- [ ] **Step 3: Weapon generation**

`createWeapon(type, id, rng)` — simple, no modifiers (unlike armor).

Place like armor: one weapon per N floors, rolling the pool. Or start the player with Short Blade and find upgrades.

- [ ] **Step 4: Ranged attack in engine**

In `dispatchAction -> MOVE` (or a new `ATTACK` action), when the player has a ranged weapon:
- If weapon has `range`, find nearest enemy within range + line of sight
- Allow attacking by moving toward a far enemy (tap-to-travel route + fire when in range)

Simpler approach: when the player has a `longbow`, the `MOVE` action into a direction that has an enemy within range does the ranged attack instead of moving. Range check: `manhattan(player, enemy) <= weapon.range` and line of sight exists.

Or: add `RANGED_ATTACK` action targeting a direction, fires at the first enemy in that direction within range.

- [ ] **Step 5: Melee weapon damage bonus**

In `dispatchAction -> MOVE` (melee attack path), if `player.weapon?.damageBonus`, add it to the attack roll.

- [ ] **Step 6: Weapon display in HUD**

Show current weapon name in the HUD. Comparison prompt when walking over a weapon on the floor (same pattern as `pendingArmorOffer` but for weapons).

- [ ] **Step 7: Tests**

```typescript
describe('weapons', () => {
  it('war axe adds damage bonus to melee attacks');
  it('longbow allows attacking at range');
  it('player starts with a short blade');
  it('weapon comparison prompt shows when walking over a weapon');
});
```

- [ ] **Step 8: Run all tests and commit**

```bash
npx tsc --noEmit && npm test && npm run build
git add -A && git commit -m "feat: weapon types — ranged and heavy melee"
```

---

### Task 3: Feel polish — Hit-stop, kill flash, pickup feedback, hotbar highlight

**Files:**
- Modify: `src/render/canvasRenderer.ts` — hit-stop, kill flash, pickup rising name
- Modify: `src/ui/hud.ts` — hotbar highlight on pickup
- Modify: `src/main.ts` — piped effects timing
- Modify: `src/core/engine.ts` — expose `lastKillPosition` and `lastPickupItem` on state

- [ ] **Step 1: Hit-stop on kill**

When a kill happens (in `settleDeaths` or the attack path), set `state.lastKillPosition` and a hit-stop timer. The render loop pauses briefly (2-3 frames at 16ms = ~50ms) — short enough to feel, long enough to register. Same pattern as `lastShiftChanges`: a temporary effect state cleared at the top of the next dispatch.

- [ ] **Step 2: Flash on struck glyph**

When an enemy takes damage, set `state.lastStruckPositions: Position[]`. The renderer draws a brief bright flash (white overlay) on those tiles that fades over 2-3 frames. Same lifecycle as hit-stop.

- [ ] **Step 3: Pickup name rising**

When the player walks over a coin pile or item, store `state.lastPickup: { name: string; position: Position } | null`. The renderer draws the name floating up from the tile position over ~0.5s and fading. Same particle-like lifecycle mechanic — frame callback keeps markDirty while active.

- [ ] **Step 4: Hotbar slot highlight**

When an item enters inventory (from pickup or chest), briefly flash/glow the hotbar slot it landed in. Use CSS class toggle on the slot — add `hotbar-slot--just-picked` for 3 frames, then remove.

- [ ] **Step 5: Tests**

```typescript
describe('combat feel', () => {
  it('hit-stop pauses briefly on kill');
  it('struck glyph flash renders on damage');
});
```

- [ ] **Step 6: Run all tests and commit**

```bash
npx tsc --noEmit && npm test && npm run build
git add -A && git commit -m "feat: combat feel — hit-stop, kill flash, pickup name, hotbar highlight"
```

---

### Task 4: Title screen particles — World-breaking-apart ambient effect

**Files:**
- Modify: `src/render/canvasRenderer.ts` — title screen particles draw
- Modify: `src/ui/titleScreen.ts` — trigger particles
- Modify: `src/styles/main.css` — particle container/canvas

- [ ] **Step 1: Particle system for title screen**

Reuse the existing `ParticleSystem` pattern from the game renderer (look for `ParticleSystem`, `particles.ts`, or the particle type in render). Create a title-screen particle effect:
- Small fragments/debris sliding down from the top of the screen
- Different sizes and fall speeds, like reality flaking apart
- Colored to match the title screen palette (dark tones, occasional amber/cyan glints)
- Loop continuously, no interaction needed

- [ ] **Step 2: Wire into title screen**

When the title screen mounts, start the particle loop. Stop it when the player starts a run.

- [ ] **Step 3: Test and commit**

```bash
npx tsc --noEmit && npm test && npm run build
git add -A && git commit -m "feat: title screen particles — ambient world-breaking effect"
```

---

### Task 5: Boss fight clarity — Telegraphs, tooltips, and better feedback

**Files:**
- Modify: `src/core/engine.ts` — boss action descriptions
- Modify: `src/ui/hud.ts` — boss nameplate, telegraph explanation
- Modify: `src/render/canvasRenderer.ts` — boss telegraph highlights
- Modify: `src/ui/glyphLegend.ts` — boss marker key

- [ ] **Step 1: Boss nameplate in HUD**

When on an arena floor, show a persistent boss nameplate with:
- Boss name and current HP bar
- Next ability countdown (how many turns until the boss's special attack)

- [ ] **Step 2: Tooltips for boss telegraphs**

The boss marks tiles before attacking (already exists per CLAUDE.md — `BOSS_MARKS`). Add:
- A brief HUD tooltip when the mark first appears: "[Boss] is gathering energy..." / "...the mark shimmers" type text in the log
- The mark's effect type per boss: "Mark: rift strike (dodge by moving)" / "Mark: glass fault (avoid the marked tile)"

- [ ] **Step 3: Telegraph visual clarity**

Boss mark tiles already render differently. Enhance with:
- A pulsing animation on marked tiles (brighter on telegraph turn, dimmer otherwise)
- Color-coded marks per boss (Rift Regent = purple rift, Prism Refractor = glass-white, Null Testament = inverted)

- [ ] **Step 4: Opening splash for each boss**

When entering an arena floor, show a brief name banner: "[Boss Name] bars your path." (Reuse the overlay pattern from `openingSplash.ts`)

- [ ] **Step 5: Test and commit**

```bash
npx tsc --noEmit && npm test && npm run build
git add -A && git commit -m "feat: boss fight clarity — nameplate, tooltips, telegraph enhancements"
```

---

### Task 6: Itch.io page + jam submission

**Files:**
- Create: `docs/jam/itchio-description.md`
- Create: `docs/jam/screenshot-guide.md`

- [ ] **Step 1: Itch.io description**

Written by subagent. Cover: theme (unstable), premise (descend into a fragmenting reality), key mechanics (shifting dungeon, the Pursuer, 5 regions, 5 bosses), classes, controls. Tag line: "The dungeon shifts. The walls move. Reality is unstable — and so is the ground you're standing on."

- [ ] **Step 2: Screenshots**

After features land, run the game dev server, capture browser screenshots of:
- Title screen
- First floor gameplay (HUD visible)
- A shift telegraph (tiles marked)
- A boss arena
- The shop
- The Pursuer visible on map
- Chest interaction

- [ ] **Step 3: Submit to jam**

Upload zip to https://itch.io/jam/do-you-wanna-jam-2026