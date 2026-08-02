import { describe, expect, it } from 'vitest';
import { createNewGame, xpToNextLevel } from '../src/core/game';
import { dispatchAction, grantXp } from '../src/core/engine';
import { createRunConfig } from '../src/core/runConfig';
import { createShop } from '../src/core/shop';
import { SeededRNG } from '../src/core/rng';
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

  it('persists coins and any cache still lying on the floor', () => {
    const state = playedRun('save-coins', 5);
    state.player.coins = 137;

    const restored = roundTrip(state)!;

    // The purse is what the merchant reads, so losing it on resume would erase
    // a region's worth of income.
    expect(restored.player.coins).toBe(137);
    expect(restored.floorMap.drops).toEqual(state.floorMap.drops);
  });

  it('persists level, banked XP, and the stats levelling bought', () => {
    const state = playedRun('save-xp', 5);
    grantXp(state, xpToNextLevel(1) + xpToNextLevel(2) + 12, []);
    const levelled = {
      level: state.player.level,
      xp: state.player.xp,
      maxHp: state.player.maxHp,
      attackPower: state.player.attackPower,
    };

    const restored = roundTrip(state)!;

    // Losing this on resume would silently undo every fight the run has taken.
    expect(restored.player.level).toBe(levelled.level);
    expect(restored.player.xp).toBe(levelled.xp);
    expect(restored.player.maxHp).toBe(levelled.maxHp);
    expect(restored.player.attackPower).toBe(levelled.attackPower);
  });

  it('does not bring back a pending level-up splash on resume', () => {
    const state = playedRun('save-splash', 5);
    grantXp(state, xpToNextLevel(1), []);
    expect(state.lastLevelUp).not.toBeNull();

    // The splash belongs to the turn it was earned on. Resuming is not that turn,
    // so it must arrive spent rather than replayed.
    expect(roundTrip(state)!.lastLevelUp).toBeNull();
  });

  it('does not bring back a pending boss-defeat splash on resume', () => {
    const state = playedRun('save-boss-splash', 5);
    state.lastBossDefeat = {
      floor: 5,
      regionName: 'The Shifting Halls',
      bossName: 'Hinge Sovereign',
    };

    // Same one-turn contract as the level-up splash: the guardian falls once, and
    // a resumed run is not that turn.
    expect(roundTrip(state)!.lastBossDefeat).toBeNull();
  });

  it('keeps a cleared region across a resume, so the floor stays stabilized', () => {
    const state = playedRun('save-stabilized', 5);
    state.clearedRegions = [0];

    expect(roundTrip(state)!.clearedRegions).toEqual([0]);
  });

  it('keeps refused armor refused across a resume', () => {
    const state = playedRun('save-declines', 5);
    state.declinedArmorIds = ['armor_5', 'armor_3'];

    // Losing these would put the swap prompt back in the player's face on the
    // first step after a resume, for pieces they have already turned down.
    expect(roundTrip(state)!.declinedArmorIds).toEqual(['armor_5', 'armor_3']);
  });

  it('resumes a run saved before declines could stick with none recorded', () => {
    const state = playedRun('save-pre-declines', 5);
    const saved = structuredClone(encodeRun(state));
    delete (saved.state as Partial<GameState>).declinedArmorIds;

    // Backfilled rather than discarded — the run simply asks once more.
    expect(decodeRun(saved)!.declinedArmorIds).toEqual([]);
  });

  it('resumes a run saved before levels existed at level 1', () => {
    const state = playedRun('save-pre-xp', 5);
    const saved = structuredClone(encodeRun(state));
    delete (saved.state.player as Partial<GameState['player']>).level;
    delete (saved.state.player as Partial<GameState['player']>).xp;

    const restored = decodeRun(saved)!;

    expect(restored.player.level).toBe(1);
    expect(restored.player.xp).toBe(0);
  });

  it('brings the merchant back with the same stock, standing on the same tile', () => {
    const state = playedRun('save-shop', 5);
    state.shop = createShop(new SeededRNG('save-shop-stock'), 2, 15, { x: 7, y: 4 });

    const restored = roundTrip(state)!;

    // Rerolling on resume would let a player close the tab until the stock suited them.
    expect(restored.shop).toEqual(state.shop);
    // The stock is reached by bumping him, so losing his tile would leave a shop
    // with no way in at all.
    expect(restored.shop!.position).toEqual({ x: 7, y: 4 });
  });

  it('does not reopen the merchant on resume', () => {
    const state = playedRun('save-shop-open', 5);
    state.shop = createShop(new SeededRNG('save-shop-open-stock'), 2, 15, { x: 7, y: 4 });
    state.shopOpened = true;

    expect(roundTrip(state)!.shopOpened).toBe(false);
  });

  it('stands a merchant saved before he had a tile on the floor entrance', () => {
    const state = playedRun('save-shop-legacy', 5);
    state.shop = createShop(new SeededRNG('save-shop-legacy-stock'), 2, 15, { x: 7, y: 4 });
    const saved = structuredClone(encodeRun(state));
    delete (saved.state.shop as Partial<NonNullable<GameState['shop']>>).position;

    const restored = decodeRun(saved)!;

    expect(restored.shop!.position).toEqual(state.floorMap.entrance);
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
