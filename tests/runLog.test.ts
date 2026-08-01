import { describe, it, expect } from 'vitest';
import { dispatchAction } from '../src/core/engine';
import { buildFloor, coinsPerKill, createCoinCache, createNewGame } from '../src/core/game';
import { SeededRNG } from '../src/core/rng';
import { createRunConfig } from '../src/core/runConfig';
import { RunRecorder } from '../src/telemetry/runLog';
import { createMockGameState, createMockEnemy } from './helpers';

/** Walkable neighbour of the player, so a test moves rather than bumps a wall. */
function step(state: ReturnType<typeof createMockGameState>) {
  const { x, y } = state.player.position;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const type = state.floorMap.tiles[y + dy]?.[x + dx]?.type;
    if (type === 'floor' || type === 'door') return { dx, dy, x: x + dx, y: y + dy };
  }
  throw new Error('player is walled in');
}

/** Drive one action through the same beginTurn/dispatch/endTurn sequence main.ts uses. */
function act(
  recorder: RunRecorder,
  state: ReturnType<typeof createMockGameState>,
  action: Parameters<typeof dispatchAction>[1]
) {
  recorder.beginTurn(state, action);
  const { events } = dispatchAction(state, action);
  recorder.endTurn(state, events);
}

describe('RunRecorder coin telemetry', () => {
  it('attributes a coin cache pickup to region 0, source cache', () => {
    const state = createMockGameState();
    const recorder = new RunRecorder(state);
    const target = step(state);
    state.floorMap.drops = [
      { item: createCoinCache(17, 'cache_1'), position: { x: target.x, y: target.y } },
    ];

    act(recorder, state, { type: 'MOVE', dx: target.dx, dy: target.dy });

    expect(recorder.snapshot().coinsEarned['0:cache']).toBe(17);
    expect(recorder.snapshot().coinsEarned['0:kill']).toBeUndefined();
  });

  it('attributes a kill bounty to region 0, source kill', () => {
    const state = createMockGameState();
    const recorder = new RunRecorder(state);
    const target = step(state);
    const enemy = createMockEnemy({ x: target.x, y: target.y });
    enemy.hp = 1;
    state.entities = [enemy];

    act(recorder, state, { type: 'MOVE', dx: target.dx, dy: target.dy });

    expect(recorder.snapshot().coinsEarned['0:kill']).toBe(coinsPerKill(0, false));
  });

  it('checkpoints the purse when a boss falls, then records the shop spend', () => {
    const state = createNewGame('runlog-shop', createRunConfig('short', 'standard'));
    const recorder = new RunRecorder(state);
    buildFloor(state, new SeededRNG('runlog-shop-rng'), 5);
    const boss = state.entities[0];
    boss.position = { x: state.player.position.x + 1, y: state.player.position.y };
    boss.hp = 1;
    state.player.coins = 500;

    act(recorder, state, { type: 'MOVE', dx: 1, dy: 0 });

    const afterBoss = recorder.snapshot();
    expect(afterBoss.coinCheckpoints).toHaveLength(1);
    expect(afterBoss.coinCheckpoints[0]).toEqual({
      floor: 5,
      region: 0,
      coins: state.player.coins,
    });

    const offer = state.shop!.stock[0];
    act(recorder, state, { type: 'BUY_ITEM', offerId: offer.id });

    expect(recorder.snapshot().coinsSpent[offer.item.name]).toBe(offer.price);
  });
});
