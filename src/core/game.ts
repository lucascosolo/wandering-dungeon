import { Enemy, EnemyType, GameState, Item, ItemDrop, ItemType, Player, Position, FloorMap } from './state';
import { SeededRNG } from './rng';
import { generateFloor } from './map/generator';
import { computeFOV } from './map/fow';

const STARTING_COUNTDOWN = 10;

interface EnemyTemplate {
  hp: number;
  attackPower: number;
  minLevel: number;
}

const ENEMY_TABLE: Record<EnemyType, EnemyTemplate> = {
  crawler: { hp: 18, attackPower: 4, minLevel: 1 },
  sentinel: { hp: 30, attackPower: 6, minLevel: 1 },
  fracture_beast: { hp: 42, attackPower: 9, minLevel: 2 },
  warp_stalker: { hp: 34, attackPower: 12, minLevel: 3 },
  collapse_behemoth: { hp: 70, attackPower: 15, minLevel: 4 },
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
};

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
export function populateFloor(map: FloorMap, rng: SeededRNG, level: number): {
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

  const available = (Object.keys(ENEMY_TABLE) as EnemyType[]).filter(
    t => ENEMY_TABLE[t].minLevel <= level
  );

  const enemies: Enemy[] = [];
  const enemyCount = 3 + level;
  for (let i = 0; i < enemyCount; i++) {
    const position = take();
    if (!position) break;
    const enemyType = available[rng.randomInt(0, available.length - 1)];
    const template = ENEMY_TABLE[enemyType];
    const hp = template.hp + (level - 1) * 4;
    enemies.push({
      id: `enemy_${level}_${i}`,
      name: enemyType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      enemyType,
      position,
      hp,
      maxHp: hp,
      attackPower: template.attackPower + (level - 1),
    });
  }

  const drops: ItemDrop[] = [];
  const dropCount = 2 + rng.randomInt(0, 2);
  for (let i = 0; i < dropCount; i++) {
    const position = take();
    if (!position) break;
    const type = LOOT_POOL[rng.randomInt(0, LOOT_POOL.length - 1)];
    drops.push({ item: createItem(type, `drop_${level}_${i}`), position });
  }

  return { enemies, drops };
}

/** Build a floor at `level` and move the player onto its entrance. */
export function buildFloor(state: GameState, rng: SeededRNG, level: number): void {
  const map = generateFloor(rng, level);
  const { enemies, drops } = populateFloor(map, rng, level);

  map.drops = drops;
  state.floorMap = map;
  state.entities = enemies;
  state.player.position = { x: map.entrance.x, y: map.entrance.y };
  state.preShiftSnapshot = null;
  state.pendingShift = null;
  state.lastShiftChanges = [];
  state.lastShiftTurn = -999;
  state.shiftCountdown = state.nextShiftCountdownMax;

  computeFOV(map, state.player.position);
}

/** Create a fresh run. `seed` drives every generation and combat roll. */
export function createNewGame(seed: string): GameState {
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
    inventory: [
      createItem('health_potion', 'start_potion'),
      createItem('stasis_flask', 'start_stasis'),
      createItem('rewind_scroll', 'start_rewind'),
    ],
  };

  const state: GameState = {
    seed,
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
    lastShiftChanges: [],
    lastShiftTurn: -999,
    lastDamageSource: null,
    eventLog: [],
    isGameOver: false,
    isVictory: false,
  };

  buildFloor(state, rng, 1);
  state.rngState = rng.serialize();

  state.eventLog.push({
    id: 'log_start',
    text: 'You step into the Wandering Dungeon. Reach floor 5 and get out alive.',
    type: 'info',
    timestamp: 0,
  });

  return state;
}
