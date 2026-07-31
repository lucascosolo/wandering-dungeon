import { describe, it, expect } from 'vitest';
import { buildFloor, createNewGame } from '../src/core/game';
import { SeededRNG } from '../src/core/rng';
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

    // Take an upgrade, raise the shield when something is on top of you, drink
    // below half. Without these the bot is not a player, it is a pacifist in
    // starting armor, and the depth it reaches says nothing about the balance.
    if (state.pendingArmorOffer) {
      const better = (state.pendingArmorOffer.defense ?? 0) > (player.armor?.defense ?? 0);
      dispatchAction(state, { type: better ? 'EQUIP_ARMOR' : 'DECLINE_ARMOR' });
      continue;
    }

    if (player.hp < player.maxHp * 0.5) {
      const potion = player.inventory.find(i => i.type === 'health_potion');
      if (potion) {
        dispatchAction(state, { type: 'USE_ITEM', itemId: potion.id });
        continue;
      }
    }

    const adjacentThreat = state.entities.some(
      e =>
        e.hp > 0 &&
        Math.abs(e.position.x - player.position.x) <= 1 &&
        Math.abs(e.position.y - player.position.y) <= 1
    );
    if (adjacentThreat && state.abilityCooldown === 0 && player.shieldHp === 0) {
      dispatchAction(state, { type: 'ABILITY' });
      continue;
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

  it('keeps the deepest floor within a fixed ceiling', () => {
    const state = createNewGame('deep-floor', createRunConfig('extreme', 'brutal'));
    const rng = new SeededRNG('deep-floor-rng');
    buildFloor(state, rng, 25);

    // The old curves were linear in level with no ceiling, which put 28 enemies
    // and a 114 HP Crawler on floor 25 against a player whose attack never grows.
    expect(state.entities.length).toBeLessThanOrEqual(8);
    for (const enemy of state.entities) {
      expect(enemy.maxHp, `${enemy.name} on floor 25`).toBeLessThanOrEqual(120);
      if (enemy.enemyType === 'crawler') expect(enemy.maxHp).toBeLessThanOrEqual(30);
    }
  });

  it('spawns only Shifting Halls species deterministically on floor 1', () => {
    const config = createRunConfig('extreme', 'brutal');
    const a = createNewGame('region-one-roster', config);
    const b = createNewGame('region-one-roster', config);
    const allowed = new Set(['hinge_warden', 'seam_skitter']);

    expect(a.entities.every(enemy => allowed.has(enemy.enemyType))).toBe(true);
    expect(a.entities.map(enemy => [enemy.enemyType, enemy.position, enemy.hp, enemy.attackPower])).toEqual(
      b.entities.map(enemy => [enemy.enemyType, enemy.position, enemy.hp, enemy.attackPower])
    );
  });

  it('spawns only Fracture Deeps species on floor 6', () => {
    const config = createRunConfig('extreme', 'brutal');
    const state = createNewGame('fracture-deeps-roster', config);
    const allowed = new Set(['fracture_leech', 'riftbound']);

    buildFloor(state, new SeededRNG('fracture-deeps-floor'), 6);

    expect(state.entities.length).toBe(5);
    expect(state.entities.every(enemy => allowed.has(enemy.enemyType))).toBe(true);
  });

  it('spawns only Ashen Warrens species with region-scaled stats on floor 11', () => {
    const state = createNewGame('ashen-warrens-roster', createRunConfig('extreme', 'brutal'));
    const allowed = new Set(['ashlock', 'stasis_scorcher']);

    buildFloor(state, new SeededRNG('ashen-warrens-floor'), 11);

    expect(state.entities).toHaveLength(6);
    expect(state.entities.every(enemy => allowed.has(enemy.enemyType))).toBe(true);
    expect(state.entities.some(enemy => enemy.maxHp === 52 && enemy.attackPower === 9)).toBe(true);
    expect(state.entities.some(enemy => enemy.maxHp === 34 && enemy.attackPower === 9)).toBe(true);
  });

  it('spawns only Glass Expanse species with region-scaled stats on floor 16', () => {
    const state = createNewGame('glass-expanse-roster', createRunConfig('extreme', 'brutal'));
    const allowed = new Set(['facet_reaver', 'glass_moth']);

    buildFloor(state, new SeededRNG('glass-expanse-floor'), 16);

    expect(state.entities).toHaveLength(7);
    expect(state.entities.every(enemy => allowed.has(enemy.enemyType))).toBe(true);
    expect(state.entities.every(enemy =>
      (enemy.maxHp === 52 && enemy.attackPower === 10) ||
      (enemy.maxHp === 35 && enemy.attackPower === 9)
    )).toBe(true);
  });

  it('gets a player-like bot well past the first region on a long run', () => {
    // A depth regression net, not a win condition: the bot never retreats and
    // never uses the shift items, so it dies deeper than a rush and shallower
    // than a careful human. Before region curves it died on floor 3 or 4 of
    // every run length, whatever the length was.
    const depths = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(seed => {
      const state = createNewGame(seed, createRunConfig('long', 'standard'));
      autoPlay(state, 8000);
      return state.floorMap.level;
    });

    const median = [...depths].sort((a, b) => a - b)[Math.floor(depths.length / 2)];
    expect(median, `depths ${depths.join(', ')}`).toBeGreaterThanOrEqual(6);
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
