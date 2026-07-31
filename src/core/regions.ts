/**
 * A run is regions of five floors, each closing on its last floor. The region a
 * floor belongs to is derived from the floor number rather than stored on the
 * state — a cached copy would be one more thing to keep in sync across descent,
 * save/resume, and the rescue paths.
 */
export const FLOORS_PER_REGION = 5;

export interface Region {
  /** 0-based, so it indexes REGIONS directly. */
  index: number;
  name: string;
}

/**
 * Five names because the longest run is 25 floors. Shorter runs use the first
 * two, three, or four — a short run is the top of the dungeon, not a different
 * dungeon.
 */
export const REGIONS: Region[] = [
  { index: 0, name: 'The Shifting Halls' },
  { index: 1, name: 'The Fracture Deeps' },
  { index: 2, name: 'The Ashen Warrens' },
  { index: 3, name: 'The Glass Expanse' },
  { index: 4, name: 'The Unmaking' },
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
