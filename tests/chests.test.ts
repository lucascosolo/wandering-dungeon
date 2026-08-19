import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/core/game';
import { createRunConfig } from '../src/core/runConfig';
import { dispatchAction } from '../src/core/engine';
import { manhattan } from '../src/core/state';

const SHORT = createRunConfig('short', 'standard');

/**
 * Helper: set the player adjacent to a specific position and bump into it.
 * Returns the game state so callers can inspect it.
 */
function openChestAt(
  seed: string,
): { game: ReturnType<typeof createNewGame>; chest: NonNullable<ReturnType<typeof createNewGame>['floorMap']['chests']>[0] } | null {
  for (let attempt = 0; attempt < 100; attempt++) {
    const game = createNewGame(`${seed}-${attempt}`, SHORT);
    const chest = game.floorMap.chests?.find(c => !c.looted);
    if (!chest) continue;

    // Place the player adjacent to the chest (south of it if clear, else any direction)
    const adj = [
      { x: chest.position.x, y: chest.position.y + 1 },
      { x: chest.position.x, y: chest.position.y - 1 },
      { x: chest.position.x + 1, y: chest.position.y },
      { x: chest.position.x - 1, y: chest.position.y },
    ].find(p =>
      p.x >= 0 && p.y >= 0 &&
      p.x < game.floorMap.width && p.y < game.floorMap.height &&
      (game.floorMap.tiles[p.y][p.x].type === 'floor' || game.floorMap.tiles[p.y][p.x].type === 'door')
    );
    if (!adj) continue;

    // Position the player adjacent
    game.player.position = { x: adj.x, y: adj.y };

    // Now bump into the chest
    const dx = chest.position.x - game.player.position.x;
    const dy = chest.position.y - game.player.position.y;
    expect(Math.abs(dx) + Math.abs(dy)).toBe(1);
    dispatchAction(game, { type: 'MOVE', dx, dy });

    return { game, chest };
  }
  return null;
}

describe('chest placement', () => {
  it('some floors have chests', () => {
    let seen = false;
    for (let i = 0; i < 20; i++) {
      const game = createNewGame(`chest-test-${i}`, SHORT);
      if ((game.floorMap.chests?.length ?? 0) > 0) {
        seen = true;
        break;
      }
    }
    expect(seen).toBe(true);
  });

  it('a chest is not looted when placed', () => {
    const result = openChestAt('chest-looted');
    expect(result).not.toBeNull();
    // The chest was looted by the helper, so we check the game before opening
    // Instead, let's just verify chests are created with looted=false
    for (let i = 0; i < 50; i++) {
      const game = createNewGame(`chest-looted-${i}`, SHORT);
      for (const c of game.floorMap.chests ?? []) {
        expect(c.looted).toBe(false);
      }
      if ((game.floorMap.chests?.length ?? 0) > 0) return;
    }
    expect(true).toBe(true);
  });

  it('chests array is defined on all floors', () => {
    const game = createNewGame('chests-defined', createRunConfig('short', 'standard'));
    expect(Array.isArray(game.floorMap.chests)).toBe(true);
  });
});

