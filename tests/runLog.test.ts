import { describe, it, expect, afterEach } from 'vitest';
import { dispatchAction, grantXp } from '../src/core/engine';
import {
  buildFloor,
  coinsPerKill,
  createCoinCache,
  createNewGame,
  xpPerKill,
  xpToNextLevel,
} from '../src/core/game';
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

describe('RunRecorder XP telemetry', () => {
  it('attributes kill XP to region 0 without disturbing the coin bounty', () => {
    const state = createMockGameState();
    const recorder = new RunRecorder(state);
    const target = step(state);
    const enemy = createMockEnemy({ x: target.x, y: target.y });
    enemy.hp = 1;
    state.entities = [enemy];

    act(recorder, state, { type: 'MOVE', dx: target.dx, dy: target.dy });

    const log = recorder.snapshot();
    expect(log.xpEarned['0:kill']).toBe(xpPerKill('crawler', 0));
    // The kill line carries both numbers now — the coin figure must still parse.
    expect(log.coinsEarned['0:kill']).toBe(coinsPerKill(0, false));
  });

  it('checkpoints the level a region was cleared at and tracks the level reached', () => {
    const state = createNewGame('runlog-xp-boss', createRunConfig('short', 'standard'));
    const recorder = new RunRecorder(state);
    buildFloor(state, new SeededRNG('runlog-xp-boss-rng'), 5);
    const boss = state.entities[0];
    boss.position = { x: state.player.position.x + 1, y: state.player.position.y };
    boss.hp = 1;
    // The boss alone is not a level, so give the run the fight history a real
    // clear would have arrived with.
    grantXp(state, xpToNextLevel(1) + xpToNextLevel(2), []);

    act(recorder, state, { type: 'MOVE', dx: 1, dy: 0 });

    const log = recorder.snapshot();
    expect(log.levelCheckpoints).toEqual([
      {
        floor: 5,
        region: 0,
        level: state.player.level,
        xp: state.player.xp,
      },
    ]);
    expect(log.levelReached).toBe(state.player.level);
    expect(log.xpEarned['0:kill']).toBe(xpPerKill(boss.enemyType, 0));
  });
});

/**
 * The POST path only ever existed for the dev server's `/__runlog`. These pin
 * the two ways it must go quiet, because the failure they replace was silent and
 * expensive: a hosted build re-sending the whole growing log every 25 turns, plus
 * a beacon on every backgrounding, over a tester's mobile data, forever.
 */
describe('RunRecorder POST kill-switch', () => {
  function recorderWithHistory() {
    const state = createMockGameState();
    const recorder = new RunRecorder(state);
    const { dx, dy } = step(state);
    act(recorder, state, { type: 'MOVE', dx, dy });
    return recorder;
  }

  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  it('stops posting after an HTTP error status, which never rejects the promise', async () => {
    const calls: string[] = [];
    globalThis.fetch = ((url: string) => {
      calls.push(url);
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }) as typeof fetch;

    const recorder = recorderWithHistory();
    recorder.flush();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toHaveLength(1);
    expect(recorder.posting).toBe(false);

    recorder.flush();
    expect(calls).toHaveLength(1);
  });

  it('stops posting after a network failure', async () => {
    let calls = 0;
    globalThis.fetch = (() => {
      calls++;
      return Promise.reject(new Error('offline'));
    }) as typeof fetch;

    const recorder = recorderWithHistory();
    recorder.flush();
    await Promise.resolve();
    await Promise.resolve();

    expect(recorder.posting).toBe(false);
    recorder.flush();
    expect(calls).toBe(1);
  });

  it('keeps posting while the endpoint answers', async () => {
    let calls = 0;
    globalThis.fetch = (() => {
      calls++;
      return Promise.resolve({ ok: true, status: 204 } as Response);
    }) as typeof fetch;

    const recorder = recorderWithHistory();
    recorder.flush();
    await Promise.resolve();
    await Promise.resolve();
    recorder.flush();

    expect(calls).toBe(2);
    expect(recorder.posting).toBe(true);
  });

  it('never posts an empty log', () => {
    let calls = 0;
    globalThis.fetch = (() => {
      calls++;
      return Promise.resolve({ ok: true } as Response);
    }) as typeof fetch;

    new RunRecorder(createMockGameState()).flush();
    expect(calls).toBe(0);
  });
});
