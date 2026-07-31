import {
  ArmorType,
  Enemy,
  EnemyType,
  GameState,
  Item,
  ItemDrop,
  ItemType,
  Player,
  Position,
  FloorMap,
} from './state';
import { RunConfig } from './runConfig';
import { SeededRNG } from './rng';
import { isRegionEnd, regionForFloor, runProgress } from './regions';
import { generateFloor } from './map/generator';
import { computeFOV } from './map/fow';

const STARTING_COUNTDOWN = 10;

interface EnemyTemplate {
  hp: number;
  attackPower: number;
  /** Fraction of the run that must be reached before this species appears. */
  minProgress: number;
}

const ENEMY_TABLE: Record<EnemyType, EnemyTemplate> = {
  crawler: { hp: 18, attackPower: 4, minProgress: 0 },
  sentinel: { hp: 30, attackPower: 6, minProgress: 0 },
  fracture_beast: { hp: 42, attackPower: 9, minProgress: 0.25 },
  warp_stalker: { hp: 34, attackPower: 12, minProgress: 0.5 },
  collapse_behemoth: { hp: 70, attackPower: 15, minProgress: 0.8 },
  hinge_warden: { hp: 32, attackPower: 7, minProgress: 0 },
  seam_skitter: { hp: 20, attackPower: 5, minProgress: 0 },
  fracture_leech: { hp: 24, attackPower: 7, minProgress: 0 },
  riftbound: { hp: 38, attackPower: 8, minProgress: 0 },
  ashlock: { hp: 40, attackPower: 7, minProgress: 0 },
  stasis_scorcher: { hp: 26, attackPower: 7, minProgress: 0 },
  facet_reaver: { hp: 36, attackPower: 7, minProgress: 0 },
  glass_moth: { hp: 24, attackPower: 6, minProgress: 0 },
  unmaking_hound: { hp: 34, attackPower: 7, minProgress: 0 },
  null_scribe: { hp: 28, attackPower: 6, minProgress: 0 },
  hinge_sovereign: { hp: 110, attackPower: 10, minProgress: 0 },
  rift_regent: { hp: 125, attackPower: 11, minProgress: 0 },
  cinder_gatekeeper: { hp: 135, attackPower: 12, minProgress: 0 },
  prism_refractor: { hp: 145, attackPower: 13, minProgress: 0 },
  null_testament: { hp: 75, attackPower: 14, minProgress: 0 },
};

const ITEM_TABLE: Record<ItemType, Omit<Item, 'id'>> = {
  stasis_flask: {
    type: 'stasis_flask',
    name: 'Stasis Flask',
    description: 'Pauses the shift countdown for 6 turns.',
    category: 'stabilization',
  },
  hourglass_shard: {
    type: 'hourglass_shard',
    name: 'Hourglass Shard',
    description: 'Adds 3 turns to the shift countdown.',
    category: 'stabilization',
  },
  haste_sigil: {
    type: 'haste_sigil',
    name: 'Haste Sigil',
    description: 'Forces a shift now. Staggers enemies caught in it, but the next shift comes 2 turns sooner.',
    category: 'destabilization',
  },
  rewind_scroll: {
    type: 'rewind_scroll',
    name: 'Rewind Scroll',
    description: 'Restores the dungeon geometry from before the last shift.',
    category: 'stabilization',
  },
  health_potion: {
    type: 'health_potion',
    name: 'Health Potion',
    description: 'Restores 30 HP.',
    category: 'consumable',
  },
  coin_cache: {
    type: 'coin_cache',
    name: 'Coins',
    description: 'Spending money for the merchant beyond the next boss.',
    category: 'currency',
    value: 0,
  },
  padded_vest: {
    type: 'padded_vest',
    name: 'Padded Vest',
    description: 'Soaks 2 damage from every hit.',
    category: 'armor',
    defense: 2,
  },
  scrap_plating: {
    type: 'scrap_plating',
    name: 'Scrap Plating',
    description: 'Soaks 4 damage from every hit.',
    category: 'armor',
    defense: 4,
  },
  warden_carapace: {
    type: 'warden_carapace',
    name: 'Warden Carapace',
    description: 'Soaks 7 damage from every hit.',
    category: 'armor',
    defense: 7,
  },
};

