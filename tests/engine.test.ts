import { describe, it, expect } from 'vitest';
import { dispatchAction } from '../src/core/engine';
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
