import {
  ArmorType,
  Chest,
  Enemy,
  EnemyType,
  GameState,
  Item,
  ItemDrop,
  ItemType,
  Player,
  Position,
  FloorMap,
  WeaponType,
  manhattan,
  samePosition,
} from './state';
import { RunConfig } from './runConfig';
import { SeededRNG } from './rng';
import { isRegionEnd, regionForFloor, runProgress } from './regions';
import { generateFloor } from './map/generator';
import { computeFOV } from './map/fow';
import { modifierDefenseBonus, rollArmorModifier } from './armorModifiers';

const STARTING_COUNTDOWN = 10;

interface EnemyTemplate {
  hp: number;
  attackPower: number;
  /** Fraction of the run that must be reached before this species appears. */
  minProgress: number;
  /**
   * XP for the kill, before the region multiplier. Roughly `hp / 6 + attack`, so
   * what a species is worth tracks what it costs to bring down rather than being
   * a second, independently drifting number.
   */
  xp: number;
}

const ENEMY_TABLE: Record<EnemyType, EnemyTemplate> = {
  crawler: { hp: 18, attackPower: 4, minProgress: 0, xp: 5 },
  sentinel: { hp: 30, attackPower: 6, minProgress: 0, xp: 9 },
  fracture_beast: { hp: 42, attackPower: 9, minProgress: 0.25, xp: 14 },
  warp_stalker: { hp: 34, attackPower: 12, minProgress: 0.5, xp: 14 },
  collapse_behemoth: { hp: 70, attackPower: 15, minProgress: 0.8, xp: 24 },
  hinge_warden: { hp: 32, attackPower: 7, minProgress: 0, xp: 10 },
  seam_skitter: { hp: 20, attackPower: 5, minProgress: 0, xp: 6 },
  fracture_leech: { hp: 24, attackPower: 7, minProgress: 0, xp: 8 },
  riftbound: { hp: 38, attackPower: 8, minProgress: 0, xp: 12 },
  ashlock: { hp: 40, attackPower: 7, minProgress: 0, xp: 12 },
  stasis_scorcher: { hp: 26, attackPower: 7, minProgress: 0, xp: 9 },
  facet_reaver: { hp: 36, attackPower: 7, minProgress: 0, xp: 11 },
  glass_moth: { hp: 24, attackPower: 6, minProgress: 0, xp: 8 },
  unmaking_hound: { hp: 34, attackPower: 7, minProgress: 0, xp: 10 },
  null_scribe: { hp: 28, attackPower: 6, minProgress: 0, xp: 9 },
  // Bosses carry their premium in the table rather than through an isBoss
  // multiplier: an arena guardian is mandatory, so its worth is a fixed part of
  // the curve, not a bonus for optional work.
  hinge_sovereign: { hp: 110, attackPower: 10, minProgress: 0, xp: 60 },
  rift_regent: { hp: 125, attackPower: 11, minProgress: 0, xp: 70 },
  cinder_gatekeeper: { hp: 135, attackPower: 12, minProgress: 0, xp: 80 },
  prism_refractor: { hp: 145, attackPower: 13, minProgress: 0, xp: 90 },
  null_testament: { hp: 75, attackPower: 14, minProgress: 0, xp: 100 },
  // The Pursuer's HP is never spent — `damageEnemy` refuses to take it — so the
  // 1 here is what keeps it alive through `settleDeaths`, not a health pool. Its
  // XP is 0 for the same reason: nothing can ever collect it.
  pursuer: { hp: 1, attackPower: 11, minProgress: 0, xp: 0 },
};

/**
 * The Pursuer's stats, read by the engine that spawns it. Exported rather than
 * reached through `populateFloor`, which builds a floor's own population and
 * never places this.
 */
