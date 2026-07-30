import { GameAction } from '../core/engine';
import { GameState, ShiftType } from '../core/state';

const ENDPOINT = '/__runlog';

/** Post a partial log every this many recorded turns, so a crash still leaves data. */
const FLUSH_EVERY_TURNS = 25;

/** One row per action the player took. Short keys keep a long run's file readable. */
export interface TurnRecord {
  /** turnCount after the action resolved. */
  t: number;
  floor: number;
  hp: number;
  shield: number;
  /** Turns until the next shift (or -1 while stasis holds the clock). */
  cd: number;
  act: string;
  /** HP the player lost on this action, and who took it. */
  dmgIn: number;
  from?: string;
  /** HP the player took off enemies on this action. */
  dmgOut: number;
  /** Enemies alive on the floor, and how many were adjacent. */
  foes: number;
  adj: number;
  /** Set on the turn a shift landed. */
  shift?: ShiftType;
  /** Set on the turn the shift left the exit unreachable. */
  sealed?: true;
}

export interface RunLog {
  id: string;
  seed: string;
  startedAt: string;
  updatedAt: string;
  /** 'in_progress' until the run resolves — an abandoned run keeps this value. */
  outcome: 'in_progress' | 'victory' | 'death';
  floorReached: number;
  turns: number;
  causeOfDeath: string | null;
  /** Total HP lost per damage source across the whole run. */
  damageBySource: Record<string, number>;
  shiftsByType: Record<string, number>;
  /** How many shifts left the stairs unreachable. */
  shiftsSealingExit: number;
  itemsPickedUp: string[];
  itemsUsed: string[];
  kills: string[];
  /** Turn on which the player first set foot on each floor. */
  floorEntryTurns: Record<string, number>;
  history: TurnRecord[];
}

interface Snapshot {
  hp: number;
  shield: number;
  floor: number;
  enemyHp: number;
  action: string;
  itemName: string | null;
  liveEnemies: Set<string>;
}

function totalEnemyHp(state: GameState): number {
  return state.entities.reduce((sum, e) => sum + Math.max(0, e.hp), 0);
}

function adjacentEnemies(state: GameState): number {
  const { x, y } = state.player.position;
  return state.entities.filter(
    e => e.hp > 0 && Math.abs(e.position.x - x) + Math.abs(e.position.y - y) === 1
  ).length;
}

/**
 * Records a played run and posts it to the dev server's `/__runlog` endpoint,
 * which writes it to `logs/`. Purely observational — it reads state, never
 * mutates it, so a failing logger cannot change how the game plays.
 */
export class RunRecorder {
  private log: RunLog;
  private pending: Snapshot | null = null;
  private sinceFlush = 0;
  /** Silence the endpoint after the first failure — a built game has no server. */
  private enabled = true;

  constructor(state: GameState) {
    const startedAt = new Date().toISOString();
    this.log = {
      id: `${startedAt.replace(/[:.]/g, '-')}-${state.seed}`,
      seed: state.seed,
      startedAt,
      updatedAt: startedAt,
      outcome: 'in_progress',
      floorReached: state.floorMap.level,
      turns: 0,
      causeOfDeath: null,
      damageBySource: {},
      shiftsByType: {},
      shiftsSealingExit: 0,
      itemsPickedUp: [],
      itemsUsed: [],
      kills: [],
      floorEntryTurns: { [state.floorMap.level]: 0 },
      history: [],
    };
  }

  /** Call immediately before `dispatchAction`, with the action about to run. */
  beginTurn(state: GameState, action: GameAction): void {
    const item =
      action.type === 'USE_ITEM'
        ? state.player.inventory.find(i => i.id === action.itemId)
        : undefined;

    this.pending = {
      hp: state.player.hp,
      shield: state.player.shieldHp,
      floor: state.floorMap.level,
      enemyHp: totalEnemyHp(state),
      action: action.type,
      itemName: item?.name ?? null,
      liveEnemies: new Set(state.entities.filter(e => e.hp > 0).map(e => e.name)),
    };
  }

  /** Call immediately after `dispatchAction` with the events it returned. */
  endTurn(state: GameState, events: string[]): void {
    const before = this.pending;
    this.pending = null;
    if (!before) return;

    const dmgIn = Math.max(0, before.hp - state.player.hp);
    const row: TurnRecord = {
      t: state.turnCount,
      floor: state.floorMap.level,
      hp: state.player.hp,
      shield: state.player.shieldHp,
      cd: state.isStasisActive ? -1 : state.shiftCountdown,
      act: before.action,
      dmgIn,
      dmgOut: Math.max(
        0,
        // A descent replaces the floor, so its enemy pool is not comparable.
        before.floor === state.floorMap.level ? before.enemyHp - totalEnemyHp(state) : 0
      ),
      foes: state.entities.filter(e => e.hp > 0).length,
      adj: adjacentEnemies(state),
    };

    if (dmgIn > 0) {
      const source = state.lastDamageSource ?? 'unknown';
      row.from = source;
      this.log.damageBySource[source] = (this.log.damageBySource[source] ?? 0) + dmgIn;
    }

    if (state.lastShiftTurn === state.turnCount && state.lastShiftType) {
      row.shift = state.lastShiftType;
      this.log.shiftsByType[state.lastShiftType] =
        (this.log.shiftsByType[state.lastShiftType] ?? 0) + 1;
      if (state.exitBlockedStreak > 0) {
        row.sealed = true;
        this.log.shiftsSealingExit++;
      }
    }

    if (before.itemName) this.log.itemsUsed.push(before.itemName);
    for (const text of events) {
      const pickup = /^You pick up a (.+)\.$/.exec(text);
      if (pickup) this.log.itemsPickedUp.push(pickup[1]);
    }
    for (const name of before.liveEnemies) {
      if (!state.entities.some(e => e.hp > 0 && e.name === name)) {
        // Names repeat across a floor, so this counts a kill only when the last
        // enemy of that name dies. Good enough to see *what* is killing the run.
        this.log.kills.push(name);
      }
    }

    if (state.floorMap.level !== before.floor) {
      this.log.floorEntryTurns[state.floorMap.level] ??= state.turnCount;
    }

    this.log.history.push(row);
    this.log.turns = state.turnCount;
    this.log.floorReached = Math.max(this.log.floorReached, state.floorMap.level);

    if (state.isGameOver) {
      this.finish(state);
    } else if (++this.sinceFlush >= FLUSH_EVERY_TURNS) {
      this.flush();
    }
  }

  private finish(state: GameState): void {
    this.log.outcome = state.isVictory ? 'victory' : 'death';
    this.log.causeOfDeath = state.isVictory ? null : state.lastDamageSource ?? 'unknown';
    this.flush();
  }

  /** Push the current log to disk. Safe to call at any time, including on unload. */
  flush(useBeacon = false): void {
    if (!this.enabled || this.log.history.length === 0) return;
    this.sinceFlush = 0;
    this.log.updatedAt = new Date().toISOString();

    const body = JSON.stringify(this.log);

    // On unload only sendBeacon is guaranteed to survive the page going away.
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    }

    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      this.enabled = false;
    });
  }
}
