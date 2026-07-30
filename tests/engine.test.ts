import { describe, it, expect } from 'vitest';
import { dispatchAction } from '../src/core/engine';
import { damagePlayer } from '../src/core/damage';
import { Item } from '../src/core/state';
import { createMockGameState, createMockEnemy } from './helpers';

describe('Turn Engine & Items', () => {
  it('decrements shift countdown on turn-consuming actions, not non-turn actions', () => {
    const state = createMockGameState();
    const initialCountdown = state.shiftCountdown;

    dispatchAction(state, { type: 'INSPECT_TILE', x: 2, y: 2 });
    expect(state.shiftCountdown).toBe(initialCountdown); // 0 turns consumed

    dispatchAction(state, { type: 'WAIT' });
    expect(state.shiftCountdown).toBe(initialCountdown - 1); // 1 turn consumed
  });

  it('Haste Sigil forces shift immediately and reduces next max countdown by 2', () => {
    const state = createMockGameState();
    const initialMax = state.nextShiftCountdownMax;
    dispatchAction(state, { type: 'USE_ITEM', itemId: 'haste_1' });
    expect(state.nextShiftCountdownMax).toBe(initialMax - 2);
  });

  it('Stasis Flask pauses the countdown for its duration', () => {
    const state = createMockGameState();
    dispatchAction(state, { type: 'USE_ITEM', itemId: 'stasis_1' });
    const countdown = state.shiftCountdown;

    dispatchAction(state, { type: 'WAIT' });
    expect(state.shiftCountdown).toBe(countdown); // frozen
    // Drinking the flask cost a turn (6 -> 5); the WAIT cost another.
    expect(state.stasisTurnsRemaining).toBe(4);
  });

  it('moving into an adjacent enemy attacks it instead of moving', () => {
    const state = createMockGameState();
    const { x, y } = state.player.position;
    const enemy = createMockEnemy({ x: x + 1, y });
    state.entities.push(enemy);

    dispatchAction(state, { type: 'MOVE', dx: 1, dy: 0 });

    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(state.player.position).toEqual({ x, y });
  });

  it('kills an enemy that drops to zero HP and removes it from the floor', () => {
    const state = createMockGameState();
    const { x, y } = state.player.position;
    const enemy = createMockEnemy({ x: x + 1, y });
    enemy.hp = 1;
    state.entities.push(enemy);

    dispatchAction(state, { type: 'MOVE', dx: 1, dy: 0 });

    expect(state.entities.find(e => e.id === enemy.id)).toBeUndefined();
  });

  it('ends the game when the player runs out of HP', () => {
    const state = createMockGameState();
    state.player.hp = 1;
    const { x, y } = state.player.position;
    const enemy = createMockEnemy({ x: x + 1, y });
    enemy.attackPower = 50;
    state.entities.push(enemy);

    dispatchAction(state, { type: 'WAIT' });

    expect(state.player.hp).toBeLessThanOrEqual(0);
    expect(state.isGameOver).toBe(true);
  });

  it('advances the RNG state deterministically across dispatches', () => {
    const a = createMockGameState('determinism-seed');
    const b = createMockGameState('determinism-seed');

    for (let i = 0; i < 12; i++) {
      dispatchAction(a, { type: 'WAIT' });
      dispatchAction(b, { type: 'WAIT' });
    }

    expect(a.rngState.callCount).toBe(b.rngState.callCount);
    expect(a.player.hp).toBe(b.player.hp);
    expect(a.floorMap.tiles).toEqual(b.floorMap.tiles);
  });

  it('triggers a shift when the countdown expires and resets it to the max', () => {
    const state = createMockGameState();
    state.shiftCountdown = 1;

    dispatchAction(state, { type: 'WAIT' });

    expect(state.shiftCountdown).toBe(state.nextShiftCountdownMax);
    expect(state.eventLog.some(m => m.type === 'shift')).toBe(true);
  });
});

describe('Armor', () => {
  const armor = (id: string, defense: number): Item => ({
    id,
    type: 'padded_vest',
    name: `Vest ${defense}`,
    description: '',
    category: 'armor',
    defense,
  });

  /** Walkable neighbour of the player, so the test moves rather than bumps a wall. */
  function stepTarget(state: ReturnType<typeof createMockGameState>) {
    const { x, y } = state.player.position;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const type = state.floorMap.tiles[y + dy]?.[x + dx]?.type;
      if (type === 'floor' || type === 'door') return { dx, dy, x: x + dx, y: y + dy };
    }
    throw new Error('player is walled in');
  }

  it('soaks damage but never all of it', () => {
    const state = createMockGameState();
    state.player.armor = armor('a', 100);
    damagePlayer(state, 10, []);
    expect(state.player.hp).toBe(99);
  });

  it('equips the first piece automatically and asks before replacing one', () => {
    const state = createMockGameState();
    const step = stepTarget(state);
    state.floorMap.drops = [{ item: armor('found_1', 3), position: { x: step.x, y: step.y } }];

    dispatchAction(state, { type: 'MOVE', dx: step.dx, dy: step.dy });
    expect(state.player.armor?.id).toBe('found_1');
    expect(state.pendingArmorOffer).toBeNull();
    expect(state.floorMap.drops).toHaveLength(0);

    // A second piece underfoot is an offer, not a pickup — it stays on the floor.
    state.floorMap.drops.push({ item: armor('found_2', 5), position: { ...state.player.position } });
    dispatchAction(state, { type: 'MOVE', dx: -step.dx, dy: -step.dy });
    dispatchAction(state, { type: 'MOVE', dx: step.dx, dy: step.dy });
    expect(state.pendingArmorOffer?.id).toBe('found_2');
    expect(state.player.armor?.id).toBe('found_1');

    dispatchAction(state, { type: 'EQUIP_ARMOR' });
    expect(state.player.armor?.id).toBe('found_2');
    expect(state.pendingArmorOffer).toBeNull();
    // The replaced piece lands where the player is standing.
    expect(state.floorMap.drops.map(d => d.item.id)).toEqual(['found_1']);
  });

  it('declining leaves the piece on the floor and costs no turn', () => {
    const state = createMockGameState();
    state.player.armor = armor('worn', 2);
    state.pendingArmorOffer = armor('offered', 9);
    const turn = state.turnCount;

    dispatchAction(state, { type: 'DECLINE_ARMOR' });
    expect(state.player.armor?.id).toBe('worn');
    expect(state.pendingArmorOffer).toBeNull();
    expect(state.turnCount).toBe(turn);
  });
});
