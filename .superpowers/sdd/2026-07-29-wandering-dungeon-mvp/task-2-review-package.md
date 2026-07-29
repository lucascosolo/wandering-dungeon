2562c1f feat: add seeded PRNG wrapper and core game state types
5387cad docs: add Task 1 completion report
diff --git a/.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-1-report.md b/.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-1-report.md
new file mode 100644
index 0000000..df159de
--- /dev/null
+++ b/.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-1-report.md
@@ -0,0 +1,36 @@
+# Task 1 Report: Project Scaffolding & Setup
+
+## Overview
+- **Status:** DONE
+- **Commit Hash:** `60528f774afc8b781aa61ecacc1cc69a5701567f`
+- **Short Commit Hash:** `60528f7`
+
+## Summary of Changes
+1. **Created `package.json`**:
+   - Project name: `wandering-dungeon`, type `module`.
+   - Configured scripts: `dev`, `build`, `preview`, `test`.
+   - Installed core & development dependencies: `seedrandom`, `@types/seedrandom`, `idb-keyval`, `typescript`, `vite`, `vitest`.
+2. **Created `vite.config.ts`**:
+   - Configured Vite build options and Vitest node test environment.
+3. **Created `tsconfig.json`**:
+   - Configured TypeScript compiler target (`ESNext`), module resolution (`bundler`), strict mode enabled (`true`), `jsx: preserve`, and `skipLibCheck: true`.
+4. **Created `index.html`**:
+   - Configured title "The Wandering Dungeon", viewport with touch-prevention and iOS safe area meta tags, link to `manifest.json`, link to `src/styles/main.css`, `#app` container, and `src/main.ts` module entry point.
+5. **Created `public/manifest.json`**:
+   - Web App Manifest configured for standalone display, dark theme colors (`#0f0f15`), and portrait orientation.
+6. **Created `src/styles/main.css`**:
+   - Core CSS design system with custom properties (`--bg-main`, `--accent-cyan`, `--accent-purple`, `--warning-red`).
+   - Dark theme styling with glassmorphism utility panels (`.glass-panel`).
+   - Touch action handling (`touch-action: none`) for mobile web application reset.
+   - Fixed thumb action bar layout at the bottom (`.thumb-action-bar`) taking iOS safe areas into account.
+7. **Created `src/main.ts` & `tests/scaffold.test.ts`**:
+   - Main entry point rendering initial placeholder HUD/title.
+   - Placeholder unit test verifying initial Vitest setup.
+
+## Verification & Test Results
+- **npm install:** Dependencies installed cleanly (`82 packages`).
+- **vitest run:** `1/1` test passed cleanly (duration ~2.2s).
+- **npm run build (`tsc && vite build`):** TypeScript compilation & Vite bundle build succeeded cleanly producing assets in `dist/`.
+
+## Conclusion
+Task 1 is completely satisfied and verified.
diff --git a/src/core/rng.ts b/src/core/rng.ts
new file mode 100644
index 0000000..5b295af
--- /dev/null
+++ b/src/core/rng.ts
@@ -0,0 +1,53 @@
+import seedrandom from 'seedrandom';
+
+export interface SerializedRNG {
+  seed: string;
+  callCount: number;
+}
+
+export class SeededRNG {
+  private seed: string;
+  private callCount: number;
+  private prng: seedrandom.PRNG;
+
+  constructor(seed: string, initialCallCount = 0) {
+    this.seed = seed;
+    this.callCount = initialCallCount;
+    this.prng = seedrandom(seed);
+    for (let i = 0; i < initialCallCount; i++) {
+      this.prng();
+    }
+  }
+
+  random(): number {
+    this.callCount++;
+    return this.prng();
+  }
+
+  randomRange(min: number, max: number): number {
+    return min + this.random() * (max - min);
+  }
+
+  randomInt(min: number, max: number): number {
+    return Math.floor(this.random() * (max - min + 1)) + min;
+  }
+
+  getSeed(): string {
+    return this.seed;
+  }
+
+  getCallCount(): number {
+    return this.callCount;
+  }
+
+  serialize(): SerializedRNG {
+    return {
+      seed: this.seed,
+      callCount: this.callCount,
+    };
+  }
+
+  static fromSerialized(data: SerializedRNG): SeededRNG {
+    return new SeededRNG(data.seed, data.callCount);
+  }
+}
diff --git a/src/core/state.ts b/src/core/state.ts
new file mode 100644
index 0000000..3e3e58e
--- /dev/null
+++ b/src/core/state.ts
@@ -0,0 +1,116 @@
+export interface Position {
+  x: number;
+  y: number;
+}
+
+export type TileType = 'wall' | 'floor' | 'door' | 'stairs_down' | 'chasm';
+
+export interface GridTile {
+  x: number;
+  y: number;
+  type: TileType;
+  shiftGroupId: string | null;
+  isTelegraphedCollapse?: boolean;
+  hazard?: 'fire' | 'poison_gas' | null;
+}
+
+export interface ShiftGroup {
+  id: string;
+  type: 'room' | 'corridor';
+  bounds: {
+    x: number;
+    y: number;
+    width: number;
+    height: number;
+  };
+  currentOffset: Position;
+}
+
+export interface PreShiftSnapshot {
+  floorIndex: number;
+  tiles: TileType[][];
+  shiftGroupPositions: Record<string, Position>;
+}
+
+export type ItemType =
+  | 'stasis_flask'
+  | 'hourglass_shard'
+  | 'haste_sigil'
+  | 'rewind_scroll'
+  | 'health_potion';
+
+export interface Item {
+  id: string;
+  type: ItemType;
+  name: string;
+  description: string;
+  category: 'stabilization' | 'destabilization' | 'consumable';
+}
+
+export interface Entity {
+  id: string;
+  name: string;
+  position: Position;
+  hp: number;
+  maxHp: number;
+  attackPower: number;
+  isStaggered?: boolean;
+  staggeredTurns?: number;
+}
+
+export interface Player extends Entity {
+  classType: 'vanguard';
+  shieldHp: number;
+  shieldTurnsRemaining: number;
+  inventory: Item[];
+}
+
+export type EnemyType =
+  | 'crawler'
+  | 'sentinel'
+  | 'fracture_beast'
+  | 'warp_stalker'
+  | 'collapse_behemoth';
+
+export interface Enemy extends Entity {
+  enemyType: EnemyType;
+}
+
+export interface LogMessage {
+  id: string;
+  text: string;
+  type: 'info' | 'combat' | 'shift' | 'warning';
+  timestamp: number;
+}
+
+export interface FloorMap {
+  level: number;
+  width: number;
+  height: number;
+  tiles: GridTile[][];
+  shiftGroups: Record<string, ShiftGroup>;
+  entrance: Position;
+  exit: Position;
+  explored: boolean[][];
+  visible: boolean[][];
+}
+
+export interface GameState {
+  seed: string;
+  rngState: {
+    seed: string;
+    callCount: number;
+  };
+  turnCount: number;
+  shiftCountdown: number;
+  nextShiftCountdownMax: number;
+  isStasisActive: boolean;
+  stasisTurnsRemaining: number;
+  player: Player;
+  entities: Enemy[];
+  floorMap: FloorMap;
+  preShiftSnapshot: PreShiftSnapshot | null;
+  eventLog: LogMessage[];
+  isGameOver: boolean;
+  isVictory: boolean;
+}
diff --git a/tests/rng.test.ts b/tests/rng.test.ts
new file mode 100644
index 0000000..026d751
--- /dev/null
+++ b/tests/rng.test.ts
@@ -0,0 +1,71 @@
+import { describe, it, expect } from 'vitest';
+import { SeededRNG } from '../src/core/rng';
+
+describe('SeededRNG', () => {
+  it('produces identical random numbers for the same seed', () => {
+    const seed = 'wandering-dungeon-test-123';
+    const rng1 = new SeededRNG(seed);
+    const rng2 = new SeededRNG(seed);
+
+    expect(rng1.getSeed()).toBe(seed);
+    expect(rng2.getSeed()).toBe(seed);
+
+    const values1 = Array.from({ length: 10 }, () => rng1.random());
+    const values2 = Array.from({ length: 10 }, () => rng2.random());
+
+    expect(values1).toEqual(values2);
+    expect(rng1.getCallCount()).toBe(10);
+    expect(rng2.getCallCount()).toBe(10);
+  });
+
+  it('restoring fromSerialized produces exact same subsequent sequence', () => {
+    const seed = 'save-state-seed-456';
+    const originalRng = new SeededRNG(seed);
+
+    for (let i = 0; i < 5; i++) {
+      originalRng.random();
+    }
+    expect(originalRng.getCallCount()).toBe(5);
+
+    const serialized = originalRng.serialize();
+    expect(serialized).toEqual({ seed, callCount: 5 });
+
+    const restoredRng = SeededRNG.fromSerialized(serialized);
+    expect(restoredRng.getSeed()).toBe(seed);
+    expect(restoredRng.getCallCount()).toBe(5);
+
+    const nextOriginal = Array.from({ length: 10 }, () => originalRng.random());
+    const nextRestored = Array.from({ length: 10 }, () => restoredRng.random());
+
+    expect(nextOriginal).toEqual(nextRestored);
+    expect(originalRng.getCallCount()).toBe(15);
+    expect(restoredRng.getCallCount()).toBe(15);
+  });
+
+  it('randomRange returns floats within [min, max)', () => {
+    const rng = new SeededRNG('range-seed');
+    for (let i = 0; i < 100; i++) {
+      const val = rng.randomRange(5, 15);
+      expect(val).toBeGreaterThanOrEqual(5);
+      expect(val).toBeLessThan(15);
+    }
+  });
+
+  it('randomInt returns integers within [min, max] inclusive', () => {
+    const rng = new SeededRNG('int-seed');
+    const counts = new Map<number, number>();
+
+    for (let i = 0; i < 200; i++) {
+      const val = rng.randomInt(1, 4);
+      expect(Number.isInteger(val)).toBe(true);
+      expect(val).toBeGreaterThanOrEqual(1);
+      expect(val).toBeLessThanOrEqual(4);
+      counts.set(val, (counts.get(val) || 0) + 1);
+    }
+
+    expect(counts.has(1)).toBe(true);
+    expect(counts.has(2)).toBe(true);
+    expect(counts.has(3)).toBe(true);
+    expect(counts.has(4)).toBe(true);
+  });
+});