/**
 * One piece of armor per floor, the best tier the floor has unlocked. Armor is
 * the run's main damage curve, so it is placed deliberately rather than rolled
 * out of the loot pool where a bad streak could leave the player bare.
 */
const ARMOR_TIERS: { type: ArmorType; minLevel: number }[] = [
  { type: 'padded_vest', minLevel: 1 },
  { type: 'scrap_plating', minLevel: 2 },
  { type: 'warden_carapace', minLevel: 4 },
];

function armorForLevel(level: number): ArmorType {
  return ARMOR_TIERS.filter(t => t.minLevel <= level).slice(-1)[0].type;
}

const LOOT_POOL: ItemType[] = [
  'health_potion',
  'health_potion',
  'stasis_flask',
  'hourglass_shard',
  'haste_sigil',
  'rewind_scroll',
];

export function createItem(type: ItemType, id: string): Item {
  return { id, ...ITEM_TABLE[type] };
}

/** A coin pile worth `value`. The amount is per-pile, so it cannot live in ITEM_TABLE. */
export function createCoinCache(value: number, id: string): Item {
  return { ...createItem('coin_cache', id), value, name: `${value} Coins` };
}

/**
 * Coin income scales with the region so a later shop is not priced out of reach
 * of the floors that feed it. 6c prices stock against what this actually pays.
 */
export function coinsForRegion(regionIndex: number, rng: SeededRNG): number {
  return 8 + regionIndex * 4 + rng.randomInt(0, 5);
}

/** What one kill pays. Deliberately small — floors are the main income. */
export function coinsPerKill(regionIndex: number, isBoss: boolean): number {
  const base = 2 + regionIndex;
  return isBoss ? base * 10 : base;
}

/** All walkable tiles, used as the spawn candidate pool. */
function walkableTiles(map: FloorMap): Position[] {
  const out: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const type = map.tiles[y][x].type;
      if (type === 'floor' || type === 'door') out.push({ x, y });
    }
  }
  return out;
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Place enemies and item drops on a freshly generated floor.
 * Nothing spawns within 5 tiles of the entrance so the player gets a beat to orient.
 */
export function populateFloor(
  map: FloorMap,
  rng: SeededRNG,
  level: number,
  finalFloor: number
): {
  enemies: Enemy[];
  drops: ItemDrop[];
} {
  const candidates = walkableTiles(map).filter(p => manhattan(p, map.entrance) > 5);
  const taken = new Set<string>();

  const take = (): Position | null => {
    for (let attempt = 0; attempt < 40 && candidates.length > 0; attempt++) {
      const pick = candidates[rng.randomInt(0, candidates.length - 1)];
      const key = `${pick.x},${pick.y}`;
      if (taken.has(key)) continue;
      taken.add(key);
      return { x: pick.x, y: pick.y };
    }
    return null;
  };

  const progress = runProgress(level, finalFloor);
  const region = regionForFloor(level);
  const isBossFloor = isRegionEnd(level);
  const bossType: EnemyType | null =
    level === 5
      ? 'hinge_sovereign'
      : level === 10
        ? 'rift_regent'
        : level === 15
          ? 'cinder_gatekeeper'
          : level === 20
            ? 'prism_refractor'
            : level === 25
              ? 'null_testament'
            : null;
  const available = region.enemyPool.filter(
    t => ENEMY_TABLE[t].minProgress <= progress
  );

  const enemies: Enemy[] = [];
  const enemyCount = bossType ? 1 : region.enemyCount;
  for (let i = 0; i < enemyCount; i++) {
    const position = bossType
      ? { x: Math.floor((map.entrance.x + map.exit.x) / 2), y: map.entrance.y }
      : take();
    if (!position) break;
    if (bossType) taken.add(`${position.x},${position.y}`);
    const enemyType = bossType ?? available[rng.randomInt(0, available.length - 1)];
    const template = ENEMY_TABLE[enemyType];
    const hp = Math.round(template.hp * region.hpMultiplier);
    enemies.push({
      id: `enemy_${level}_${i}`,
      name: bossType === 'hinge_sovereign'
        ? 'Hinge Sovereign'
        : bossType === 'rift_regent'
          ? 'Rift Regent'
          : bossType === 'cinder_gatekeeper'
            ? 'Cinder Gatekeeper'
            : bossType === 'prism_refractor'
              ? 'Prism Refractor'
              : bossType === 'null_testament'
                ? 'Null Testament'
          : enemyType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      enemyType,
      isBoss: bossType !== null,
      bossCooldown: bossType ? 0 : undefined,
      position,
      hp,
      maxHp: hp,
      attackPower: template.attackPower + region.attackBonus + (bossType ? 2 : 0),
      staggeredTurns: 0,
    });
  }

  const drops: ItemDrop[] = [];
  if (isRegionEnd(level)) return { enemies, drops };

  const dropCount = 2 + rng.randomInt(0, 2);
  for (let i = 0; i < dropCount; i++) {
    const position = take();
    if (!position) break;
    const type = LOOT_POOL[rng.randomInt(0, LOOT_POOL.length - 1)];
    drops.push({ item: createItem(type, `drop_${level}_${i}`), position });
  }

  const cacheCount = 2 + rng.randomInt(0, 1);
  for (let i = 0; i < cacheCount; i++) {
    const position = take();
    if (!position) break;
    drops.push({
      item: createCoinCache(coinsForRegion(region.index, rng), `coins_${level}_${i}`),
      position,
    });
  }

  const armorPosition = take();
  if (armorPosition) {
    drops.push({
      item: createItem(armorForLevel(level), `armor_${level}`),
      position: armorPosition,
    });
  }

  return { enemies, drops };
}

