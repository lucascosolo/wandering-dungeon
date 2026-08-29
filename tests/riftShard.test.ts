import { describe, it, expect } from 'vitest';
import { createItem } from '../src/core/game';
import { applyRiftShard } from '../src/core/items/itemEffects';
import { createMockGameState, createMockEnemy } from './helpers';

describe('Rift Shard', () => {
  it('is a registered item type with the displacement category', () => {
    const item = createItem('rift_shard', 'rift_test');
    expect(item.type).toBe('rift_shard');
    expect(item.category).toBe('displacement');
    expect(item.name).toBe('Rift Shard');
  });
});

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
