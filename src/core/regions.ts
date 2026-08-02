import type { EnemyType } from './state';

/**
 * A run is regions of five floors, each closing on its last floor. The region a
 * floor belongs to is derived from the floor number rather than stored on the
 * state — a cached copy would be one more thing to keep in sync across descent,
 * save/resume, and the rescue paths.
 */
export const FLOORS_PER_REGION = 5;

export interface RegionPalette {
  wall: string;
  floor: string;
  door: string;
  stairs: string;
  chasm: string;
  accent: string;
}

export interface Region {
  /** 0-based, so it indexes REGIONS directly. */
  index: number;
  name: string;
  /**
   * Enemy stats for every floor of the region. Flat within a region and stepped
   * between them: the player's power is flat too (attack 12, 100 HP, armor caps
   * at 7 by floor 4), so anything that grows per floor outruns them by
   * arithmetic alone. That is what put a 114 HP Crawler on floor 25 and, worse,
   * spiked floors 4-5 of every run length.
   */
  enemyCount: number;
  hpMultiplier: number;
  attackBonus: number;
  enemyPool: readonly EnemyType[];
  /**
   * The guardian of this region's arena floor. Lives here rather than as a
   * floor-number ladder inside `populateFloor` so the glyph legend can name a
   * region's boss without re-deriving which floor it stands on.
   */
  boss: EnemyType;
  palette: RegionPalette;
}

const LEGACY_ENEMY_POOL: readonly EnemyType[] = [
  'crawler',
  'sentinel',
  'fracture_beast',
  'warp_stalker',
  'collapse_behemoth',
];

const SHIFTING_HALLS_POOL: readonly EnemyType[] = ['hinge_warden', 'seam_skitter'];
const FRACTURE_DEEPS_POOL: readonly EnemyType[] = ['fracture_leech', 'riftbound'];
const ASHEN_WARRENS_POOL: readonly EnemyType[] = ['ashlock', 'stasis_scorcher'];
const GLASS_EXPANSE_POOL: readonly EnemyType[] = ['facet_reaver', 'glass_moth'];
const UNMAKING_POOL: readonly EnemyType[] = ['unmaking_hound', 'null_scribe'];

const PALETTES: readonly RegionPalette[] = [
  { wall: '#1b1b2d', floor: '#26263d', door: '#43355f', stairs: '#1f5055', chasm: '#090912', accent: '#ffb74d' },
  { wall: '#2a1c22', floor: '#3a2529', door: '#643936', stairs: '#285056', chasm: '#10090b', accent: '#ff8a4c' },
  { wall: '#211d1a', floor: '#332c26', door: '#5a4432', stairs: '#405047', chasm: '#0d0b0a', accent: '#d9a441' },
  { wall: '#18242d', floor: '#243744', door: '#34586a', stairs: '#2d5a64', chasm: '#080d13', accent: '#80ded9' },
  { wall: '#11101d', floor: '#1b192b', door: '#30274b', stairs: '#293b4d', chasm: '#05050a', accent: '#c77dff' },
];

/**
 * Five names because the longest run is 25 floors. Shorter runs use the first
 * two, three, or four — a short run is the top of the dungeon, not a different
 * dungeon.
 */
export const REGIONS: Region[] = [
  {
    index: 0,
    name: 'The Shifting Halls',
    enemyCount: 4,
    hpMultiplier: 1,
    attackBonus: 0,
    enemyPool: SHIFTING_HALLS_POOL,
    boss: 'hinge_sovereign',
    palette: PALETTES[0],
  },
  {
    index: 1,
    name: 'The Fracture Deeps',
    enemyCount: 5,
    hpMultiplier: 1.15,
    attackBonus: 1,
    enemyPool: FRACTURE_DEEPS_POOL,
    boss: 'rift_regent',
    palette: PALETTES[1],
  },
  {
    index: 2,
    name: 'The Ashen Warrens',
    enemyCount: 6,
    hpMultiplier: 1.3,
    attackBonus: 2,
    enemyPool: ASHEN_WARRENS_POOL,
    boss: 'cinder_gatekeeper',
    palette: PALETTES[2],
  },
  {
    index: 3,
    name: 'The Glass Expanse',
    enemyCount: 7,
    hpMultiplier: 1.45,
    attackBonus: 3,
    enemyPool: GLASS_EXPANSE_POOL,
    boss: 'prism_refractor',
    palette: PALETTES[3],
  },
  {
    index: 4,
    name: 'The Unmaking',
    enemyCount: 8,
    hpMultiplier: 1.6,
    attackBonus: 4,
    enemyPool: UNMAKING_POOL,
    boss: 'null_testament',
    palette: PALETTES[4],
  },
];

export function regionIndexForFloor(floor: number): number {
  return Math.min(REGIONS.length - 1, Math.floor((floor - 1) / FLOORS_PER_REGION));
}

export function regionForFloor(floor: number): Region {
  return REGIONS[regionIndexForFloor(floor)];
}

/** 1-based depth within the region, so floor 6 is the first floor of region 1. */
export function depthWithinRegion(floor: number): number {
  return ((floor - 1) % FLOORS_PER_REGION) + 1;
}

/** The last floor of a region — every fifth. 5a turns these into arenas. */
export function isRegionEnd(floor: number): boolean {
  return depthWithinRegion(floor) === FLOORS_PER_REGION;
}

export function regionCount(finalFloor: number): number {
  return Math.ceil(finalFloor / FLOORS_PER_REGION);
}

/**
 * How far through the run this floor's region sits: 0 in the first region, 1 in
 * the last, whatever the run's length.
 *
 * Content unlocks against this rather than the floor number so a run shows its
 * whole roster whatever its length. Gating on the floor meant every species was
 * out by floor 4 — the back half of a 25-floor run had nothing left to reveal,
 * and a 10-floor run threw the deadliest species at a player still in starting
 * armor.
 *
 * Uses floor depth rather than region boundaries so the roster still unlocks
 * gradually when a short run contains only two regions.
 */
export function runProgress(floor: number, finalFloor: number): number {
  return (floor - 1) / Math.max(1, finalFloor - 1);
}