/** Build a floor at `level` and move the player onto its entrance. */
export function buildFloor(state: GameState, rng: SeededRNG, level: number): void {
  const map = generateFloor(rng, level);
  const { enemies, drops } = populateFloor(map, rng, level, state.config.finalFloor);

  map.drops = drops;
  state.floorMap = map;
  state.entities = enemies;
  state.player.position = { x: map.entrance.x, y: map.entrance.y };
  state.preShiftSnapshot = null;
  state.pendingShift = null;
  // The merchant belongs to the boss floor. Descending leaves them behind.
  state.shop = null;
  state.pendingArmorOffer = null;
  state.lastShiftChanges = [];
  state.lastShiftTurn = -999;
  state.lastShiftType = null;
  state.exitBlockedStreak = 0;
  state.shiftCountdown = state.nextShiftCountdownMax;

  computeFOV(map, state.player.position);
}

/** Create a fresh run. `seed` drives every generation and combat roll. */
export function createNewGame(seed: string, config: RunConfig): GameState {
  const rng = new SeededRNG(seed);

  const player: Player = {
    id: 'player',
    name: 'Vanguard',
    classType: 'vanguard',
    position: { x: 0, y: 0 },
    hp: 100,
    maxHp: 100,
    attackPower: 12,
    shieldHp: 0,
    shieldTurnsRemaining: 0,
    armor: null,
    coins: 0,
    inventory: [
      createItem('health_potion', 'start_potion'),
      createItem('stasis_flask', 'start_stasis'),
      createItem('rewind_scroll', 'start_rewind'),
    ],
  };

  const state: GameState = {
    seed,
    config,
    rngState: rng.serialize(),
    turnCount: 0,
    shiftCountdown: STARTING_COUNTDOWN,
    nextShiftCountdownMax: STARTING_COUNTDOWN,
    isStasisActive: false,
    stasisTurnsRemaining: 0,
    abilityCooldown: 0,
    player,
    entities: [],
    floorMap: null as unknown as FloorMap,
    preShiftSnapshot: null,
    pendingShift: null,
    pendingArmorOffer: null,
    lastShiftChanges: [],
    lastShiftTurn: -999,
    lastShiftType: null,
    exitBlockedStreak: 0,
    lastDamageSource: null,
    clearedRegions: [],
    shop: null,
    eventLog: [],
    isGameOver: false,
    isVictory: false,
  };

  buildFloor(state, rng, 1);
  state.rngState = rng.serialize();

  state.eventLog.push({
    id: 'log_start',
    text: `You step into the Wandering Dungeon. Reach floor ${config.finalFloor} and get out alive.`,
    type: 'info',
    timestamp: 0,
  });

  return state;
}
