import { describe, it, expect } from 'vitest';
import { dispatchAction, PURSUER_NAME } from '../src/core/engine';
import { buildFloor, createNewGame } from '../src/core/game';
import { createRunConfig } from '../src/core/runConfig';
import { SeededRNG } from '../src/core/rng';
import { GameState, Position } from '../src/core/state';
import { PRESSURE_GRACE_TURNS, PRESSURE_STEP_TURNS } from '../src/core/shift/shiftSystem';
import { findPath } from '../src/core/map/pathfinding';
import { createMockGameState } from './helpers';

function distanceBetween(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Turns of lingering that reach the tier `wakePursuer` waits for. */
const LINGER_TURNS = PRESSURE_GRACE_TURNS + 2 * PRESSURE_STEP_TURNS;

function pursuerOf(state: GameState) {
  return state.entities.find(e => e.enemyType === 'pursuer');
}

/**
 * Stand still for `turns`, healing between them. `WAIT` is the honest way to
 * reach the pressure tier — the spawn is driven by `floorTurns`, which only
 * `advanceClock` moves, so writing the counter directly would test a state the
 * game cannot reach. The healing is there because standing in one place for
 * seventy turns is exactly what shift fallout is designed to kill you for, and
 * a dead player stops advancing the clock these tests are waiting on.
 */
function linger(state: GameState, turns: number): void {
  for (let turn = 0; turn < turns; turn++) {
    state.player.hp = state.player.maxHp;
    dispatchAction(state, { type: 'WAIT' });
  }
}

function lingerUntilPursued(state: GameState, limit = LINGER_TURNS + 20): void {
  for (let turn = 0; turn < limit && !pursuerOf(state); turn++) {
    linger(state, 1);
  }
}

describe('The Pursuer', () => {
  it('stays away while the floor is fresh and arrives once it is lingered on', () => {
    const state = createMockGameState('pursuer-arrival');

    linger(state, PRESSURE_GRACE_TURNS);
    expect(pursuerOf(state)).toBeUndefined();

    lingerUntilPursued(state);
    expect(pursuerOf(state)).toBeDefined();
    expect(state.eventLog.some(entry => entry.text.includes(PURSUER_NAME))).toBe(true);
  });

  it('arrives once and only once, however long the floor is held', () => {
    const state = createMockGameState('pursuer-single');
    lingerUntilPursued(state);

    linger(state, 60);

    expect(state.entities.filter(e => e.enemyType === 'pursuer')).toHaveLength(1);
  });

  it('cannot be killed, and says so instead of reporting damage', () => {
    const state = createMockGameState('pursuer-unkillable');
    lingerUntilPursued(state);
    const pursuer = pursuerOf(state)!;

    // Stand it next to the player and swing at it repeatedly.
    for (let blow = 0; blow < 12; blow++) {
      state.player.hp = state.player.maxHp;
      pursuer.position = { x: state.player.position.x + 1, y: state.player.position.y };
      const { events } = dispatchAction(state, { type: 'MOVE', dx: 1, dy: 0 });
      expect(events.some(e => /for \d+ damage/.test(e) && e.includes(PURSUER_NAME))).toBe(false);
    }

    expect(pursuerOf(state)).toBeDefined();
    expect(pursuerOf(state)!.hp).toBeGreaterThan(0);
    expect(state.player.xp).toBe(0);
    expect(state.player.coins).toBe(0);
  });

  it('closes the distance turn after turn', () => {
    const state = createMockGameState('pursuer-hunt');
    lingerUntilPursued(state);
    const pursuer = pursuerOf(state)!;

    const opened = distanceBetween(pursuer.position, state.player.position);

    // The player holds still, so anything that hunts must be closer afterwards.
    linger(state, 12);

    expect(distanceBetween(pursuerOf(state)!.position, state.player.position))
      .toBeLessThan(opened);
  });

  it('comes through a wall rather than stopping when nothing connects it to the player', () => {
    const state = createMockGameState('pursuer-phase');
    lingerUntilPursued(state);
    const pursuer = pursuerOf(state)!;

    // Hold the clock: a shift landing mid-measurement re-carves the rock and
    // moves the player, and then this proves nothing about phasing.
    state.shiftCountdown = 9999;
    state.nextShiftCountdownMax = 9999;
    state.pendingShift = null;

    // Wall it off outright: every tile but the two they stand on becomes rock,
    // which is the extreme of what a shift can do to the route between them.
    const { width, height, tiles } = state.floorMap;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        tiles[y][x].type = 'wall';
      }
    }
    const player = { ...state.player.position };
    tiles[player.y][player.x].type = 'floor';
    pursuer.position = { x: player.x, y: Math.max(0, player.y - 4) };
    tiles[pursuer.position.y][pursuer.position.x].type = 'floor';
    const opened = distanceBetween(pursuer.position, player);
    expect(findPath(state.floorMap, pursuer.position, player)).toBeNull();

    linger(state, 12);

    expect(distanceBetween(pursuerOf(state)!.position, player)).toBeLessThan(opened);
  });

  it('is left behind by the stairs', () => {
    const state = createMockGameState('pursuer-escape');
    lingerUntilPursued(state);
    expect(pursuerOf(state)).toBeDefined();

    buildFloor(state, new SeededRNG('pursuer-escape-next'), state.floorMap.level + 1);

    expect(pursuerOf(state)).toBeUndefined();
    expect(state.floorTurns).toBe(0);
  });

  /**
   * The arena's stairs stay shut until the guardian falls and the merchant who
   * follows is meant to be read at leisure, so neither wait may summon it. This
   * is also what keeps `tests/run.test.ts` honest: its bot attacks the first live
   * enemy on every arena floor until it dies, and an unkillable one there would
   * burn the whole turn budget.
   */
  it('never appears on an arena floor, before or after the guardian falls', () => {
    const state = createNewGame('pursuer-arena', createRunConfig('short', 'standard'));
    buildFloor(state, new SeededRNG('pursuer-arena-rng'), 5);

    linger(state, LINGER_TURNS + 60);
    expect(pursuerOf(state)).toBeUndefined();

    for (const enemy of state.entities) enemy.hp = 0;
    linger(state, LINGER_TURNS + 60);
    expect(pursuerOf(state)).toBeUndefined();
  });
});
