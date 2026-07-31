import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/core/rng';
import { generateFloor } from '../src/core/map/generator';
import { findPath, hasValidPath } from '../src/core/map/pathfinding';
import { computeFOV } from '../src/core/map/fow';
import { FloorMap } from '../src/core/state';

describe('Map Generator', () => {
  it('generates region-end floors as single-room arenas', () => {
    const map = generateFloor(new SeededRNG('arena-seed'), 5);
    const groups = Object.values(map.shiftGroups);
    const roomGroups = groups.filter(group => group.type === 'room');
    const corridorGroups = groups.filter(group => group.type === 'corridor');
    const stairs = map.tiles.flat().filter(tile => tile.type === 'stairs_down');

    expect(roomGroups).toHaveLength(1);
    expect(corridorGroups).toHaveLength(0);
    expect(stairs).toHaveLength(1);
    expect(hasValidPath(map, map.entrance, map.exit)).toBe(true);
    expect(generateFloor(new SeededRNG('arena-seed'), 5)).toEqual(map);
  });

  it('generates a floor map with at least 4 rooms, shiftGroups, entrance, and exit', () => {
    const rng = new SeededRNG('test-map-seed-123');
    const map = generateFloor(rng, 1, 32, 32);

    expect(map.level).toBe(1);
    expect(map.width).toBe(32);
    expect(map.height).toBe(32);

    // Count rooms in shiftGroups
    const roomGroups = Object.values(map.shiftGroups).filter(
      (sg) => sg.type === 'room'
    );
    expect(roomGroups.length).toBeGreaterThanOrEqual(4);

    // Verify corridor shiftGroups exist
    const corridorGroups = Object.values(map.shiftGroups).filter(
      (sg) => sg.type === 'corridor'
    );
    expect(corridorGroups.length).toBeGreaterThan(0);

    // Verify entrance and exit are defined
    expect(map.entrance).toBeDefined();
    expect(map.exit).toBeDefined();
    expect(map.tiles[map.entrance.y][map.entrance.x].type).toBe('floor');
    expect(map.tiles[map.exit.y][map.exit.x].type).toBe('stairs_down');

    // Verify explored and visible arrays are 32x32 false
    expect(map.explored.length).toBe(32);
    expect(map.visible.length).toBe(32);
    expect(map.explored.every((row) => row.every((val) => val === false))).toBe(
      true
    );
    expect(map.visible.every((row) => row.every((val) => val === false))).toBe(
      true
    );
  });

  it('places doors at room-corridor junctions', () => {
    const rng = new SeededRNG('door-test-seed');
    const map = generateFloor(rng, 1);

    let doorCount = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y][x].type === 'door') {
          doorCount++;
        }
      }
    }
    expect(doorCount).toBeGreaterThan(0);
  });
});

describe('Pathfinding', () => {
  it('finds a valid path between entrance and exit on generated floor maps', () => {
    const seeds = ['path-seed-1', 'path-seed-2', 'path-seed-3'];
    for (const seed of seeds) {
      const rng = new SeededRNG(seed);
      const map = generateFloor(rng, 1);

      const isValid = hasValidPath(map, map.entrance, map.exit);
      expect(isValid).toBe(true);

      const path = findPath(map, map.entrance, map.exit);
      expect(path).not.toBeNull();
      if (path) {
        expect(path[0]).toEqual(map.entrance);
        expect(path[path.length - 1]).toEqual(map.exit);
      }
    }
  });

  it('returns null when path is blocked by walls or out of bounds', () => {
    const rng = new SeededRNG('blocked-path-seed');
    const map = generateFloor(rng, 1);

    // Try finding path to a wall tile on the outer border
    const wallPos = { x: 0, y: 0 };
    expect(map.tiles[wallPos.y][wallPos.x].type).toBe('wall');
    expect(hasValidPath(map, map.entrance, wallPos)).toBe(false);

    // Out of bounds
    expect(hasValidPath(map, map.entrance, { x: -1, y: 5 })).toBe(false);
  });
});

describe('Fog of War & FOV', () => {
  it('marks origin and surrounding unblocked tiles as visible and explored', () => {
    const rng = new SeededRNG('fov-test-seed');
    const map = generateFloor(rng, 1);
    const origin = map.entrance;

    computeFOV(map, origin, 7);

    expect(map.visible[origin.y][origin.x]).toBe(true);
    expect(map.explored[origin.y][origin.x]).toBe(true);

    // Check that some surrounding tiles within radius are visible
    let visibleCount = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.visible[y][x]) {
          visibleCount++;
          expect(map.explored[y][x]).toBe(true);
        }
      }
    }
    expect(visibleCount).toBeGreaterThan(1);
  });

  it('blocks line of sight behind wall tiles while keeping wall visible', () => {
    // Construct a tiny 5x5 test map
    const testMap: FloorMap = {
      level: 1,
      width: 5,
      height: 5,
      tiles: Array.from({ length: 5 }, (_, y) =>
        Array.from({ length: 5 }, (_, x) => ({
          x,
          y,
          type: x === 2 ? 'wall' : 'floor',
          shiftGroupId: null,
        }))
      ),
      shiftGroups: {},
      entrance: { x: 0, y: 2 },
      exit: { x: 4, y: 2 },
      explored: Array.from({ length: 5 }, () => Array(5).fill(false)),
      visible: Array.from({ length: 5 }, () => Array(5).fill(false)),
    };

    // Origin at (0, 2), wall column at x = 2
    computeFOV(testMap, { x: 0, y: 2 }, 5);

    // Origin (0,2) and (1,2) are visible
    expect(testMap.visible[2][0]).toBe(true);
    expect(testMap.visible[2][1]).toBe(true);

    // Wall at (2,2) is visible
    expect(testMap.visible[2][2]).toBe(true);

    // Tiles behind wall (3,2) and (4,2) are NOT visible
    expect(testMap.visible[2][3]).toBe(false);
    expect(testMap.visible[2][4]).toBe(false);
  });

  it('persists explored status across multiple FOV computations', () => {
    const rng = new SeededRNG('fov-persist-seed');
    const map = generateFloor(rng, 1);

    const startPos = map.entrance;
    computeFOV(map, startPos, 5);

    // Move to a different position along path
    const path = findPath(map, map.entrance, map.exit);
    expect(path).not.toBeNull();
    if (!path || path.length < 2) return;

    const nextPos = path[Math.floor(path.length / 2)];
    computeFOV(map, nextPos, 5);

    // Explored tiles from startPos should remain explored
    expect(map.explored[startPos.y][startPos.x]).toBe(true);
  });
});
