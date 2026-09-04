import { describe, it, expect } from 'vitest';
import { createItem } from '../src/core/game';
import { applyRiftShard } from '../src/core/items/itemEffects';
import { dispatchAction } from '../src/core/engine';
import { createMockGameState, createMockEnemy } from './helpers';
import { hotbarItems } from '../src/ui/hud';

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
  function sealedCorridor(seed: string) {
    const state = createMockGameState(seed);
    const { width, height, tiles } = state.floorMap;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) tiles[y][x].type = 'wall';
    }
    const y = state.player.position.y;
    const startX = state.player.position.x;
    const corridor = [0, 1, 2, 3].map(i => startX + i).filter(x => x < width);
    for (const x of corridor) tiles[y][x].type = 'floor';
    return { state, y, startX, corridor, width, height };
  }

  it('tears through the seal to the nearest tile that reconnects with the stairs', () => {
    const { state, y, startX, corridor, height } = sealedCorridor('rift-fallback-reconnect');
    // A second corridor two rows down, walled off from the first, holding the exit.
    const y2 = (y + 2) % height;
    for (const x of corridor) state.floorMap.tiles[y2][x].type = 'floor';
    state.floorMap.exit = { x: corridor[corridor.length - 1], y: y2 };
    state.floorMap.tiles[y2][state.floorMap.exit.x].type = 'stairs_down';
    state.entities = [createMockEnemy({ x: corridor[1], y }, 'pursuer')];

    const events = applyRiftShard(state);

    expect(state.player.position).toEqual(state.floorMap.exit);
    expect(events[0]).toMatch(/seal/i);
    expect(startX).toBe(corridor[0]);
  });

  it('blinks through walls to the tile that maximizes distance from the Pursuer when nothing in range reconnects', () => {
    const { state, y, corridor, height } = sealedCorridor('rift-fallback');
    // Exit rows away and unreachable from anything in range; a lone floor tile
    // sits behind a wall, 4 steps off in manhattan distance but 0 walkable steps.
    const yFar = (y + 3) % height;
    state.floorMap.tiles[yFar][corridor[0]].type = 'floor';
    state.floorMap.exit = { x: 0, y: (y + 6) % height };
    state.entities = [createMockEnemy({ x: corridor[1], y }, 'pursuer')];

    const events = applyRiftShard(state);

    expect(state.player.position).toEqual({ x: corridor[0], y: yFar });
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
    tiles[py][px + 1].type = 'floor';
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

describe('Rift Shard — emergency grant only when truly caught', () => {
  function sealedPocket(seed: string) {
    const state = createMockGameState(seed);
    const { width, height, tiles } = state.floorMap;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) tiles[y][x].type = 'wall';
    }
    const py = state.player.position.y;
    const px = state.player.position.x;
    tiles[py][px].type = 'floor';
    state.floorMap.exit = { x: px, y: (py + 1) % height };
    return { state, px, py };
  }

  it('does not grant while the Pursuer is adjacent but still inside a wall', () => {
    const { state, px, py } = sealedPocket('rift-emergency-in-wall');
    state.entities = [createMockEnemy({ x: px + 1, y: py }, 'pursuer')];

    dispatchAction(state, { type: 'WAIT' });

    expect(state.floorMap.tiles[py][px + 1].type).toBe('wall');
    expect(state.player.inventory.some(i => i.type === 'rift_shard')).toBe(false);
  });

  it('does not grant while the adjacent Pursuer is still stalled from phasing', () => {
    const { state, px, py } = sealedPocket('rift-emergency-staggered');
    state.floorMap.tiles[py][px + 1].type = 'floor';
    const pursuer = createMockEnemy({ x: px + 1, y: py }, 'pursuer');
    pursuer.staggeredTurns = 2;
    state.entities = [pursuer];

    dispatchAction(state, { type: 'WAIT' });

    expect(state.player.inventory.some(i => i.type === 'rift_shard')).toBe(false);
  });
});

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

  it('behaves normally with no Rift Shard held', () => {
    const state = createMockGameState('rift-hotbar-no-shard');
    state.player.inventory = [
      createItem('stasis_flask', 'a'),
      createItem('hourglass_shard', 'b'),
    ];

    const slots = hotbarItems(state);

    expect(slots).toHaveLength(2);
    expect(slots.some(item => item.type === 'rift_shard')).toBe(false);
  });
});
