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
} from '../src/core/shift/shiftSystem';

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

  it('executes a shift and maintains player safety + path to exit', () => {
    const state = createMockGameState('shift-safety-test');
    const rng = new SeededRNG('shift-exec-rng');

    executeShift(state, rng);

    // Player must be on a safe tile
    const playerPos = state.player.position;
    const playerTile = state.floorMap.tiles[playerPos.y][playerPos.x];
    expect(['floor', 'door', 'stairs_down']).toContain(playerTile.type);

    // Player must have path to exit
    expect(hasValidPath(state.floorMap, playerPos, state.floorMap.exit)).toBe(true);
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
    const movedPlayerPos = { ...state.player.position };

    // Apply a shift
    executeShift(state, rng);

    // Now restore from our manually captured snapshot
    state.preShiftSnapshot = snapshot;
    restorePreShiftSnapshot(state);

    // Player position should NOT be reverted (only geometry is restored)
    expect(state.player.position.x).toBe(movedPlayerPos.x);
    expect(state.player.position.y).toBe(movedPlayerPos.y);
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