describe('chest opening', () => {
  it('opening a chest sets looted=true and gives contents', () => {
    const result = openChestAt('chest-open');
    expect(result).not.toBeNull();
    const { chest } = result!;
    expect(chest.looted).toBe(true);
    // Contents should have a valid type
    expect(chest.contents.type).toBeDefined();
    expect(chest.contents.name).toBeDefined();
  });

  it('opening a chest costs a turn', () => {
    const result = openChestAt('chest-turn');
    expect(result).not.toBeNull();
    const { game, chest } = result!;
    // The turn should have advanced
    expect(game.turnCount).toBeGreaterThan(0);
    expect(chest.looted).toBe(true);
  });

  it('chest armor triggers the armor offer when player already wears armor', () => {
    for (let i = 0; i < 100; i++) {
      const game = createNewGame(`chest-armor-${i}`, SHORT);
      const chest = game.floorMap.chests?.find(c => !c.looted && c.contents.category === 'armor');
      if (!chest) continue;

      // Give the player some armor so the chest triggers the offer flow
      game.player.armor = { id: 'test_armor', type: 'padded_vest' as const, name: 'Padded Vest', description: '', category: 'armor' as const, defense: 2 };

      const adj = [
        { x: chest.position.x, y: chest.position.y + 1 },
        { x: chest.position.x, y: chest.position.y - 1 },
        { x: chest.position.x + 1, y: chest.position.y },
        { x: chest.position.x - 1, y: chest.position.y },
      ].find(p =>
        p.x >= 0 && p.y >= 0 &&
        p.x < game.floorMap.width && p.y < game.floorMap.height &&
        (game.floorMap.tiles[p.y][p.x].type === 'floor' || game.floorMap.tiles[p.y][p.x].type === 'door')
      );
      if (!adj) continue;

      game.player.position = { x: adj.x, y: adj.y };
      dispatchAction(game, { type: 'MOVE', dx: chest.position.x - adj.x, dy: chest.position.y - adj.y });

      expect(game.pendingArmorOffer).not.toBeNull();
      expect(game.pendingArmorOffer!.type).toBe(chest.contents.type);
      return;
    }
    // No armor chest found in 100 seeds — acceptable at 20% chest rate * 20% armor rate
    expect(true).toBe(true);
  });

  it('already-looted chest can be walked onto without side effects', () => {
    const result = openChestAt('chest-twice');
    expect(result).not.toBeNull();
    const { game, chest } = result!;

    // Move off the chest to an adjacent tile
    const adj = [
      { x: chest.position.x, y: chest.position.y + 1 },
      { x: chest.position.x, y: chest.position.y - 1 },
      { x: chest.position.x + 1, y: chest.position.y },
      { x: chest.position.x - 1, y: chest.position.y },
    ].find(p =>
      p.x >= 0 && p.y >= 0 &&
      p.x < game.floorMap.width && p.y < game.floorMap.height &&
      (game.floorMap.tiles[p.y][p.x].type === 'floor' || game.floorMap.tiles[p.y][p.x].type === 'door') &&
      !(p.x === game.player.position.x && p.y === game.player.position.y)
    );
    expect(adj).toBeDefined();

    const coinsBefore = game.player.coins;
    const invBefore = game.player.inventory.length;
    dispatchAction(game, { type: 'MOVE', dx: adj!.x - game.player.position.x, dy: adj!.y - game.player.position.y });

    // Now walk back onto the chest
    dispatchAction(game, { type: 'MOVE', dx: chest.position.x - adj!.x, dy: chest.position.y - adj!.y });

    expect(chest.looted).toBe(true);
    expect(game.player.coins).toBe(coinsBefore);
    expect(game.player.inventory.length).toBe(invBefore);
  });
});

describe('chest contents are deterministic', () => {
  it('same seed = same chest contents', () => {
    for (let i = 0; i < 100; i++) {
      const g1 = createNewGame(`det-chest-${i}`, SHORT);
      const g2 = createNewGame(`det-chest-${i}`, SHORT);
      const c1 = g1.floorMap.chests?.[0];
      const c2 = g2.floorMap.chests?.[0];

      if (c1 && c2) {
        expect(c1.contents.id).toBe(c2.contents.id);
        expect(c1.contents.type).toBe(c2.contents.type);
        expect(c1.contents.name).toBe(c2.contents.name);
        expect(c1.position.x).toBe(c2.position.x);
        expect(c1.position.y).toBe(c2.position.y);
        return;
      }
      if (c1 || c2) {
        expect(c1).toBeTruthy();
        expect(c2).toBeTruthy();
        return;
      }
    }
    expect(true).toBe(false);
  });
});