export const PURSUER_TEMPLATE = ENEMY_TABLE.pursuer;

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
  short_blade: {
    type: 'short_blade',
    name: 'Short Blade',
    description: 'A sturdy blade. No bonus, no penalty.',
    category: 'weapon',
  },
  war_axe: {
    type: 'war_axe',
    name: 'War Axe',
    description: 'Heavy blade. +4 damage on every melee hit.',
    category: 'weapon',
    damageBonus: 4,
  },
  longbow: {
    type: 'longbow',
    name: 'Longbow',
    description: 'Ranged weapon. Attack any visible enemy up to 6 tiles away.',
    category: 'weapon',
    range: 6,
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

const WEAPON_POOL: WeaponType[] = ['war_axe', 'longbow'];

export function createItem(type: ItemType, id: string): Item {
  return { id, count: 1, ...ITEM_TABLE[type] };
}

/**
 * A piece of armor with its modifier rolled. The roll happens here, when the
 * piece is generated, and never on pickup — the same rule shop stock follows:
 * a roll the player can re-take by walking away is not a roll.
 *
 * It draws from a stream derived from the floor's generator rather than from the
 * generator itself, so the piece is still a pure function of the run's seed while
 * the two draws do not re-phase everything the floor rolls after it. Spending
 * them on the main stream instead moved the completability bot's median depth
 * from 6 to 5 without changing a single rule — the dungeon it walked was simply a
 * different dungeon. A side roll should not be able to do that.
 *
 * A `ponderous` roll's defense is folded into the piece rather than read live,
 * because more defense is exactly what `damagePlayer` already does with the
 * number it finds here.
 */
export function createArmor(type: ArmorType, id: string, rng: SeededRNG): Item {
  const base = createItem(type, id);
  const modifier = rollArmorModifier(new SeededRNG(`${rng.getSeed()}:${id}`));
  return {
    ...base,
    defense: (base.defense ?? 0) + modifierDefenseBonus(modifier),
    modifier,
  };
}

/** A coin pile worth `value`. The amount is per-pile, so it cannot live in ITEM_TABLE. */
export function createCoinCache(value: number, id: string): Item {
  return { ...createItem('coin_cache', id), value, name: `${value} Coins` };
}

/**
 * What one scattered pile on the floor is worth. Flat across regions on purpose:
 * the number is read off the floor at a glance, and "3 Coins" stays legible where
 * "27 Coins" is just noise. Region scaling lives in `coinsPerKill` instead.
 */
export function coinsPerPile(rng: SeededRNG): number {
  return rng.randomInt(1, 3);
}

/**
 * What one kill pays. With piles flat, this is the only thing that keeps late
 * regions paying for their own (marked-up) shop, so it carries the whole scaling
 * curve — but at half the old slope, because later regions also field more
 * enemies per floor and the two would compound.
 */
export function coinsPerKill(regionIndex: number, isBoss: boolean): number {
  const base = 1 + Math.floor((regionIndex + 1) / 2);
  return isBoss ? base * 5 : base;
}

/**
 * XP for one kill. Scaled by region so a late floor is not worth the same as the
 * first — region 4 doubles it, which sits just above the 1.6x enemy HP step, so
 * fighting deeper stays marginally better value than farming the top.
 */
export function xpPerKill(enemyType: EnemyType, regionIndex: number): number {
  return Math.round(ENEMY_TABLE[enemyType].xp * (1 + regionIndex * 0.25));
}

/**
 * XP from `level` to the next one. Near-linear on purpose: a steeply convex curve
 * compresses a full clear and a straight run to the stairs into the same level or
 * two, and that gap is the entire incentive this system exists to create.
 *
 * 10c ground the numbers in `logs/<run-id>.json`. The one clean floor-1 trace
 * that reached a guardian earned 118 XP over the whole of region 0 — 63% of the
 * 188 on the floor — and crossed level 2 *on the Hinge Sovereign's bounty*. So
 * the first region was fought start to finish at level 1 and the reward for
 * beating its guardian arrived after the fight it was meant to help with. At
 * `100 + 60`, region 0 was the only region that missed its pre-guardian level,
 * but it is the region every player sees.
 *
 * `50 + 45` costs the same XP over a run — the totals are set by `xpPerKill`,
 * not here — and only moves where the crossings land: at that observed 63% rate
 * every region now gains a level on its ordinary floors, before the arena floor,
 * and a 10-floor victory pays out three level-ups instead of two.
 *
 * The slope is what keeps the incentive. A run that clears its floors reaches
 * the final guardian around level 8 (156 max HP, 19 attack, close to the 1.6x
 * enemy HP step it is walking into); one that runs the stairs and fights only
 * guardians arrives at level 4, under-scaled on purpose.
 */
export function xpToNextLevel(level: number): number {
  return 50 + 45 * (level - 1);
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

/**
 * A free tile for something placed after the floor was built — the merchant, so
 * far. Rooms only: a corridor or door tile is a chokepoint, and the merchant is a
 * solid obstacle, so standing him in one could seal the way to the stairs on a
 * floor that has already stopped shifting. Nearby is preferred over anywhere so
 * the arena's reward is visibly in the arena, with the whole floor as the
 * fallback when the player cleared it from an odd corner.
 */
export function pickSpawnPosition(
  map: FloorMap,
  rng: SeededRNG,
  near: Position,
  occupied: Position[]
): Position | null {
  const taken = new Set(occupied.map(p => `${p.x},${p.y}`));
  const open = walkableTiles(map).filter(p => {
    const tile = map.tiles[p.y][p.x];
    const group = tile.shiftGroupId === null ? undefined : map.shiftGroups[tile.shiftGroupId];
    return (
      tile.type === 'floor' &&
      group?.type === 'room' &&
      !taken.has(`${p.x},${p.y}`) &&
      !samePosition(p, map.exit)
    );
  });
  if (open.length === 0) return null;

  const close = open.filter(p => manhattan(p, near) <= 8);
  const pool = close.length > 0 ? close : open;
  const pick = pool[rng.randomInt(0, pool.length - 1)];
  return { x: pick.x, y: pick.y };
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
  chests: Chest[];
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
  // The ladder this replaced named floors 5/10/15/20/25 one by one, which is
  // "the arena floor of regions 0-4" written out longhand. Reading it off the
  // region keeps one copy, which the glyph legend also names its bosses from.
  const bossType: EnemyType | null = isBossFloor ? region.boss : null;
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
  if (isRegionEnd(level)) return { enemies, drops, chests: [] };

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
      item: createCoinCache(coinsPerPile(rng), `coins_${level}_${i}`),
      position,
    });
  }

  const armorPosition = take();
  if (armorPosition) {
    drops.push({
      item: createArmor(armorForLevel(level), `armor_${level}`, rng),
      position: armorPosition,
    });
  }

  // One weapon per floor (starting floor 2), drawn from the weapon pool
  if (level >= 2) {
    const weaponPosition = take();
    if (weaponPosition) {
      const type = WEAPON_POOL[rng.randomInt(0, WEAPON_POOL.length - 1)];
      drops.push({
        item: createItem(type, `weapon_${level}`),
        position: weaponPosition,
      });
    }
  }

  const chests: Chest[] = [];
  if (rng.random() < 0.4) {
    const pos = take();
    if (pos) {
      const contents = rollChestContents(rng, level);
      chests.push({ id: `chest_${level}`, position: pos, contents, looted: false });
    }
  }

  return { enemies, drops, chests };
}

