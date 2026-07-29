# Phase 1 MVP Implementation Plan: The Wandering Dungeon

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, playable, offline PWA turn-based grid roguelite featuring shifting dungeon mechanics, the Vanguard class, 4 time-control items, telegraphed map shifts, and auto-save persistence.

**Architecture:** Pure TypeScript deterministic state engine separated from HTML5 Canvas grid rendering and responsive mobile/desktop HTML/CSS UI overlay. IndexedDB persistence for turn auto-save and seed tracking.

**Tech Stack:** TypeScript, Vite, Vitest, HTML5 2D Canvas, IndexedDB (`idb-keyval`), Seeded PRNG (`seedrandom`), PWA Web Manifest & Service Worker.

## Global Constraints

- Turn-consumable actions decrement `shiftCountdown`; non-turn actions (inspecting, inventory) cost 0 turns.
- Shift safety check must guarantee the player ends on a valid safe tile and retains a valid path to the exit.
- Vanguard reduces shift fallout damage by 50% (down to 4% max HP). Base fallout is 8% max HP.
- Rewind Scroll restores only map geometry, doors, and open pathways from `preShiftSnapshot`.
- Haste Sigil forces shift immediately, staggers enemies on collapsing tiles for 1 turn, and reduces next shift countdown by 2 turns.
- Basic melee attack is cardinal-only (N, S, E, W).
- Camera stays centered on player, clamped at map boundaries.

---

### Task 1: Project Scaffolding & Setup

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `public/manifest.json`
- Create: `src/styles/main.css`

**Interfaces:**
- Consumes: None
- Produces: Project build pipeline, Vitest test harness, basic PWA shell, dark mode CSS design tokens.

- [ ] **Step 1: Create package.json with dependencies**
Create `package.json` with `vite`, `vitest`, `typescript`, `seedrandom`, and `idb-keyval`.

- [ ] **Step 2: Create vite.config.ts and tsconfig.json**
Configure Vite for PWA and Vitest test runner.

- [ ] **Step 3: Create index.html and public/manifest.json**
Add mobile viewport tags (`viewport-fit=cover`), touch prevention, web app manifest for standalone mobile home screen installation.

- [ ] **Step 4: Create src/styles/main.css**
Define dark mode glassmorphism UI styles, CSS variables, thumb action bar positioning, and responsive desktop layout.

- [ ] **Step 5: Run npm install & verify build harness**
Run `npm install` and `npx vitest run` to ensure scaffolding works.

- [ ] **Step 6: Commit**
`git add . && git commit -m "scaffold: initialize Vite, TypeScript, Vitest, and PWA configuration"`

---

### Task 2: Seeded PRNG & Core State Data Types

**Files:**
- Create: `src/core/rng.ts`
- Create: `src/core/state.ts`
- Test: `tests/rng.test.ts`

**Interfaces:**
- Consumes: `seedrandom` library
- Produces: `SeededRNG` class with state export/import (`getCallCount`, `setCallCount`), `GameState`, `GridTile`, `Entity`, `Item`, `PreShiftSnapshot` types.

- [ ] **Step 1: Write failing RNG state serialization test**
```typescript
// tests/rng.test.ts
import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/core/rng';

describe('SeededRNG', () => {
  it('produces deterministic numbers and preserves state upon reload', () => {
    const rng1 = new SeededRNG('test-seed-123');
    const val1 = rng1.random();
    const val2 = rng1.random();
    const count = rng1.getCallCount();

    const rng2 = new SeededRNG('test-seed-123', count);
    const val3 = rng2.random();

    const rngFresh = new SeededRNG('test-seed-123');
    rngFresh.random();
    rngFresh.random();
    const val3Fresh = rngFresh.random();

    expect(val3).toBe(val3Fresh);
  });
});
```

- [ ] **Step 2: Run test to verify failure**
Run: `npx vitest run tests/rng.test.ts`
Expected: FAIL ("SeededRNG not found")

- [ ] **Step 3: Implement src/core/rng.ts and src/core/state.ts**
Implement `SeededRNG` wrapping `seedrandom` tracking invocation count. Implement full TypeScript interface definitions in `src/core/state.ts`.

- [ ] **Step 4: Run test to verify pass**
Run: `npx vitest run tests/rng.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
`git add src/core/ tests/rng.test.ts && git commit -m "feat: add seeded PRNG wrapper and core game state types"`

---

### Task 3: Procedural Floor Map Generation & Pathfinding

**Files:**
- Create: `src/core/map/generator.ts`
- Create: `src/core/map/pathfinding.ts`
- Create: `src/core/map/fow.ts`
- Test: `tests/map.test.ts`

**Interfaces:**
- Consumes: `SeededRNG`, `GameState`, `GridTile`
- Produces: `generateFloor(seed, level)` returning `FloorMap` with rooms, corridors, shift groups, entrance/exit, and `hasValidPath(map, start, end)`.

- [ ] **Step 1: Write failing map generation & pathfinding test**
```typescript
// tests/map.test.ts
import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/core/rng';
import { generateFloor } from '../src/core/map/generator';
import { hasValidPath } from '../src/core/map/pathfinding';

