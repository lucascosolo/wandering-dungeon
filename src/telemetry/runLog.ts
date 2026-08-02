import { get, set } from 'idb-keyval';
import { GameAction } from '../core/engine';
import { regionForFloor } from '../core/regions';
import { GameState, ShiftType } from '../core/state';

const ENDPOINT = '/__runlog';

/**
 * `/__runlog` is served by `vite/runLogPlugin.ts`, which is `apply: 'serve'` —
 * it exists on the dev server and nowhere else. A deployed build posting to it
 * is not "one request that fails", it is the whole growing log re-sent every 25
 * turns plus a beacon on every backgrounding, over a tester's mobile data,
 * against a URL that will never answer. Vite substitutes this to `false` at
 * build time, so the POST path becomes dead code the bundler drops.
 */
const CAN_POST = import.meta.env.DEV;

/** Where the log is kept so it outlives the run — the same store as `save.ts`. */
const STORAGE_KEY = 'run-log';

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

/** A purse reading taken the turn a region's boss falls and its shop appears. */
export interface CoinCheckpoint {
  floor: number;
  region: number;
  coins: number;
}

/**
 * The player's progression the turn a region's boss falls. 10c tunes the XP curve
 * against these: they are what say whether a region's worth of fighting bought a
 * level, and how much of the next one was banked.
 */
export interface LevelCheckpoint {
  floor: number;
  region: number;
  level: number;
  /** XP banked toward the next level, so a near-miss is visible as one. */
  xp: number;
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
  /** Coins earned, keyed `<regionIndex>:<source>` (`kill` bounty or `cache` pickup). */
  coinsEarned: Record<string, number>;
  /** Coins spent at shops, keyed by the purchased item's name. */
  coinsSpent: Record<string, number>;
  /** Purse balance each time a region's boss falls, so income-per-region is readable. */
  coinCheckpoints: CoinCheckpoint[];
  /** XP earned, keyed `<regionIndex>:<source>`. Kills are the only source today. */
  xpEarned: Record<string, number>;
  /** Highest level reached, so a run that dies mid-region still reports its power. */
  levelReached: number;
  /** Level and banked XP each time a region's boss falls. */
  levelCheckpoints: LevelCheckpoint[];
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
  coins: number;
  clearedRegionCount: number;
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
  private enabled = CAN_POST;

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
      coinsEarned: {},
      coinsSpent: {},
      coinCheckpoints: [],
      xpEarned: {},
      levelReached: state.player.level,
      levelCheckpoints: [],
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
      coins: state.player.coins,
      clearedRegionCount: state.clearedRegions.length,
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
    const region = regionForFloor(state.floorMap.level).index;
    for (const text of events) {
      const pickup = /^You pick up a (.+)\.$/.exec(text);
      if (pickup) this.log.itemsPickedUp.push(pickup[1]);

      const bounty = /collect (\d+) coins\.$/.exec(text);
      if (bounty) {
        const key = `${region}:kill`;
        this.log.coinsEarned[key] = (this.log.coinsEarned[key] ?? 0) + Number(bounty[1]);
      }

      const xp = /You gain (\d+) XP and collect \d+ coins\.$/.exec(text);
      if (xp) {
        const key = `${region}:kill`;
        this.log.xpEarned[key] = (this.log.xpEarned[key] ?? 0) + Number(xp[1]);
      }

      const cache = /^You pocket (\d+) coins\.$/.exec(text);
      if (cache) {
        const key = `${region}:cache`;
        this.log.coinsEarned[key] = (this.log.coinsEarned[key] ?? 0) + Number(cache[1]);
      }

      // BUY_ITEM's event carries no price, so the spend is read off the purse
      // delta rather than the text — the only other coin sink is a kill/cache
      // gain, and a purchase turn never advances the world clock to earn one.
      const purchase = /^You buy the (.+)\.$/.exec(text);
      if (purchase) {
        const spent = Math.max(0, before.coins - state.player.coins);
        this.log.coinsSpent[purchase[1]] = (this.log.coinsSpent[purchase[1]] ?? 0) + spent;
      }
    }

    if (state.clearedRegions.length > before.clearedRegionCount) {
      const cleared = state.clearedRegions[state.clearedRegions.length - 1];
      this.log.coinCheckpoints.push({
        floor: state.floorMap.level,
        region: cleared,
        coins: state.player.coins,
      });
      this.log.levelCheckpoints.push({
        floor: state.floorMap.level,
        region: cleared,
        level: state.player.level,
        xp: state.player.xp,
      });
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
    this.log.levelReached = state.player.level;

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

  /** Read-only view of the log recorded so far. Production code never reads this back; it exists for tests. */
  snapshot(): Readonly<RunLog> {
    return this.log;
  }

  /** True while the dev-server POST path is still worth attempting. */
  get posting(): boolean {
    return this.enabled;
  }

  /** Push the current log to storage, and — on the dev server — to `logs/`. */
  flush(useBeacon = false): void {
    if (this.log.history.length === 0) return;
    this.sinceFlush = 0;
    this.log.updatedAt = new Date().toISOString();

    // Deliberately outside the `enabled` gate: persistence is what makes the log
    // reachable in a built game, where the POST below never runs at all.
    void storeRunLog(this.log);

    // `CAN_POST` first, and as a literal rather than through `this.enabled`: it
    // is what lets the bundler prove the rest of this method is unreachable in a
    // production build and drop the endpoint, the beacon and the fetch entirely.
    // Gating only on the instance field left all three in the shipped bundle.
    if (!CAN_POST || !this.enabled) return;

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
    })
      .then(res => {
        // `.catch` alone never fires for a 404 or a 500 — fetch only rejects on a
        // network failure. Without this check a host that answers "not found" on
        // every POST looked like success and the log kept being re-sent forever.
        if (!res.ok) this.enabled = false;
      })
      .catch(() => {
        this.enabled = false;
      });
  }
}

/**
 * IndexedDB is a true boundary, exactly as in `save.ts` — absent in Safari
 * Private Browsing, blocked in some webviews, and able to reject on quota. A run
 * log that cannot be written must not take the turn (or the unload handler) with
 * it, so failure is reported to the console and nowhere else.
 */
async function storeRunLog(log: RunLog): Promise<void> {
  // Checked rather than caught: `flush` runs every 25 turns, so an environment
  // with no IndexedDB at all (the Vitest node runner, a locked-down webview)
  // would otherwise print the same stack dozens of times per run and bury the
  // failures worth reading. A caught rejection below still reports — that one is
  // a real fault in a store that does exist.
  if (typeof indexedDB === 'undefined') return;
  try {
    await set(STORAGE_KEY, log);
  } catch (error) {
    console.error('Could not store the run log', error);
  }
}

/**
 * The read side of the store: the last log written by any run in this browser,
 * or null if there is none. This is what makes persistence worth doing — the
 * Copy Report button covers the run you are in, and this covers the run whose
 * tab was closed, reloaded, or killed by the OS before anyone pressed it.
 */
export async function loadStoredRunLog(): Promise<RunLog | null> {
  try {
    return ((await get(STORAGE_KEY)) as RunLog | undefined) ?? null;
  } catch (error) {
    console.error('Could not read the stored run log', error);
    return null;
  }
}