/** Build a floor at `level` and move the player onto its entrance. */
export function buildFloor(state: GameState, rng: SeededRNG, level: number): void {
  const map = generateFloor(rng, level);
  const { enemies, drops, chests } = populateFloor(map, rng, level, state.config.finalFloor);

  map.drops = drops;
  map.chests = chests;
  state.floorMap = map;
  state.entities = enemies;
  state.player.position = { x: map.entrance.x, y: map.entrance.y };
  state.preShiftSnapshot = null;
  state.pendingShift = null;
  // The merchant belongs to the boss floor. Descending leaves them behind.
  state.shop = null;
  state.pendingArmorOffer = null;
  // Drops do not survive a descent, so neither do the answers about them.
  state.declinedArmorIds = [];
  state.pendingWeaponOffer = null;
  state.declinedWeaponIds = [];
  state.lastShiftChanges = [];
  state.lastShiftTurn = -999;
  state.lastShiftType = null;
  state.lastKillPosition = null;
  state.lastPickupName = null;
  state.lastPickupPosition = null;
  state.exitBlockedStreak = 0;
  // Escalating pressure is per-floor: descending buys back the full grace period.
  state.floorTurns = 0;
  state.shiftCountdown = state.nextShiftCountdownMax;

  computeFOV(map, state.player.position);
}

/** What a chest can contain. Rolled at floor build time like shop stock. */
function rollChestContents(rng: SeededRNG, level: number): Item {
  const roll = rng.random();
  if (roll < 0.5) {
    // Coin sum — 3-5 coins
    return createCoinCache(rng.randomInt(3, 6), `chest_coins_${level}`);
  }
  if (roll < 0.8) {
    // Consumable from the loot pool
    const type = LOOT_POOL[rng.randomInt(0, LOOT_POOL.length - 1)];
    return createItem(type, `chest_item_${level}`);
  }
  // Armour one tier ahead of the current floor (capped at warden_carapace)
  const nextTier = level + 2;
  const type = armorForLevel(Math.min(nextTier, 5));
  return createArmor(type, `chest_armor_${level}`, rng);
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
    weapon: createItem('short_blade', 'start_weapon'),
    weaponActive: true,
    coins: 0,
    level: 1,
    xp: 0,
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
    floorTurns: 0,
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
    declinedArmorIds: [],
    pendingWeaponOffer: null,
    declinedWeaponIds: [],
    lastLevelUp: null,
    lastBossDefeat: null,
    armorReactions: [],
    lastShiftChanges: [],
    lastShiftTurn: -999,
    lastKillPosition: null,
    lastPickupName: null,
    lastPickupPosition: null,
    lastShiftType: null,
    exitBlockedStreak: 0,
    lastDamageSource: null,
    clearedRegions: [],
    shop: null,
    shopOpened: false,
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
