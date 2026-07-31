import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/core/game';
import { dispatchAction } from '../src/core/engine';
import { createRunConfig } from '../src/core/runConfig';
import { decodeRun, encodeRun, SAVE_VERSION } from '../src/core/save';
import { GameState } from '../src/core/state';

/** What idb-keyval does to a value on the way in and back out. */
function roundTrip(state: GameState): GameState | null {
  return decodeRun(structuredClone(encodeRun(state)));
}

function playedRun(seed: string, turns: number): GameState {
  const state = createNewGame(seed, createRunConfig('medium', 'standard'));
  for (let i = 0; i < turns; i++) {
    if (i % 3 === 0) dispatchAction(state, { type: 'MOVE', dx: 1, dy: 0 });
    else dispatchAction(state, { type: 'WAIT' });
  }
  return state;
}

describe('Run persistence', () => {
  it('restores a mid-floor run identical to the one saved', () => {
    const state = playedRun('save-identity', 25);
    const restored = roundTrip(state);

    expect(restored).toEqual(state);
  });

  it('keeps the RNG on the same sequence after a resume', () => {
    const state = playedRun('save-rng', 25);
    const restored = roundTrip(state)!;
    expect(restored.rngState).toEqual(state.rngState);

    // The real proof is continuity, not the counter: playing on from the restored
    // copy must produce exactly what playing on from the original would.
    for (let i = 0; i < 20; i++) {
      dispatchAction(state, { type: 'WAIT' });
      dispatchAction(restored, { type: 'WAIT' });
    }

    expect(restored).toEqual(state);
    expect(restored.rngState.callCount).toBe(state.rngState.callCount);
  });

  it('persists cleared regions and boss rewards across resume', () => {
    const state = playedRun('save-boss-clear', 5);
    state.clearedRegions = [0, 1];
    state.player.inventory.push({
      id: 'boss_reward_5',
      type: 'hourglass_shard',
      name: 'Hourglass Shard',
      description: 'Adds 3 turns to the shift countdown.',
      category: 'stabilization',
    });

    const restored = roundTrip(state)!;

    expect(restored.clearedRegions).toEqual([0, 1]);
    expect(restored.player.inventory.some(item => item.id === 'boss_reward_5')).toBe(true);
  });

  it('survives a shift, which is the state most likely to diverge', () => {
    const state = createNewGame('save-shift', createRunConfig('medium', 'standard'));
    while (state.pendingShift === null && state.turnCount < 60) {
      dispatchAction(state, { type: 'WAIT' });
    }
    expect(state.pendingShift).not.toBeNull();

    const restored = roundTrip(state)!;
    // Resuming with a shift telegraphed must execute the same diff, or the
    // warning the player saw before closing the tab becomes a lie.
    expect(restored.pendingShift).toEqual(state.pendingShift);

    dispatchAction(state, { type: 'WAIT' });
    dispatchAction(restored, { type: 'WAIT' });
    expect(restored.floorMap.tiles).toEqual(state.floorMap.tiles);
    expect(restored.lastShiftChanges).toEqual(state.lastShiftChanges);
  });

  it('refuses a save from another version', () => {
    const state = playedRun('save-version', 3);
    const stale = { ...encodeRun(state), version: SAVE_VERSION + 1 };

    expect(decodeRun(stale)).toBeNull();
  });

  it('refuses a finished run and a missing save', () => {
    const state = playedRun('save-over', 3);
    state.isGameOver = true;

    expect(roundTrip(state)).toBeNull();
    expect(decodeRun(undefined)).toBeNull();
  });
});
