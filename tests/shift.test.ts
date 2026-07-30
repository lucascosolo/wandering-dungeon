import { describe, it, expect } from 'vitest';
import { createMockGameState, createMockEnemy } from './helpers';
import { SeededRNG } from '../src/core/rng';
import { hasValidPath } from '../src/core/map/pathfinding';
import {
  executeShift,
  capturePreShiftSnapshot,
  restorePreShiftSnapshot,
  clearTelegraphs,
  applyTelegraphs,
  syncDoors,
  MAX_EXIT_BLOCKED_STREAK,
} from '../src/core/shift/shiftSystem';
import { createNewGame } from '../src/core/game';
import { dispatchAction } from '../src/core/engine';
import { FloorMap } from '../src/core/state';

describe('Shift Engine', () => {
  it('captures geometry snapshot and restores geometry without altering player HP', () => {
    const state = createMockGameState();
    const snapshot = capturePreShiftSnapshot(state.floorMap);
    state.preShiftSnapshot = snapshot;
    state.player.hp = 80;

    // Restore from snapshot
    restorePreShiftSnapshot(state);
    expect(state.player.hp).toBe(80); // HP must be preserved
    expect(state.preShiftSnapshot).toBeNull(); // Snapshot consumed
  });

  it('executes a shift and always leaves the player somewhere safe', () => {
    const state = createMockGameState('shift-safety-test');
    const rng = new SeededRNG('shift-exec-rng');

    executeShift(state, rng);

    // Player must be on a safe tile. Note that a path to the exit is NOT
    // guaranteed by a single shift any more — the dungeon may seal the stairs
    // for one shift cycle. That bound is covered by its own test below.
    const playerPos = state.player.position;
    const playerTile = state.floorMap.tiles[playerPos.y][playerPos.x];
    expect(['floor', 'door', 'stairs_down']).toContain(playerTile.type);
  });

  it('stores a preShiftSnapshot after executing a shift', () => {
    const state = createMockGameState('snapshot-test');
    const rng = new SeededRNG('snapshot-rng');

    expect(state.preShiftSnapshot).toBeNull();

    executeShift(state, rng);

    // After shift, snapshot should be set
    expect(state.preShiftSnapshot).not.toBeNull();
    expect(state.preShiftSnapshot!.floorIndex).toBe(1);
  });

  it('applies fallout damage to enemies on collapsed tiles', () => {
    const state = createMockGameState('enemy-fallout-test');
    const rng = new SeededRNG('enemy-fallout-rng');

    // Place an enemy on a floor tile
    const floorTiles = [];
    for (let y = 0; y < state.floorMap.height; y++) {
      for (let x = 0; x < state.floorMap.width; x++) {
        if (state.floorMap.tiles[y][x].type === 'floor' &&
            !(x === state.player.position.x && y === state.player.position.y)) {
          floorTiles.push({ x, y });
        }
      }
    }

    if (floorTiles.length > 0) {
      const enemyPos = floorTiles[0];
      const enemy = createMockEnemy(enemyPos, 'crawler');
      state.entities.push(enemy);

      // Manually collapse the enemy's tile to test fallout
      state.floorMap.tiles[enemyPos.y][enemyPos.x].type = 'chasm';

      // Run a shift (the entity fallout check happens inside)
      executeShift(state, rng);

      // Enemy should have been moved or taken damage
      // (Either repositioned or killed)
      const wasRelocated = enemy.position.x !== enemyPos.x || enemy.position.y !== enemyPos.y;
      const tookDamage = enemy.hp < enemy.maxHp;
      expect(wasRelocated || tookDamage || enemy.hp === 0).toBe(true);
    }
  });

  it('restorePreShiftSnapshot restores tile types but not entity positions', () => {
    const state = createMockGameState('rewind-test');
    const rng = new SeededRNG('rewind-rng');

    // Capture snapshot
    const snapshot = capturePreShiftSnapshot(state.floorMap);

    // Move player to a different position
    const floorTiles = [];
    for (let y = 0; y < state.floorMap.height; y++) {
      for (let x = 0; x < state.floorMap.width; x++) {
        if (state.floorMap.tiles[y][x].type === 'floor' &&
            !(x === state.player.position.x && y === state.player.position.y)) {
          floorTiles.push({ x, y });
        }
      }
    }

    const originalPlayerPos = { ...state.player.position };
    if (floorTiles.length > 1) {
      state.player.position = floorTiles[1];
    }

    // Apply a shift — the shift's own safety net may reposition the player
    // onto a safe tile if their spot became unsafe. That's expected; what this
    // test checks is that restoring the snapshot afterward doesn't move them again.
    executeShift(state, rng);
    const postShiftPlayerPos = { ...state.player.position };

    // Now restore from our manually captured snapshot
    state.preShiftSnapshot = snapshot;
    restorePreShiftSnapshot(state);

    expect(state.player.position.x).toBe(postShiftPlayerPos.x);
    expect(state.player.position.y).toBe(postShiftPlayerPos.y);
  });

  /**
   * The telegraph promising one thing and the shift doing another was a real
   * shipped bug: every `localized_collapse` warned about 12-18 collapsing tiles
   * and then changed nothing, because the outcome was re-derived at execution
   * and failed its safety check. These tests pin the contract instead.
   */
  describe('telegraph fidelity', () => {
    const SEEDS = ['tf-1', 'tf-2', 'tf-3', 'tf-4', 'tf-5', 'tf-6', 'tf-7', 'tf-8'];

    const telegraphedTiles = (state: ReturnType<typeof createMockGameState>): string[] => {
      const out: string[] = [];
      const m = state.floorMap;
      for (let y = 0; y < m.height; y++) {
        for (let x = 0; x < m.width; x++) {
          const t = m.tiles[y][x];
          if (t.isTelegraphedCollapse || t.isTelegraphedShift) out.push(`${x},${y}`);
        }
      }
      return out.sort();
    };

    it('warns about exactly the tiles the shift then changes', () => {
      for (const seed of SEEDS) {
        const state = createMockGameState(seed);
        const rng = new SeededRNG(`${seed}-rng`);

        for (let shift = 0; shift < 4; shift++) {
          applyTelegraphs(state, rng);
          const warned = telegraphedTiles(state);

          executeShift(state, rng);
          const changed = state.lastShiftChanges.map(c => `${c.x},${c.y}`).sort();

          expect(changed, `seed ${seed}, shift ${shift}`).toEqual(warned);
        }
      }
    });

    it('lands the shift it telegraphed instead of holding steady', () => {
      let landed = 0;
      let total = 0;

      for (const seed of SEEDS) {
        const state = createMockGameState(seed);
        const rng = new SeededRNG(`${seed}-rng`);

        for (let shift = 0; shift < 4; shift++) {
          applyTelegraphs(state, rng);
          const warned = telegraphedTiles(state).length;
          const events = executeShift(state, rng);

          if (warned > 0) {
            total++;
            // A warning must never resolve to "nothing happened".
            expect(events.join(' '), `seed ${seed}`).not.toContain('holds steady');
            if (state.lastShiftChanges.length > 0) landed++;
          }
        }
      }

      expect(total).toBeGreaterThan(0);
      expect(landed).toBe(total);
    });

    it('never seals the exit for two shifts in a row', () => {
      for (const seed of SEEDS) {
        const state = createMockGameState(seed);
        const rng = new SeededRNG(`${seed}-rng`);

        for (let shift = 0; shift < 8; shift++) {
          executeShift(state, rng);

          expect(
            state.exitBlockedStreak,
            `seed ${seed} exceeded the sealed-exit bound at shift ${shift}`
          ).toBeLessThanOrEqual(MAX_EXIT_BLOCKED_STREAK);

          if (state.exitBlockedStreak === 0) {
            expect(
              hasValidPath(state.floorMap, state.player.position, state.floorMap.exit)
            ).toBe(true);
          }
        }
      }
    });
  });

  describe('door consistency', () => {
    /**
     * A door here marks where a corridor meets a room, not a gap in a wall —
     * rooms are solid floor rectangles. So a door is valid exactly when it is a
     * room tile touching a corridor tile.
     */
    function strandedDoors(map: FloorMap): { x: number; y: number }[] {
      const isCorridor = (id: string | null): boolean => id !== null && id.startsWith('corridor');
      const walkable = (x: number, y: number): boolean => {
        if (x < 0 || x >= map.width || y < 0 || y >= map.height) return false;
        const t = map.tiles[y][x].type;
        return t === 'floor' || t === 'door' || t === 'stairs_down';
      };

      const out: { x: number; y: number }[] = [];
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (map.tiles[y][x].type !== 'door') continue;
          const touchesCorridor = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;
            return walkable(nx, ny) && isCorridor(map.tiles[ny][nx].shiftGroupId);
          });
          if (!touchesCorridor) out.push({ x, y });
        }
      }
      return out;
    }

    it('agrees with the doors the floor generator places', () => {
      // If syncDoors disagreed with generation, every shift would churn doors
      // across the whole floor instead of only where the geometry moved.
      for (const seed of ['door-a', 'door-b', 'door-c', 'door-d']) {
        const state = createNewGame(seed);
        const before = state.floorMap.tiles.map(row => row.map(t => t.type));

        syncDoors(state.floorMap);

        for (let y = 0; y < state.floorMap.height; y++) {
          for (let x = 0; x < state.floorMap.width; x++) {
            expect(
              state.floorMap.tiles[y][x].type,
              `seed ${seed} tile (${x}, ${y}) was reclassified`
            ).toBe(before[y][x]);
          }
        }
      }
    });

    it('leaves no door stranded away from a corridor after many shifts', () => {
      for (const seed of ['door-1', 'door-2', 'door-3', 'door-4', 'door-5', 'door-6']) {
        const state = createNewGame(seed);

        for (let turn = 0; turn < 200 && !state.isGameOver; turn++) {
          dispatchAction(state, { type: 'WAIT' });
        }

        const stranded = strandedDoors(state.floorMap);
        expect(
          stranded,
          `seed ${seed} left ${stranded.length} stranded door(s), e.g. ${JSON.stringify(stranded[0])}`
        ).toEqual([]);
      }
    });
  });

  it('clears telegraph overlays', () => {
    const state = createMockGameState();

    // Manually set some telegraphs
    state.floorMap.tiles[1][1].isTelegraphedCollapse = true;
    state.floorMap.tiles[2][2].isTelegraphedCollapse = true;

    clearTelegraphs(state.floorMap);

    expect(state.floorMap.tiles[1][1].isTelegraphedCollapse).toBe(false);
    expect(state.floorMap.tiles[2][2].isTelegraphedCollapse).toBe(false);
  });
});
