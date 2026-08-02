import { describe, it, expect } from 'vitest';
import { createMockGameState, createMockEnemy } from './helpers';
import { SeededRNG } from '../src/core/rng';
import { findPath, hasValidPath } from '../src/core/map/pathfinding';
import {
  executeShift,
  capturePreShiftSnapshot,
  restorePreShiftSnapshot,
  clearTelegraphs,
  applyTelegraphs,
  syncDoors,
  MAX_EXIT_BLOCKED_STREAK,
  MIN_SHIFT_INTERVAL,
  MAX_PRESSURE,
  PRESSURE_GRACE_TURNS,
  PRESSURE_STEP_TURNS,
  floorPressure,
  isFloorStabilized,
  shiftInterval,
} from '../src/core/shift/shiftSystem';
import { buildFloor, createNewGame } from '../src/core/game';
import { createRunConfig } from '../src/core/runConfig';
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

  it('sprays shards when a Glass Expanse shift changes an adjacent tile', () => {
    const state = createMockGameState('glass-shard-test');
    state.floorMap.level = 16;
    const { x, y } = state.player.position;
    const adjacent = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
      .map(([px, py]) => ({ x: px, y: py }))
      .find(pos => state.floorMap.tiles[pos.y]?.[pos.x]?.type === 'floor');
    if (!adjacent) throw new Error('player has no adjacent floor tile');

    state.pendingShift = {
      type: 'localized_collapse',
      targetGroupId: null,
      changes: [{ x: adjacent.x, y: adjacent.y, to: 'chasm', shiftGroupId: null }],
      groupMoves: {},
      blocksExit: false,
    };

    const events = executeShift(state, new SeededRNG('glass-shard-rng'));

    expect(state.player.hp).toBe(98);
    expect(state.lastDamageSource).toBe('the Glass Expanse shards');
    expect(events.some(event => event.includes('Shards burst'))).toBe(true);
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
     * A door sits in the threshold: the corridor tile at the mouth of the
     * passage, where a house plan would draw it. Rooms are solid floor
     * rectangles with no wall border, so this is not a gap-in-a-wall check —
     * a door is valid exactly when it is a corridor tile touching a room tile.
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
          const door = map.tiles[y][x];
          if (door.type !== 'door') continue;
          if (!isCorridor(door.shiftGroupId)) {
            out.push({ x, y });
            continue;
          }
          const touchesRoom = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;
            if (!walkable(nx, ny)) return false;
            const id = map.tiles[ny][nx].shiftGroupId;
            return id !== null && !isCorridor(id);
          });
          if (!touchesRoom) out.push({ x, y });
        }
      }
      return out;
    }

    it('is idempotent on a freshly generated floor', () => {
      // Generation calls syncDoors itself, so this guards against a rule that
      // oscillates rather than settles — if a second pass moved doors, every
      // shift would churn them across the whole floor instead of only where
      // the geometry moved.
      for (const seed of ['door-a', 'door-b', 'door-c', 'door-d']) {
        const state = createNewGame(seed, createRunConfig('short', 'standard'));
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

    it('keeps doorways narrow rather than paving a room edge with them', () => {
      // A corridor running flush along a room's outer edge touches it the whole
      // way, which marked every tile of it as one absurdly wide doorway. Runs of
      // two are legitimate — two rooms joined by a short corridor put a
      // threshold at each end — so only three in a line indicates the bug.
      for (const seed of ['door-a', 'door-b', 'door-c', 'door-d', 'door-e']) {
        const map = createNewGame(seed, createRunConfig('short', 'standard')).floorMap;
        const isDoor = (x: number, y: number): boolean =>
          x >= 0 && x < map.width && y >= 0 && y < map.height && map.tiles[y][x].type === 'door';

        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            expect(
              isDoor(x, y) && isDoor(x + 1, y) && isDoor(x + 2, y),
              `seed ${seed} has a horizontal door run at (${x}, ${y})`
            ).toBe(false);
            expect(
              isDoor(x, y) && isDoor(x, y + 1) && isDoor(x, y + 2),
              `seed ${seed} has a vertical door run at (${x}, ${y})`
            ).toBe(false);
          }
        }
      }
    });

    it('leaves no door stranded away from a corridor after many shifts', () => {
      for (const seed of ['door-1', 'door-2', 'door-3', 'door-4', 'door-5', 'door-6']) {
        const state = createNewGame(seed, createRunConfig('short', 'standard'));

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

  describe('exit consistency', () => {
    /**
     * `map.exit` is what every guard on the way out reads — `blocksExit`, the
     * exit-blocked streak, and `carveRescuePath`. A room slide carries the
     * stairs tile with the rest of its room, so an exit written once at
     * generation ends up naming a coordinate the stairs have left, and the
     * fail-safe digs to the wrong tile while the real stairs stay walled off.
     */
    function exitFaults(map: FloorMap): string[] {
      const faults: string[] = [];
      const stairs: { x: number; y: number }[] = [];
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (map.tiles[y][x].type === 'stairs_down') stairs.push({ x, y });
        }
      }

      if (stairs.length !== 1) faults.push(`${stairs.length} stairs tiles`);
      const at = map.tiles[map.exit.y][map.exit.x].type;
      if (at !== 'stairs_down') faults.push(`exit names a '${at}' tile`);
      return faults;
    }

    /**
     * The player has to be walking, not waiting: shift targets are chosen near
     * the player, so a stationary run never slides the room holding the stairs
     * and the whole fault goes unreproduced. These seeds all fault within a few
     * floors if `syncExit` stops being called.
     */
    it('keeps map.exit on the stairs while the player walks the floor', () => {
      for (const seed of ['x3', 'x13', 'x17', 'x19', 'x23', 'x28']) {
        const state = createNewGame(seed, createRunConfig('extreme', 'brutal'));

        for (let turn = 0; turn < 400 && !state.isGameOver; turn++) {
          const { player, floorMap } = state;
          if (floorMap.tiles[player.position.y][player.position.x].type === 'stairs_down') {
            dispatchAction(state, { type: 'DESCEND' });
          } else {
            const path = findPath(floorMap, player.position, floorMap.exit);
            if (path && path.length >= 2) {
              const step = path[1];
              dispatchAction(state, {
                type: 'MOVE',
                dx: step.x - player.position.x,
                dy: step.y - player.position.y,
              });
            } else {
              dispatchAction(state, { type: 'WAIT' });
            }
          }

          const faults = exitFaults(state.floorMap);
          expect(
            faults,
            `seed ${seed} floor ${state.floorMap.level} turn ${turn}: ${faults.join(', ')}`
          ).toEqual([]);
        }
      }
    });

    it('restores the stairs after a rewind moves them back', () => {
      const state = createNewGame('exit-rewind', createRunConfig('short', 'standard'));
      const rng = new SeededRNG('exit-rewind-rng');

      for (let i = 0; i < 12; i++) {
        executeShift(state, rng);
        restorePreShiftSnapshot(state);
        expect(exitFaults(state.floorMap)).toEqual([]);
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

describe('Escalating unraveling', () => {
  it('leaves the cadence untouched through the grace period, then steps it down', () => {
    expect(floorPressure(0)).toBe(0);
    expect(floorPressure(PRESSURE_GRACE_TURNS)).toBe(0);
    expect(floorPressure(PRESSURE_GRACE_TURNS + 1)).toBe(1);
    expect(floorPressure(PRESSURE_GRACE_TURNS + PRESSURE_STEP_TURNS)).toBe(1);
    expect(floorPressure(PRESSURE_GRACE_TURNS + PRESSURE_STEP_TURNS + 1)).toBe(2);
    expect(floorPressure(PRESSURE_GRACE_TURNS + PRESSURE_STEP_TURNS * 50)).toBe(MAX_PRESSURE);
  });

  it('never tightens the interval past the floor that keeps countdown-keyed hazards reachable', () => {
    const state = createMockGameState();
    state.nextShiftCountdownMax = 8;

    state.floorTurns = 0;
    expect(shiftInterval(state)).toBe(8);

    state.floorTurns = 100_000;
    expect(shiftInterval(state)).toBe(MIN_SHIFT_INTERVAL);
  });

  it('lets a Haste Sigil interval stay below the pressure floor rather than being handed turns back', () => {
    const state = createMockGameState();
    state.nextShiftCountdownMax = 3;

    state.floorTurns = 0;
    expect(shiftInterval(state)).toBe(3);
    state.floorTurns = 100_000;
    expect(shiftInterval(state)).toBe(3);
  });

  it('measurably tightens shift cadence the longer a floor is occupied', () => {
    const state = createMockGameState('pressure-seed');
    const shiftTurns: number[] = [];

    for (let i = 0; i < 140; i++) {
      state.player.hp = state.player.maxHp;
      dispatchAction(state, { type: 'WAIT' });
      if (state.lastShiftTurn === state.turnCount) shiftTurns.push(state.turnCount);
    }

    expect(shiftTurns.length).toBeGreaterThan(4);
    const gaps = shiftTurns.slice(1).map((t, i) => t - shiftTurns[i]);
    const early = gaps[0];
    const late = gaps[gaps.length - 1];

    expect(late).toBeLessThan(early);
    expect(late).toBe(MIN_SHIFT_INTERVAL);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(MIN_SHIFT_INTERVAL);
  });

  it('hits harder with fallout as pressure builds', () => {
    const state = createMockGameState();
    state.floorTurns = 0;
    const fresh = Math.floor(state.player.maxHp * 0.08 * 0.5 * (1 + 0.1 * floorPressure(0)));
    state.floorTurns = PRESSURE_GRACE_TURNS + PRESSURE_STEP_TURNS * MAX_PRESSURE;
    const late = Math.floor(
      state.player.maxHp * 0.08 * 0.5 * (1 + 0.1 * floorPressure(state.floorTurns))
    );
    expect(late).toBeGreaterThan(fresh);
  });

  it('resets pressure when a new floor is built', () => {
    const state = createMockGameState();
    state.floorTurns = 500;

    buildFloor(state, new SeededRNG('descend-seed'), 2);

    expect(state.floorTurns).toBe(0);
    expect(shiftInterval(state)).toBe(state.nextShiftCountdownMax);
  });

  it('resets pressure when the player actually descends', () => {
    const state = createNewGame('descend-run', createRunConfig('short', 'standard'));

    for (let i = 0; i < 80; i++) {
      state.player.hp = state.player.maxHp;
      dispatchAction(state, { type: 'WAIT' });
    }
    expect(floorPressure(state.floorTurns)).toBeGreaterThan(0);
    const beforeLevel = state.floorMap.level;

    state.player.position = { ...state.floorMap.exit };
    dispatchAction(state, { type: 'DESCEND' });

    expect(state.floorMap.level).toBe(beforeLevel + 1);
    // A successful descent replaces the world and the clock does not advance for
    // it, so the new floor opens on turn zero of its own grace period.
    expect(state.floorTurns).toBe(0);
    expect(floorPressure(state.floorTurns)).toBe(0);
    // The run-long clock keeps its count — that divergence is the whole reason
    // pressure reads floorTurns instead of turnCount.
    expect(state.turnCount).toBe(80);
  });
});

/**
 * Kill the region-5 guardian on its own arena floor, leaving the state one turn
 * past the boss's death.
 */
function clearBossFloor(seed: string) {
  const state = createNewGame(seed, createRunConfig('short', 'standard'));
  buildFloor(state, new SeededRNG(`${seed}-rng`), 5);
  const boss = state.entities[0];
  boss.position = { x: state.player.position.x + 1, y: state.player.position.y };
  boss.hp = 1;
  state.player.hp = state.player.maxHp;
  dispatchAction(state, { type: 'MOVE', dx: 1, dy: 0 });
  return state;
}

describe('Stabilization after the guardian falls', () => {
  it('reads as unstable while the guardian lives and stable once the region is cleared', () => {
    const state = createNewGame('stabilize-flag', createRunConfig('short', 'standard'));
    buildFloor(state, new SeededRNG('stabilize-flag-rng'), 5);
    expect(isFloorStabilized(state)).toBe(false);

    const cleared = clearBossFloor('stabilize-cleared');
    expect(cleared.clearedRegions).toEqual([0]);
    expect(isFloorStabilized(cleared)).toBe(true);
  });

  it('stops the floor shifting entirely once the guardian is dead', () => {
    const state = clearBossFloor('stabilize-quiet');
    const countdown = state.shiftCountdown;
    const lastShift = state.lastShiftTurn;

    // Far longer than any interval pressure could produce, so a single shift
    // getting through would show up here.
    for (let i = 0; i < 60; i++) {
      state.player.hp = state.player.maxHp;
      dispatchAction(state, { type: 'WAIT' });
    }

    expect(state.shiftCountdown).toBe(countdown);
    expect(state.lastShiftTurn).toBe(lastShift);
    expect(state.pendingShift).toBeNull();
    expect(state.turnCount).toBeGreaterThan(60);
  });

  it('drops a shift already telegraphed when the guardian falls', () => {
    const state = createNewGame('stabilize-telegraph', createRunConfig('short', 'standard'));
    buildFloor(state, new SeededRNG('stabilize-telegraph-rng'), 5);
    const boss = state.entities[0];
    boss.position = { x: state.player.position.x + 1, y: state.player.position.y };

    state.shiftCountdown = 3;
    state.player.hp = state.player.maxHp;
    dispatchAction(state, { type: 'WAIT' });
    expect(state.pendingShift).not.toBeNull();

    boss.hp = 1;
    state.player.hp = state.player.maxHp;
    dispatchAction(state, { type: 'MOVE', dx: 1, dy: 0 });
    state.player.hp = state.player.maxHp;
    dispatchAction(state, { type: 'WAIT' });

    expect(state.pendingShift).toBeNull();
    expect(
      state.floorMap.tiles.some(row =>
        row.some(tile => tile.isTelegraphedCollapse || tile.isTelegraphedShift)
      )
    ).toBe(false);
  });

  it('resumes shifting on the next floor down', () => {
    const state = clearBossFloor('stabilize-descend');

    state.player.position = { ...state.floorMap.exit };
    dispatchAction(state, { type: 'DESCEND' });
    expect(state.floorMap.level).toBe(6);
    expect(isFloorStabilized(state)).toBe(false);

    const countdown = state.shiftCountdown;
    state.player.hp = state.player.maxHp;
    dispatchAction(state, { type: 'WAIT' });
    expect(state.shiftCountdown).toBe(countdown - 1);
  });
});
