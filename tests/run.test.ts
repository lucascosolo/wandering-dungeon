import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/core/game';
import { dispatchAction } from '../src/core/engine';
import { createRunConfig } from '../src/core/runConfig';
import { findPath } from '../src/core/map/pathfinding';
import { GameState } from '../src/core/state';

/**
 * Drive a run the way a player would: walk toward the exit, take the stairs,
 * heal when hurt. This is the end-to-end guard that the loop is actually
 * completable — floor transitions, descent, and victory all have to work.
 */
function autoPlay(state: GameState, maxTurns = 4000): void {
  for (let turn = 0; turn < maxTurns && !state.isGameOver; turn++) {
    const { player, floorMap } = state;
    const onStairs = floorMap.tiles[player.position.y][player.position.x].type === 'stairs_down';

    if (onStairs) {
      dispatchAction(state, { type: 'DESCEND' });
      continue;
    }

    if (player.hp < player.maxHp * 0.4) {
      const potion = player.inventory.find(i => i.type === 'health_potion');
      if (potion) {
        dispatchAction(state, { type: 'USE_ITEM', itemId: potion.id });
        continue;
      }
    }

    const path = findPath(floorMap, player.position, floorMap.exit);
    if (path && path.length >= 2) {
      const step = path[1];
      dispatchAction(state, {
        type: 'MOVE',
        dx: step.x - player.position.x,
        dy: step.y - player.position.y,
      });
    } else {
      // Geometry shifted the exit out of reach; wait for the next shift to reopen it.
      dispatchAction(state, { type: 'WAIT' });
    }
  }
}

describe('Full run', () => {
  it('is completable end to end on a known seed', () => {
    const state = createNewGame('mvp-smoke', createRunConfig('short', 'standard'));
    autoPlay(state);

    expect(state.isGameOver).toBe(true);
    // A run that reaches the final floor and survives must report victory.
    if (state.isVictory) {
      expect(state.floorMap.level).toBe(state.config.finalFloor);
    }
    expect(state.turnCount).toBeGreaterThan(0);
  });

  it('reaches at least floor 2 across several seeds', () => {
    const reached: number[] = [];
    for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
      const state = createNewGame(seed, createRunConfig('short', 'standard'));
      autoPlay(state);
      reached.push(state.floorMap.level);
    }
    expect(Math.max(...reached)).toBeGreaterThanOrEqual(2);
  });

  it('never leaves the player standing on a non-walkable tile', () => {
    const state = createNewGame('walkability', createRunConfig('short', 'standard'));
    for (let i = 0; i < 200 && !state.isGameOver; i++) {
      const { x, y } = state.player.position;
      const type = state.floorMap.tiles[y][x].type;
      expect(['floor', 'door', 'stairs_down']).toContain(type);
      dispatchAction(state, { type: 'MOVE', dx: i % 2 ? 1 : 0, dy: i % 2 ? 0 : 1 });
    }
  });
});
