import { describe, it, expect } from 'vitest';
import { loadStoredRunLog, RunLog, TurnRecord } from '../src/telemetry/runLog';
import {
  buildRunReport,
  REPORT_MAX_CHARS,
  REPORT_TAIL_TURNS,
} from '../src/telemetry/runReport';

function turn(t: number, extra: Partial<TurnRecord> = {}): TurnRecord {
  return {
    t,
    floor: 3,
    hp: 20,
    shield: 0,
    cd: 5,
    act: 'MOVE',
    dmgIn: 0,
    dmgOut: 0,
    foes: 2,
    adj: 0,
    ...extra,
  };
}

function log(overrides: Partial<RunLog> = {}): RunLog {
  return {
    id: 'run-1',
    seed: 'chasm',
    startedAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:10:00.000Z',
    outcome: 'death',
    floorReached: 7,
    turns: 3,
    causeOfDeath: 'Crawler',
    damageBySource: {},
    shiftsByType: {},
    shiftsSealingExit: 0,
    itemsPickedUp: [],
    itemsUsed: [],
    kills: [],
    floorEntryTurns: {},
    coinsEarned: {},
    coinsSpent: {},
    coinCheckpoints: [],
    xpEarned: {},
    levelReached: 4,
    levelCheckpoints: [],
    history: [turn(1), turn(2), turn(3)],
    ...overrides,
  };
}

describe('buildRunReport', () => {
  it('carries the build stamp, seed, floor, turns and cause of death', () => {
    const text = buildRunReport(log(), 'v0.1.0 · abc1234');

    expect(text).toContain('v0.1.0 · abc1234');
    expect(text).toContain('seed: chasm');
    expect(text).toContain('floor: 7');
    expect(text).toContain('turns: 3');
    expect(text).toContain('died to Crawler');
  });

  it('names an unknown killer rather than printing null', () => {
    const text = buildRunReport(log({ causeOfDeath: null }), 'b');
    expect(text).toContain('died to unknown');
    expect(text).not.toContain('null');
  });

  it('reports a victory as an escape, with no cause of death', () => {
    const text = buildRunReport(log({ outcome: 'victory', causeOfDeath: null }), 'b');
    expect(text).toContain('outcome: escaped');
  });

  it('prints every turn, and says so, when the run is short', () => {
    const text = buildRunReport(log(), 'b');
    expect(text).toContain('all 3 turns');
    expect(text).not.toContain('truncated');
  });

  it('keeps only the tail of a long run and says how much it dropped', () => {
    const history = Array.from({ length: 400 }, (_, i) => turn(i + 1));
    const text = buildRunReport(log({ history, turns: 400 }), 'b');

    expect(text).toContain('truncated');
    expect(text).toContain('t400');
    expect(text).not.toContain('t1 ');
    expect(text.split('\n').filter(l => l.startsWith('t')).length).toBeLessThanOrEqual(
      REPORT_TAIL_TURNS
    );
  });

  it('holds the character cap even when every turn is a wide one', () => {
    // The row-count bound alone is not enough: a turn carrying a long damage
    // source is several times the width of a plain move, which is exactly the
    // case a tester pasting into a length-limited box would hit.
    const wide = Array.from({ length: 400 }, (_, i) =>
      turn(i + 1, {
        dmgIn: 12,
        dmgOut: 9,
        shield: 7,
        from: 'the collapse behemoth of the seventh seam',
        shift: 'localized_collapse',
        sealed: true,
      })
    );
    const text = buildRunReport(log({ history: wide, turns: 400 }), 'b');

    expect(text.length).toBeLessThanOrEqual(REPORT_MAX_CHARS);
    expect(text).toContain('truncated');
  });

  it('states a turn count that matches the rows it actually printed', () => {
    const history = Array.from({ length: 400 }, (_, i) => turn(i + 1));
    const text = buildRunReport(log({ history, turns: 400 }), 'b');

    const printed = text.split('\n').filter(l => /^t\d/.test(l)).length;
    expect(text).toContain(`last ${printed} of 400 turns`);
  });

  it('survives a run that died before recording a turn', () => {
    const text = buildRunReport(log({ history: [] }), 'b');
    expect(text).toContain('all 0 turns');
  });
});

describe('stored run log', () => {
  it('reports "nothing stored" where there is no IndexedDB at all', async () => {
    // The same boundary posture as `save.ts`: a store the environment does not
    // have is not an error to propagate, it is an absent log.
    await expect(loadStoredRunLog()).resolves.toBeNull();
  });
});
