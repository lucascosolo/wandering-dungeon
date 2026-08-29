# Rift Shard Escape Mechanic Implementation Plan

> **For agentic workers:** if this plan has more than ~4 tasks, use the `scoped-delivery` skill to implement it in 1-3 task chunks via fresh subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the player a consumable ("Rift Shard") that blinks them up to 5 tiles down the shortest path to the stairs — landing past an enemy standing on it — with a fallback that blinks away from danger when no path exists, and a guaranteed free grant when the player is truly cornered (exit sealed, Pursuer adjacent, 0 charges held).

**Architecture:** One new `ItemType`/category, one pure effect function in `itemEffects.ts` wired into the existing `USE_ITEM` switch, one guard function called once per turn from `dispatchAction`'s existing turn-resolution block, and a small hotbar visibility change so the item can never go unnoticed. No new action types, no new subsystems.

**Tech Stack:** TypeScript, Vitest, Vite. No new npm dependencies.

## Global Constraints

- Every change must pass: `npx tsc --noEmit && npx vitest run && npx vite build`.
- Use `SeededRNG`, never `Math.random()`, for any randomness. (None of this feature needs randomness — the effect logic is fully deterministic.)
- All state mutations go through `dispatchAction`.
- No new npm dependencies.
- Follow existing patterns (see each task's file references for the pattern being extended).

Design reference: `docs/superpowers/specs/2026-08-29-rift-shard-escape-design.md` (approved).

---

### Task 1: Register the Rift Shard item type

**Files:**
- Modify: `src/core/state.ts` (the `ItemType` union at lines 104-112, and the `Item.category` union at line 141)
- Modify: `src/core/game.ts` (`ITEM_TABLE` at lines 76-155, `LOOT_POOL` at lines 172-179)
- Test: `tests/riftShard.test.ts` (new file)

**Interfaces:**
- Produces: the item type literal `'rift_shard'` (usable anywhere `ItemType` is accepted), and the category literal `'displacement'`. `createItem('rift_shard', id)` (already generic, `src/core/game.ts:183-185`) becomes callable with this type.

- [ ] **Step 1: Write the failing test**

Create `tests/riftShard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createItem } from '../src/core/game';

describe('Rift Shard', () => {
  it('is a registered item type with the displacement category', () => {
    const item = createItem('rift_shard', 'rift_test');
    expect(item.type).toBe('rift_shard');
    expect(item.category).toBe('displacement');
    expect(item.name).toBe('Rift Shard');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/riftShard.test.ts`
Expected: FAIL — TypeScript error, `'rift_shard'` is not assignable to type `ItemType` (or the item table has no such key).

- [ ] **Step 3: Add the type and category**

In `src/core/state.ts`, extend the `ItemType` union (lines 104-112):

```typescript
export type ItemType =
  | 'stasis_flask'
  | 'hourglass_shard'
  | 'haste_sigil'
  | 'rewind_scroll'
  | 'rift_shard'
  | 'health_potion'
  | 'coin_cache'
  | ArmorType
  | WeaponType;
```

Extend the `Item.category` union (line 141):

```typescript
category: 'stabilization' | 'destabilization' | 'displacement' | 'consumable' | 'armor' | 'currency' | 'weapon';
```

- [ ] **Step 4: Add the item table entry and loot pool entry**

In `src/core/game.ts`, add to `ITEM_TABLE` (after the `rewind_scroll` entry, before `health_potion`, lines 95-101):

```typescript
  rift_shard: {
    type: 'rift_shard',
    name: 'Rift Shard',
    description: 'Blinks you up to 5 tiles down the path to the stairs, past anything standing on it — or away from danger if no path exists.',
    category: 'displacement',
  },
```

Add to `LOOT_POOL` (line 172-179), as a rarer entry than the other four (they each appear once; `health_potion` appears twice to be common — `rift_shard` should appear once, same weight as the other non-potion items, since rarity tuning beyond "not as common as potions" isn't warranted until playtesting says otherwise):

```typescript
const LOOT_POOL: ItemType[] = [
  'health_potion',
  'health_potion',
  'stasis_flask',
  'hourglass_shard',
  'haste_sigil',
  'rewind_scroll',
  'rift_shard',
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/riftShard.test.ts`
Expected: PASS

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (This confirms the two new union members don't break any exhaustive-looking switch elsewhere — there are none today; every existing `item.category ===` check is a plain equality against `'armor'`/`'currency'`/`'weapon'`, and anything else already falls through to the generic "add to inventory" branch, per `src/core/engine.ts:287-303` and `:449-501`.)

- [ ] **Step 7: Commit**

```bash
git add src/core/state.ts src/core/game.ts tests/riftShard.test.ts
git commit -m "$(cat <<'EOF'
feat: register Rift Shard item type

Adds the item type and a new 'displacement' category ahead of wiring
its actual blink effect in the next commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AuKKKzVXpcmTaupBLVEKHN
EOF
)"
```

---

### Task 2: Rift Shard effect — jump along the exit path

**Files:**
- Modify: `src/core/items/itemEffects.ts`
- Test: `tests/riftShard.test.ts`

**Interfaces:**
- Consumes: `findPath(map: FloorMap, start: Position, end: Position): Position[] | null` from `src/core/map/pathfinding.ts:14` (returns the path *including* the start tile at index 0). `GameState`, `Position`, `manhattan`, `samePosition` from `src/core/state.ts`. `createMockEnemy(position, type?)` and `createMockGameState(seed?)` from `tests/helpers.ts` for tests.
- Produces: `export function applyRiftShard(state: GameState): string[]` — mutates `state.player.position` and returns event-log lines, following the exact contract of `applyStasisFlask`/`applyHasteSigil`/etc. already in this file. Also produces two file-local helpers used again in Task 3: `isWalkableTile(state, pos): boolean` and `entityAt(state, pos): Enemy | undefined`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/riftShard.test.ts`:

```typescript
import { applyRiftShard } from '../src/core/items/itemEffects';
import { createMockGameState, createMockEnemy } from './helpers';

describe('Rift Shard — jump along the exit path', () => {
  it('blinks up to 5 tiles down the shortest path to the exit, past an enemy standing on it', () => {
    const state = createMockGameState('rift-jump-basic');
    const { width, height, tiles } = state.floorMap;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) tiles[y][x].type = 'wall';
    }
    const y = state.player.position.y;
    const startX = state.player.position.x;
    for (let i = 0; i < 8 && startX + i < width; i++) {
      tiles[y][startX + i].type = 'floor';
    }
    state.floorMap.exit = { x: startX + 7, y };
    state.entities = [createMockEnemy({ x: startX + 3, y }, 'pursuer')];

    const events = applyRiftShard(state);

    expect(state.player.position).toEqual({ x: startX + 5, y });
    expect(events[0]).toMatch(/blink/i);
  });

  it('lands short of the jump distance if the target tile itself is occupied', () => {
    const state = createMockGameState('rift-jump-blocked-landing');
    const { width, height, tiles } = state.floorMap;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) tiles[y][x].type = 'wall';
    }
    const y = state.player.position.y;
    const startX = state.player.position.x;
    for (let i = 0; i < 8 && startX + i < width; i++) tiles[y][startX + i].type = 'floor';
    state.floorMap.exit = { x: startX + 7, y };
    state.entities = [createMockEnemy({ x: startX + 5, y }, 'pursuer')];

    applyRiftShard(state);

    expect(state.player.position).toEqual({ x: startX + 4, y });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/riftShard.test.ts`
Expected: FAIL — `applyRiftShard` is not exported / does not exist.

- [ ] **Step 3: Implement the effect**

In `src/core/items/itemEffects.ts`, add the import and the function:

```typescript
import { GameState, Position, manhattan, samePosition } from '../state';
import { findPath } from '../map/pathfinding';

const RIFT_SHARD_RANGE = 5;

function isWalkableTile(state: GameState, pos: Position): boolean {
  const { floorMap } = state;
  if (pos.x < 0 || pos.x >= floorMap.width || pos.y < 0 || pos.y >= floorMap.height) return false;
  const type = floorMap.tiles[pos.y][pos.x].type;
  return type === 'floor' || type === 'door' || type === 'stairs_down';
}

function entityAt(state: GameState, pos: Position) {
  return state.entities.find(e => e.hp > 0 && samePosition(e.position, pos));
}

/**
 * Apply Rift Shard: blink up to RIFT_SHARD_RANGE tiles along the shortest path
 * to the stairs, landing past any enemy standing on it — a teleport isn't
 * blocked by an occupied tile the way a normal step is. If the exact target
 * tile is occupied, land on the nearest open tile short of it instead of
 * refusing outright.
 */
export function applyRiftShard(state: GameState): string[] {
  const { player, floorMap } = state;

  const path = findPath(floorMap, player.position, floorMap.exit);
  if (path && path.length > 1) {
    const targetIndex = Math.min(RIFT_SHARD_RANGE, path.length - 1);
    for (let i = targetIndex; i >= 1; i--) {
      const candidate = path[i];
      if (entityAt(state, candidate)) continue;
      player.position = { x: candidate.x, y: candidate.y };
      return [`You crack the dungeon open and blink ${i} tiles down the path to the stairs.`];
    }
  }

  return applyRiftShardFallback(state);
}
```

Leave `applyRiftShardFallback` as a stub that returns `['The Rift Shard crumbles uselessly — there is nowhere to go.']` for now — Task 3 replaces it with the real fallback. Add the stub in the same file, right after `applyRiftShard`:

```typescript
function applyRiftShardFallback(state: GameState): string[] {
  return ['The Rift Shard crumbles uselessly — there is nowhere to go.'];
}
```

Wire it into the `USE_ITEM` switch (the `switch (item.type)` block, after the `rewind_scroll` case, before `health_potion`):

```typescript
    case 'rift_shard':
      events = applyRiftShard(state);
      break;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/riftShard.test.ts`
Expected: PASS (both new tests, and Task 1's test still passes)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/core/items/itemEffects.ts tests/riftShard.test.ts
git commit -m "$(cat <<'EOF'
feat: Rift Shard blinks the player along the path to the exit

Jumps up to 5 tiles down the shortest route to the stairs, landing
past any enemy standing on it. The no-path fallback is stubbed for
the next commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AuKKKzVXpcmTaupBLVEKHN
EOF
)"
```

---

### Task 3: Rift Shard effect — fallback when no exit path exists

**Files:**
- Modify: `src/core/items/itemEffects.ts` (replaces the `applyRiftShardFallback` stub from Task 2)
- Test: `tests/riftShard.test.ts`

**Interfaces:**
- Consumes: `isWalkableTile` and `entityAt` from Task 2 (same file, already file-local). `manhattan` from `src/core/state.ts` (already imported in this file per Task 2).
- Produces: the real `applyRiftShardFallback(state: GameState): string[]`, replacing the Task 2 stub. No new exports — `applyRiftShard` (Task 2's export) is the only public entry point and its behavior is unchanged when a path exists.

- [ ] **Step 1: Write the failing test**

Append to `tests/riftShard.test.ts`:

```typescript
describe('Rift Shard — fallback when no exit path exists', () => {
  it('blinks to the reachable tile that maximizes distance from the Pursuer', () => {
    const state = createMockGameState('rift-fallback');
    const { width, height, tiles } = state.floorMap;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) tiles[y][x].type = 'wall';
    }
    const y = state.player.position.y;
    const startX = state.player.position.x;
    const corridor = [0, 1, 2, 3].map(i => startX + i).filter(x => x < width);
    for (const x of corridor) tiles[y][x].type = 'floor';
    // A different row than the corridor, so it's still 'wall' from the fill above —
    // guarantees findPath has no route to it regardless of column.
    state.floorMap.exit = { x: 0, y: (y + 1) % height };
    state.entities = [createMockEnemy({ x: corridor[1], y }, 'pursuer')];

    const events = applyRiftShard(state);

    expect(state.player.position).toEqual({ x: corridor[corridor.length - 1], y });
    expect(events[0]).not.toMatch(/crumbles/i);
  });

  it('reports no effect when truly nowhere to go', () => {
    const state = createMockGameState('rift-nowhere');
    const { width, height, tiles } = state.floorMap;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) tiles[y][x].type = 'wall';
    }
    const y = state.player.position.y;
    const x = state.player.position.x;
    tiles[y][x].type = 'floor';
    state.floorMap.exit = { x, y: (y + 1) % height };

    const events = applyRiftShard(state);

    expect(state.player.position).toEqual({ x, y });
    expect(events[0]).toMatch(/crumbles/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/riftShard.test.ts`
Expected: FAIL — the first new test fails because the Task 2 stub never moves the player; the second passes already (the stub happens to satisfy it), which is fine, TDD only requires the newly-meaningful assertion to fail.

- [ ] **Step 3: Implement the real fallback**

Replace the stub in `src/core/items/itemEffects.ts`:

```typescript
const CARDINAL_STEPS: [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** Every walkable tile reachable from `origin` within `radius` steps. */
function reachableWithin(state: GameState, origin: Position, radius: number): Position[] {
  const seen = new Set<string>([`${origin.x},${origin.y}`]);
  let frontier: Position[] = [origin];
  const out: Position[] = [];

  for (let step = 0; step < radius; step++) {
    const next: Position[] = [];
    for (const pos of frontier) {
      for (const [dx, dy] of CARDINAL_STEPS) {
        const candidate = { x: pos.x + dx, y: pos.y + dy };
        const key = `${candidate.x},${candidate.y}`;
        if (seen.has(key) || !isWalkableTile(state, candidate)) continue;
        seen.add(key);
        out.push(candidate);
        next.push(candidate);
      }
    }
    frontier = next;
  }

  return out;
}

/**
 * No path to the exit exists (or every step of it is occupied) — blink
 * instead to the reachable tile that puts the most distance between the
 * player and the Pursuer, so the shard never fizzles with no effect.
 */
function applyRiftShardFallback(state: GameState): string[] {
  const { player } = state;
  const pursuer = state.entities.find(e => e.enemyType === 'pursuer' && e.hp > 0);
  const candidates = reachableWithin(state, player.position, RIFT_SHARD_RANGE).filter(
    pos => !entityAt(state, pos)
  );

  let best: Position | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = pursuer
      ? manhattan(candidate, pursuer.position)
      : manhattan(candidate, player.position);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (best) {
    player.position = best;
    return ['You crack the dungeon open and blink away through the fracture.'];
  }

  return ['The Rift Shard crumbles uselessly — there is nowhere to go.'];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/riftShard.test.ts`
Expected: PASS (all Rift Shard tests so far)

- [ ] **Step 5: Full verification**

Run: `npx tsc --noEmit && npx vitest run`
Expected: everything passes, no regressions in the rest of the suite

- [ ] **Step 6: Commit**

```bash
git add src/core/items/itemEffects.ts tests/riftShard.test.ts
git commit -m "$(cat <<'EOF'
feat: Rift Shard falls back to blinking away from the Pursuer

Covers the mid-seal case where no path to the exit exists yet — the
shard now always does something useful instead of fizzling.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AuKKKzVXpcmTaupBLVEKHN
EOF
)"
```

---

### Task 4: Guaranteed emergency grant when cornered

**Files:**
- Modify: `src/core/engine.ts`
- Test: `tests/riftShard.test.ts`

**Interfaces:**
- Consumes: `hasValidPath(map: FloorMap, start: Position, end: Position): boolean` from `src/core/map/pathfinding.ts:114` (add to the existing `import { findPath } from './map/pathfinding'` at `src/core/engine.ts:30`, making it `import { findPath, hasValidPath } from './map/pathfinding';`). `createItem` (already imported from `./game`, `src/core/engine.ts:34`). The file-local `addToInventory(state: GameState, item: Item): void` (`src/core/engine.ts:275-283`, already defined, stacks by `type`+`category`).
- Produces: a file-local `grantEmergencyRiftShard(state: GameState, events: string[]): void`, called once per turn from inside `dispatchAction`'s existing turn-resolution block.

- [ ] **Step 1: Write the failing tests**

Append to `tests/riftShard.test.ts`:

```typescript
import { dispatchAction } from '../src/core/engine';

describe('Rift Shard — guaranteed emergency grant', () => {
  it('grants a free Rift Shard exactly once when the exit is sealed and the Pursuer is adjacent', () => {
    const state = createMockGameState('rift-emergency');
    const { width, height, tiles } = state.floorMap;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) tiles[y][x].type = 'wall';
    }
    const py = state.player.position.y;
    const px = state.player.position.x;
    tiles[py][px].type = 'floor';
    state.floorMap.exit = { x: px, y: (py + 1) % height };
    state.entities = [createMockEnemy({ x: px + 1, y: py }, 'pursuer')];

    dispatchAction(state, { type: 'WAIT' });

    const shards = state.player.inventory.filter(i => i.type === 'rift_shard');
    expect(shards).toHaveLength(1);
    expect(shards[0].count ?? 1).toBe(1);
    expect(state.eventLog.some(e => e.text.includes('one way out'))).toBe(true);

    dispatchAction(state, { type: 'WAIT' });

    const shardsAfter = state.player.inventory.filter(i => i.type === 'rift_shard');
    expect(shardsAfter).toHaveLength(1);
    expect(shardsAfter[0].count ?? 1).toBe(1);
  });

  it('does not grant when a path to the exit exists', () => {
    const state = createMockGameState('rift-emergency-has-path');
    const px = state.player.position.x;
    const py = state.player.position.y;
    state.entities = [createMockEnemy({ x: px + 1, y: py }, 'pursuer')];

    dispatchAction(state, { type: 'WAIT' });

    expect(state.player.inventory.some(i => i.type === 'rift_shard')).toBe(false);
  });

  it('does not grant when the Pursuer has not yet closed to adjacent', () => {
    const state = createMockGameState('rift-emergency-not-adjacent');
    const { width, height, tiles } = state.floorMap;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) tiles[y][x].type = 'wall';
    }
    const py = state.player.position.y;
    const px = state.player.position.x;
    // A sealed pocket, same shape as the Task 3 fallback test, but with the
    // Pursuer starting 3 tiles off instead of 1 — it closes one step per
    // turn along this corridor, so after a single WAIT it's at distance 2,
    // not yet adjacent.
    const corridor = [0, 1, 2, 3].map(i => px + i).filter(x => x < width);
    for (const x of corridor) tiles[py][x].type = 'floor';
    state.floorMap.exit = { x: 0, y: (py + 1) % height };
    state.entities = [createMockEnemy({ x: corridor[corridor.length - 1], y: py }, 'pursuer')];

    dispatchAction(state, { type: 'WAIT' });

    expect(state.player.inventory.some(i => i.type === 'rift_shard')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/riftShard.test.ts`
Expected: the first test FAILs (no grant happens yet); the second and third already pass trivially (nothing grants anything yet) — that's expected, they exist to catch a future regression, not to drive this step.

- [ ] **Step 3: Implement the grant**

In `src/core/engine.ts`, update the pathfinding import (line 30):

```typescript
import { findPath, hasValidPath } from './map/pathfinding';
```

Add the function, near `wakePursuer` (after it, before `advanceClock`, i.e. after line 1116):

```typescript
/**
 * The true last resort: the exit is sealed and the Pursuer has caught up in
 * the same moment, with no Rift Shard in hand to answer it. Silently grants
 * one free charge so this specific combination is never unwinnable by loot
 * luck — checked once per turn, and self-limiting: it only fires while the
 * player holds zero charges, so it cannot re-grant while still cornered.
 */
function grantEmergencyRiftShard(state: GameState, events: string[]): void {
  const pursuer = state.entities.find(e => e.enemyType === 'pursuer' && e.hp > 0);
  if (!pursuer) return;
  if (manhattan(pursuer.position, state.player.position) !== 1) return;

  const held = state.player.inventory
    .filter(i => i.type === 'rift_shard')
    .reduce((sum, i) => sum + (i.count ?? 1), 0);
  if (held > 0) return;

  if (hasValidPath(state.floorMap, state.player.position, state.floorMap.exit)) return;

  addToInventory(state, createItem('rift_shard', `rift_shard_emergency_${state.turnCount}`));
  events.push('The dungeon offers you one way out.');
}
```

Call it in `dispatchAction`'s turn-resolution block (around line 1316-1325), right after `enemyTurns`:

```typescript
  if (consumesTurn(action) && spentTurn && !state.isGameOver && !changedFloor) {
    settleDeaths(state, rng, events);
    enemyTurns(state, rng, events);
    grantEmergencyRiftShard(state, events);
    advanceClock(state, rng, events);
    settleDeaths(state, rng, events);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/riftShard.test.ts`
Expected: PASS (all three new tests, and everything from Tasks 1-3)

- [ ] **Step 5: Full verification**

Run: `npx tsc --noEmit && npx vitest run`
Expected: everything passes, no regressions

- [ ] **Step 6: Commit**

```bash
git add src/core/engine.ts tests/riftShard.test.ts
git commit -m "$(cat <<'EOF'
feat: guarantee a Rift Shard when the exit is sealed and the Pursuer catches up

The one combination that was unwinnable by luck alone now grants a
free charge the instant it happens, once, so survival there is a
matter of using it rather than having found one.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AuKKKzVXpcmTaupBLVEKHN
EOF
)"
```

---

### Task 5: Hotbar visibility — priority slot and pulsing highlight

**Files:**
- Modify: `src/ui/hud.ts` (`hotbarItems` at lines 36-40, `renderHotbar` at lines 453-471)
- Modify: `src/styles/main.css` (after the `.hotbar-slot__count` rule, around line 728)
- Test: `tests/riftShard.test.ts`

**Interfaces:**
- Consumes: `Item`, `GameState` from `src/core/state.ts`. The existing `pulse-bow-sheathed` CSS keyframes (`src/styles/main.css`, added in commit `3cc3729`) — reused as-is, not redefined.
- Produces: `hotbarItems(state: GameState): Item[]` (existing export, behavior changed: a held Rift Shard is always sorted to the front so it can never be pushed out of the visible 4 slots). No new exports.

A held Rift Shard being silently bumped past the 4-slot hotbar window by other items would defeat the entire point of the guaranteed grant in Task 4 — the player could hold the escape and never see it. `hotbarItems` needs to guarantee it's always visible when held.

- [ ] **Step 1: Write the failing test**

Append to `tests/riftShard.test.ts`:

```typescript
import { hotbarItems } from '../src/ui/hud';
// createItem is already imported at the top of this file, from Task 1.

describe('Rift Shard — hotbar visibility', () => {
  it('is always sorted into the visible hotbar, even with 4 other items ahead of it', () => {
    const state = createMockGameState('rift-hotbar-priority');
    state.player.inventory = [
      createItem('stasis_flask', 'a'),
      createItem('hourglass_shard', 'b'),
      createItem('haste_sigil', 'c'),
      createItem('rewind_scroll', 'd'),
      createItem('rift_shard', 'e'),
    ];

    const slots = hotbarItems(state);

    expect(slots).toHaveLength(4);
    expect(slots[0].type).toBe('rift_shard');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/riftShard.test.ts`
Expected: FAIL — `slots[0].type` is `'stasis_flask'`, not `'rift_shard'` (the item falls off the end of the 4-slot window today).

- [ ] **Step 3: Implement priority ordering**

In `src/ui/hud.ts`, replace `hotbarItems` (lines 36-40):

```typescript
export function hotbarItems(state: GameState): Item[] {
  const usable = state.player.inventory.filter(item => item.type !== 'health_potion');
  const priority = usable.filter(item => item.type === 'rift_shard');
  const rest = usable.filter(item => item.type !== 'rift_shard');
  return [...priority, ...rest].slice(0, HOTBAR_SIZE);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/riftShard.test.ts`
Expected: PASS

- [ ] **Step 5: Add the pulsing highlight**

In `src/ui/hud.ts`, update the `renderHotbar` template (lines 461-471) to flag the Rift Shard slot:

```typescript
  ui.hotbar.innerHTML = slots
    .map(
      (item, i) => `
      <button class="hotbar-slot${item.type === 'rift_shard' ? ' hotbar-slot--rift-ready' : ''}" data-item-id="${item.id}" type="button" title="${escapeHtml(item.description)}">
        <span class="hotbar-slot__key">${i + 1}</span>
        <span class="hotbar-slot__name">${escapeHtml(item.name)}</span>
        ${item.count && item.count > 1 ? `<span class="hotbar-slot__count">×${item.count}</span>` : ''}
      </button>`
    )
    .join('');
```

In `src/styles/main.css`, add after the `.hotbar-slot__count` rule (around line 728):

```css
/* Rift Shard: the player's escape from a Pursuer-blocked exit. Same
   treatment as the bow-toggle-sheathed cue — missing this one can be
   fatal, so it pulses on first appearance and keeps a steady glow. */
.hotbar-slot.hotbar-slot--rift-ready {
  background: rgba(255, 179, 77, 0.15);
  border-color: #ffb74d;
  color: #ffb74d;
  animation: pulse-bow-sheathed 1.5s ease-in-out 3;
  box-shadow: 0 0 10px rgba(255, 179, 77, 0.25);
}
```

This reuses the `pulse-bow-sheathed` `@keyframes` already defined in this file (added in commit `3cc3729`) rather than duplicating it.

- [ ] **Step 6: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: everything passes, no regressions. There is no dedicated HUD DOM test in this codebase (none of the existing `tests/*.ts` files exercise `hud.ts`'s rendering against a real DOM), so the markup/CSS change is verified by the type-check and build only — matching this project's existing test coverage boundary. If you want to see it, `npm run dev` and pick up a Rift Shard (or trigger the emergency grant scenario) to confirm the hotbar slot glows amber.

- [ ] **Step 7: Commit**

```bash
git add src/ui/hud.ts src/styles/main.css tests/riftShard.test.ts
git commit -m "$(cat <<'EOF'
fix: make a held Rift Shard impossible to miss in the hotbar

Prioritizes it into the visible 4-slot window regardless of what
else is carried, and gives it the same amber pulse/glow treatment
as the bow-toggle-visibility fix, since this is the item a cornered
player must not fail to notice.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AuKKKzVXpcmTaupBLVEKHN
EOF
)"
```

---

## Final Verification

After all five tasks are complete:

```bash
npx tsc --noEmit && npx vitest run && npx vite build
```

All three must pass with zero errors before this feature is considered done.