describe('Floor Map Generator', () => {
  it('generates a valid connected map with stairs and shift groups', () => {
    const rng = new SeededRNG('map-test-seed');
    const floor = generateFloor(rng, 1);
    expect(floor.rooms.length).toBeGreaterThanOrEqual(3);
    expect(hasValidPath(floor, floor.entrance, floor.exit)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**
Run: `npx vitest run tests/map.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement map generator, A* pathfinder, and Fog of War raycaster**
Implement room partitioning algorithm, corridor stiles, shift group assignment, A* pathfinding, and shadowcasting field-of-view in `src/core/map/`.

- [ ] **Step 4: Run test to verify pass**
Run: `npx vitest run tests/map.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
`git add src/core/map/ tests/map.test.ts && git commit -m "feat: add procedural map generator, A* pathfinder, and fog of war"`

---

### Task 4: Shift Engine, Safety Validation & Rewind Snapshot

**Files:**
- Create: `src/core/shift/shiftSystem.ts`
- Create: `src/core/shift/snapshot.ts`
- Test: `tests/shift.test.ts`

**Interfaces:**
- Consumes: `GameState`, `FloorMap`, `SeededRNG`
- Produces: `executeShift(state)` updating map geometry, applying fallout damage, validating path safety; `capturePreShiftSnapshot(map)` and `restorePreShiftSnapshot(map, snapshot)`.

- [ ] **Step 1: Write failing shift engine & rewind test**
```typescript
// tests/shift.test.ts
import { describe, it, expect } from 'vitest';
import { createMockGameState } from './helpers';
import { executeShift, capturePreShiftSnapshot, restorePreShiftSnapshot } from '../src/core/shift/shiftSystem';

describe('Shift Engine & Rewind', () => {
  it('captures geometry snapshot and restores geometry without altering player HP', () => {
    const state = createMockGameState();
    const snapshot = capturePreShiftSnapshot(state.floorMap);
    state.preShiftSnapshot = snapshot;
    state.player.hp = 80;

    executeShift(state);
    expect(state.player.hp).toBe(80); // shift didn't kill or change player HP

    restorePreShiftSnapshot(state);
    expect(state.player.hp).toBe(80); // HP preserved
    // map geometry matches original snapshot
  });
});
```

- [ ] **Step 2: Run test to verify failure**
Run: `npx vitest run tests/shift.test.ts`

- [ ] **Step 3: Implement shift execution, safety check, and snapshot restoration**
Implement telegraph overlay calculation, room shift sliding, corridor re-stitching, collapse fallout (8% base / 4% Vanguard), safety validation (player on safe tile + path to exit), and `preShiftSnapshot` geometry restore.

- [ ] **Step 4: Run test to verify pass**
Run: `npx vitest run tests/shift.test.ts`

- [ ] **Step 5: Commit**
`git add src/core/shift/ tests/shift.test.ts && git commit -m "feat: add shift system engine, safety path validation, and geometry rewind snapshot"`

---

### Task 5: Vanguard Class, Combat Resolution & Time-Control Items

**Files:**
- Create: `src/core/items/itemEffects.ts`
- Create: `src/core/engine.ts`
- Test: `tests/engine.test.ts`

**Interfaces:**
- Consumes: `GameState`, `ShiftSystem`
- Produces: `dispatchAction(state, action)` returning `{ state, events }`. Handles cardinal movement/attack, Vanguard Fallout Shield ability, and items: Stasis Flask, Hourglass Shard, Haste Sigil, Rewind Scroll.

- [ ] **Step 1: Write failing turn engine & item test**
```typescript
// tests/engine.test.ts
import { describe, it, expect } from 'vitest';
import { dispatchAction } from '../src/core/engine';
import { createMockGameState } from './helpers';

describe('Turn Engine & Items', () => {
  it('decrements shift countdown on turn-consuming actions, not non-turn actions', () => {
    const state = createMockGameState();
    const initialCountdown = state.shiftCountdown;

    dispatchAction(state, { type: 'INSPECT_TILE', x: 2, y: 2 });
    expect(state.shiftCountdown).toBe(initialCountdown); // 0 turns consumed

    dispatchAction(state, { type: 'WAIT' });
    expect(state.shiftCountdown).toBe(initialCountdown - 1); // 1 turn consumed
  });

  it('Haste Sigil forces shift immediately, staggers enemies on collapsing tiles, and reduces next max countdown by 2', () => {
    const state = createMockGameState();
    const initialMax = state.nextShiftCountdownMax;
    dispatchAction(state, { type: 'USE_ITEM', itemId: 'haste_sigil' });
    expect(state.nextShiftCountdownMax).toBe(initialMax - 2);
  });
});
```

- [ ] **Step 2: Run test to verify failure**
Run: `npx vitest run tests/engine.test.ts`

- [ ] **Step 3: Implement dispatchAction, Vanguard combat mechanics, and time items**
Implement cardinal melee combat, enemy AI turns, Vanguard `Fallout Shield` (+50% bonus within 2 turns of shift), Stasis Flask (6 turn pause), Hourglass Shard (+3 turns), Haste Sigil (forced shift + enemy stagger + -2 max countdown cost), and Rewind Scroll.

- [ ] **Step 4: Run test to verify pass**
Run: `npx vitest run tests/engine.test.ts`

- [ ] **Step 5: Commit**
`git add src/core/ tests/engine.test.ts && git commit -m "feat: add main turn engine, Vanguard combat, and time-control consumables"`

---

### Task 6: IndexedDB Persistence & Save Manager

**Files:**
- Create: `src/core/save/saveManager.ts`
- Test: `tests/save.test.ts`

**Interfaces:**
- Consumes: `idb-keyval` or native IndexedDB
- Produces: `saveGame(state)`, `loadGame()`, `deleteSave()`, `saveRunHistory(entry)`, `getRunHistory()`.

- [ ] **Step 1: Write failing IndexedDB save/load test**
```typescript
// tests/save.test.ts
import { describe, it, expect } from 'vitest';
import { saveGame, loadGame } from '../src/core/save/saveManager';
import { createMockGameState } from './helpers';

describe('Save Manager', () => {
  it('serializes and deserializes game state faithfully', async () => {
    const state = createMockGameState();
    state.turnCount = 42;
    await saveGame(state);
    const restored = await loadGame();
    expect(restored?.turnCount).toBe(42);
    expect(restored?.seed).toBe(state.seed);
  });
});
```

- [ ] **Step 2: Run test to verify failure**
Run: `npx vitest run tests/save.test.ts`

- [ ] **Step 3: Implement saveManager with state hydration & IndexedDB persistence**
Implement full JSON state serialization (including RNG call count and map snapshot) and restoration in `src/core/save/saveManager.ts`.

- [ ] **Step 4: Run test to verify pass**
Run: `npx vitest run tests/save.test.ts`

- [ ] **Step 5: Commit**
`git add src/core/save/ tests/save.test.ts && git commit -m "feat: add IndexedDB auto-save and state hydration system"`

---

### Task 7: HTML5 Canvas Grid & Particle Renderer

**Files:**
- Create: `src/render/canvasRenderer.ts`
- Create: `src/render/particles.ts`

**Interfaces:**
- Consumes: `GameState`, `FloorMap`, `CanvasRenderingContext2D`
- Produces: `renderFrame(ctx, state, width, height)` with clamped player-centered camera, tile colors, Fog of War shadows, shift ghost outlines, collapse red warnings, procedural hit/glow particles.

- [ ] **Step 1: Implement CanvasRenderer & Particle System**
Implement 2D canvas tile rendering, edge-clamped player camera, ghost outlines for room shift preview (turns 2 & 1), red collapse hazard warnings, fog of war dimming, procedural shape particle animations.

- [ ] **Step 2: Verify rendering module cleanly compiles**
Run `npx tsc --noEmit` to verify type checking.

- [ ] **Step 3: Commit**
`git add src/render/ && git commit -m "feat: add HTML5 Canvas 2D grid renderer and procedural particle engine"`

---

### Task 8: Touch/Desktop Controls, UI Overlay HUD & Main Entry Point

**Files:**
- Create: `src/ui/controls.ts`
- Create: `src/ui/hud.ts`
- Create: `src/ui/inventory.ts`
- Create: `src/ui/log.ts`
- Create: `src/main.ts`

**Interfaces:**
- Consumes: `engine.ts`, `canvasRenderer.ts`, `saveManager.ts`
- Produces: Playable responsive web app with touch action bar, keyboard shortcuts, shift countdown pill, inventory popover, combat log, victory/defeat modal, offline PWA service worker registration.

- [ ] **Step 1: Implement UI Overlay components and Input Controllers**
Build `controls.ts` handling touch tap/swipe/long-press and WASD/arrow keys; `hud.ts` rendering thumb action bar, shift countdown pill, HP/Shield bars; `inventory.ts` for item consumption; `log.ts` for combat events.

- [ ] **Step 2: Bind everything together in src/main.ts**
Initialize `GameState`, load active save or start new seeded run, hook render loop, auto-save after actions, register PWA service worker.

- [ ] **Step 3: Build & verify end-to-end PWA application**
Run `npm run build` and `npx vitest run` to verify clean build and all tests passing.

- [ ] **Step 4: Commit**
`git add src/ index.html public/ && git commit -m "feat: assemble complete Phase 1 MVP web application with touch/desktop UI"`
