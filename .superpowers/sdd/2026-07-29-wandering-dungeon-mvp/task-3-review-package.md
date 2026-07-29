581587f feat: add procedural map generator, A* pathfinder, and fog of war
diff --git a/src/core/map/fow.ts b/src/core/map/fow.ts
new file mode 100644
index 0000000..601f391
--- /dev/null
+++ b/src/core/map/fow.ts
@@ -0,0 +1,79 @@
+import { FloorMap, Position } from '../state';
+
+export function computeFOV(map: FloorMap, origin: Position, radius = 7): void {
+  const { width, height, tiles, visible, explored } = map;
+
+  // Reset visibility array
+  for (let y = 0; y < height; y++) {
+    for (let x = 0; x < width; x++) {
+      visible[y][x] = false;
+    }
+  }
+
+  // Ensure origin is valid
+  if (origin.x < 0 || origin.x >= width || origin.y < 0 || origin.y >= height) {
+    return;
+  }
+
+  const radiusSq = radius * radius;
+
+  // Cast rays to every point in the bounding box around origin
+  for (let dy = -radius; dy <= radius; dy++) {
+    for (let dx = -radius; dx <= radius; dx++) {
+      const distSq = dx * dx + dy * dy;
+      if (distSq > radiusSq) {
+        continue;
+      }
+
+      const tx = origin.x + dx;
+      const ty = origin.y + dy;
+
+      if (tx < 0 || tx >= width || ty < 0 || ty >= height) {
+        continue;
+      }
+
+      // Bresenham line algorithm from origin to target (tx, ty)
+      let x = origin.x;
+      let y = origin.y;
+
+      const adx = Math.abs(tx - origin.x);
+      const ady = Math.abs(ty - origin.y);
+      const sx = origin.x < tx ? 1 : -1;
+      const sy = origin.y < ty ? 1 : -1;
+      let err = adx - ady;
+
+      while (true) {
+        if (x < 0 || x >= width || y < 0 || y >= height) {
+          break;
+        }
+
+        const stepDistSq = (x - origin.x) * (x - origin.x) + (y - origin.y) * (y - origin.y);
+        if (stepDistSq > radiusSq) {
+          break;
+        }
+
+        visible[y][x] = true;
+        explored[y][x] = true;
+
+        // Wall blocks line of sight beyond itself
+        if (tiles[y][x].type === 'wall') {
+          break;
+        }
+
+        if (x === tx && y === ty) {
+          break;
+        }
+
+        const e2 = 2 * err;
+        if (e2 > -ady) {
+          err -= ady;
+          x += sx;
+        }
+        if (e2 < adx) {
+          err += adx;
+          y += sy;
+        }
+      }
+    }
+  }
+}
diff --git a/src/core/map/generator.ts b/src/core/map/generator.ts
new file mode 100644
index 0000000..726e6a8
--- /dev/null
+++ b/src/core/map/generator.ts
@@ -0,0 +1,246 @@
+import { SeededRNG } from '../rng';
+import { FloorMap, GridTile, Position, ShiftGroup } from '../state';
+
+interface Room {
+  id: string;
+  x: number;
+  y: number;
+  width: number;
+  height: number;
+  centerX: number;
+  centerY: number;
+}
+
+export function generateFloor(
+  rng: SeededRNG,
+  level: number,
+  width = 32,
+  height = 32
+): FloorMap {
+  const maxAttempts = 100;
+  const minRooms = 4;
+  const targetRooms = 8;
+  const minRoomSize = 4;
+  const maxRoomSize = 7;
+
+  let rooms: Room[] = [];
+  let tiles: GridTile[][] = [];
+  let explored: boolean[][] = [];
+  let visible: boolean[][] = [];
+  let shiftGroups: Record<string, ShiftGroup> = {};
+
+  for (let attempt = 0; attempt < 10; attempt++) {
+    rooms = [];
+    shiftGroups = {};
+    tiles = Array.from({ length: height }, (_, y) =>
+      Array.from({ length: width }, (_, x) => ({
+        x,
+        y,
+        type: 'wall',
+        shiftGroupId: null,
+      }))
+    );
+    explored = Array.from({ length: height }, () => Array(width).fill(false));
+    visible = Array.from({ length: height }, () => Array(width).fill(false));
+
+    let roomCount = 0;
+    for (let i = 0; i < maxAttempts && roomCount < targetRooms; i++) {
+      const w = rng.randomInt(minRoomSize, maxRoomSize);
+      const h = rng.randomInt(minRoomSize, maxRoomSize);
+      const x = rng.randomInt(1, width - w - 1);
+      const y = rng.randomInt(1, height - h - 1);
+
+      let overlaps = false;
+      for (const r of rooms) {
+        if (
+          x <= r.x + r.width &&
+          x + w >= r.x &&
+          y <= r.y + r.height &&
+          y + h >= r.y
+        ) {
+          overlaps = true;
+          break;
+        }
+      }
+
+      if (!overlaps) {
+        const roomId = `room_${roomCount + 1}`;
+        const newRoom: Room = {
+          id: roomId,
+          x,
+          y,
+          width: w,
+          height: h,
+          centerX: Math.floor(x + w / 2),
+          centerY: Math.floor(y + h / 2),
+        };
+        rooms.push(newRoom);
+
+        for (let ry = y; ry < y + h; ry++) {
+          for (let rx = x; rx < x + w; rx++) {
+            tiles[ry][rx] = {
+              x: rx,
+              y: ry,
+              type: 'floor',
+              shiftGroupId: roomId,
+            };
+          }
+        }
+
+        shiftGroups[roomId] = {
+          id: roomId,
+          type: 'room',
+          bounds: { x, y, width: w, height: h },
+          currentOffset: { x: 0, y: 0 },
+        };
+
+        roomCount++;
+      }
+    }
+
+    if (rooms.length >= minRooms) {
+      break;
+    }
+  }
+
+  // Connect rooms with corridors
+  for (let i = 0; i < rooms.length - 1; i++) {
+    const r1 = rooms[i];
+    const r2 = rooms[i + 1];
+    const corridorId = `corridor_${i + 1}`;
+
+    let minX = width;
+    let maxX = 0;
+    let minY = height;
+    let maxY = 0;
+
+    const trackCorridorTile = (cx: number, cy: number) => {
+      minX = Math.min(minX, cx);
+      maxX = Math.max(maxX, cx);
+      minY = Math.min(minY, cy);
+      maxY = Math.max(maxY, cy);
+    };
+
+    const carveCorridorTile = (cx: number, cy: number) => {
+      trackCorridorTile(cx, cy);
+      if (tiles[cy][cx].type === 'wall') {
+        tiles[cy][cx] = {
+          x: cx,
+          y: cy,
+          type: 'floor',
+          shiftGroupId: corridorId,
+        };
+      }
+    };
+
+    let x1 = r1.centerX;
+    let y1 = r1.centerY;
+    let x2 = r2.centerX;
+    let y2 = r2.centerY;
+
+    if (rng.random() < 0.5) {
+      const stepX = x1 <= x2 ? 1 : -1;
+      for (let x = x1; x !== x2 + stepX; x += stepX) {
+        carveCorridorTile(x, y1);
+      }
+      const stepY = y1 <= y2 ? 1 : -1;
+      for (let y = y1; y !== y2 + stepY; y += stepY) {
+        carveCorridorTile(x2, y);
+      }
+    } else {
+      const stepY = y1 <= y2 ? 1 : -1;
+      for (let y = y1; y !== y2 + stepY; y += stepY) {
+        carveCorridorTile(x1, y);
+      }
+      const stepX = x1 <= x2 ? 1 : -1;
+      for (let x = x1; x !== x2 + stepX; x += stepX) {
+        carveCorridorTile(x, y2);
+      }
+    }
+
+    shiftGroups[corridorId] = {
+      id: corridorId,
+      type: 'corridor',
+      bounds: {
+        x: minX,
+        y: minY,
+        width: Math.max(1, maxX - minX + 1),
+        height: Math.max(1, maxY - minY + 1),
+      },
+      currentOffset: { x: 0, y: 0 },
+    };
+  }
+
+  // Place doors at room-corridor junctions
+  for (const r of rooms) {
+    for (let ry = r.y; ry < r.y + r.height; ry++) {
+      for (let rx = r.x; rx < r.x + r.width; rx++) {
+        const isBorder =
+          rx === r.x ||
+          rx === r.x + r.width - 1 ||
+          ry === r.y ||
+          ry === r.y + r.height - 1;
+
+        if (isBorder && tiles[ry][rx].type === 'floor') {
+          const neighbors = [
+            { x: rx + 1, y: ry },
+            { x: rx - 1, y: ry },
+            { x: rx, y: ry + 1 },
+            { x: rx, y: ry - 1 },
+          ];
+
+          const adjacentToCorridor = neighbors.some((n) => {
+            if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
+              const tile = tiles[n.y][n.x];
+              return (
+                tile.shiftGroupId !== null &&
+                tile.shiftGroupId.startsWith('corridor_')
+              );
+            }
+            return false;
+          });
+
+          if (adjacentToCorridor) {
+            tiles[ry][rx].type = 'door';
+          }
+        }
+      }
+    }
+  }
+
+  // Set entrance at center of room 0
+  const entrance: Position = { x: rooms[0].centerX, y: rooms[0].centerY };
+  tiles[entrance.y][entrance.x].type = 'floor';
+
+  // Find furthest room from room 0
+  let maxDistance = -1;
+  let furthestRoom = rooms[rooms.length - 1];
+
+  for (let i = 1; i < rooms.length; i++) {
+    const dist =
+      Math.abs(rooms[i].centerX - entrance.x) +
+      Math.abs(rooms[i].centerY - entrance.y);
+    if (dist > maxDistance) {
+      maxDistance = dist;
+      furthestRoom = rooms[i];
+    }
+  }
+
+  const exit: Position = {
+    x: furthestRoom.centerX,
+    y: furthestRoom.centerY,
+  };
+  tiles[exit.y][exit.x].type = 'stairs_down';
+
+  return {
+    level,
+    width,
+    height,
+    tiles,
+    shiftGroups,
+    entrance,
+    exit,
+    explored,
+    visible,
+  };
+}
diff --git a/src/core/map/pathfinding.ts b/src/core/map/pathfinding.ts
new file mode 100644
index 0000000..5cfdc63
--- /dev/null
+++ b/src/core/map/pathfinding.ts
@@ -0,0 +1,124 @@
+import { FloorMap, Position, TileType } from '../state';
+
+function isWalkable(type: TileType): boolean {
+  return type === 'floor' || type === 'door' || type === 'stairs_down';
+}
+
+function heuristic(a: Position, b: Position): number {
+  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
+}
+
+export function findPath(
+  map: FloorMap,
+  start: Position,
+  end: Position,
+  _ignoreEntities = false
+): Position[] | null {
+  const { width, height, tiles } = map;
+
+  if (
+    start.x < 0 ||
+    start.x >= width ||
+    start.y < 0 ||
+    start.y >= height ||
+    end.x < 0 ||
+    end.x >= width ||
+    end.y < 0 ||
+    end.y >= height
+  ) {
+    return null;
+  }
+
+  if (!isWalkable(tiles[start.y][start.x].type) || !isWalkable(tiles[end.y][end.x].type)) {
+    return null;
+  }
+
+  if (start.x === end.x && start.y === end.y) {
+    return [{ x: start.x, y: start.y }];
+  }
+
+  const gScore = Array.from({ length: height }, () => Array(width).fill(Infinity));
+  const fScore = Array.from({ length: height }, () => Array(width).fill(Infinity));
+  const cameFrom: (Position | null)[][] = Array.from({ length: height }, () =>
+    Array(width).fill(null)
+  );
+
+  gScore[start.y][start.x] = 0;
+  fScore[start.y][start.x] = heuristic(start, end);
+
+  const openSet: Position[] = [{ x: start.x, y: start.y }];
+  const openSetKeys = new Set<string>([`${start.x},${start.y}`]);
+
+  const neighbors = [
+    { x: 0, y: -1 },
+    { x: 0, y: 1 },
+    { x: -1, y: 0 },
+    { x: 1, y: 0 },
+  ];
+
+  while (openSet.length > 0) {
+    // Find node in openSet with lowest fScore
+    let currentIdx = 0;
+    let lowestF = fScore[openSet[0].y][openSet[0].x];
+
+    for (let i = 1; i < openSet.length; i++) {
+      const pos = openSet[i];
+      const f = fScore[pos.y][pos.x];
+      if (f < lowestF) {
+        lowestF = f;
+        currentIdx = i;
+      }
+    }
+
+    const current = openSet[currentIdx];
+    if (current.x === end.x && current.y === end.y) {
+      // Reconstruct path
+      const path: Position[] = [];
+      let curr: Position | null = current;
+      while (curr !== null) {
+        path.push(curr);
+        curr = cameFrom[curr.y][curr.x];
+      }
+      path.reverse();
+      return path;
+    }
+
+    // Remove current from openSet
+    openSet.splice(currentIdx, 1);
+    openSetKeys.delete(`${current.x},${current.y}`);
+
+    const currentG = gScore[current.y][current.x];
+
+    for (const offset of neighbors) {
+      const nx = current.x + offset.x;
+      const ny = current.y + offset.y;
+
+      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
+        if (isWalkable(tiles[ny][nx].type)) {
+          const tentativeG = currentG + 1;
+          if (tentativeG < gScore[ny][nx]) {
+            cameFrom[ny][nx] = { x: current.x, y: current.y };
+            gScore[ny][nx] = tentativeG;
+            fScore[ny][nx] = tentativeG + heuristic({ x: nx, y: ny }, end);
+
+            const key = `${nx},${ny}`;
+            if (!openSetKeys.has(key)) {
+              openSet.push({ x: nx, y: ny });
+              openSetKeys.add(key);
+            }
+          }
+        }
+      }
+    }
+  }
+
+  return null;
+}
+
+export function hasValidPath(
+  map: FloorMap,
+  start: Position,
+  end: Position
+): boolean {
+  return findPath(map, start, end) !== null;
+}
diff --git a/tests/map.test.ts b/tests/map.test.ts
new file mode 100644
index 0000000..82134bd
--- /dev/null
+++ b/tests/map.test.ts
@@ -0,0 +1,173 @@
+import { describe, it, expect } from 'vitest';
+import { SeededRNG } from '../src/core/rng';
+import { generateFloor } from '../src/core/map/generator';
+import { findPath, hasValidPath } from '../src/core/map/pathfinding';
+import { computeFOV } from '../src/core/map/fow';
+import { FloorMap } from '../src/core/state';
+
+describe('Map Generator', () => {
+  it('generates a floor map with at least 4 rooms, shiftGroups, entrance, and exit', () => {
+    const rng = new SeededRNG('test-map-seed-123');
+    const map = generateFloor(rng, 1, 32, 32);
+
+    expect(map.level).toBe(1);
+    expect(map.width).toBe(32);
+    expect(map.height).toBe(32);
+
+    // Count rooms in shiftGroups
+    const roomGroups = Object.values(map.shiftGroups).filter(
+      (sg) => sg.type === 'room'
+    );
+    expect(roomGroups.length).toBeGreaterThanOrEqual(4);
+
+    // Verify corridor shiftGroups exist
+    const corridorGroups = Object.values(map.shiftGroups).filter(
+      (sg) => sg.type === 'corridor'
+    );
+    expect(corridorGroups.length).toBeGreaterThan(0);
+
+    // Verify entrance and exit are defined
+    expect(map.entrance).toBeDefined();
+    expect(map.exit).toBeDefined();
+    expect(map.tiles[map.entrance.y][map.entrance.x].type).toBe('floor');
+    expect(map.tiles[map.exit.y][map.exit.x].type).toBe('stairs_down');
+
+    // Verify explored and visible arrays are 32x32 false
+    expect(map.explored.length).toBe(32);
+    expect(map.visible.length).toBe(32);
+    expect(map.explored.every((row) => row.every((val) => val === false))).toBe(
+      true
+    );
+    expect(map.visible.every((row) => row.every((val) => val === false))).toBe(
+      true
+    );
+  });
+
+  it('places doors at room-corridor junctions', () => {
+    const rng = new SeededRNG('door-test-seed');
+    const map = generateFloor(rng, 1);
+
+    let doorCount = 0;
+    for (let y = 0; y < map.height; y++) {
+      for (let x = 0; x < map.width; x++) {
+        if (map.tiles[y][x].type === 'door') {
+          doorCount++;
+        }
+      }
+    }
+    expect(doorCount).toBeGreaterThan(0);
+  });
+});
+
+describe('Pathfinding', () => {
+  it('finds a valid path between entrance and exit on generated floor maps', () => {
+    const seeds = ['path-seed-1', 'path-seed-2', 'path-seed-3'];
+    for (const seed of seeds) {
+      const rng = new SeededRNG(seed);
+      const map = generateFloor(rng, 1);
+
+      const isValid = hasValidPath(map, map.entrance, map.exit);
+      expect(isValid).toBe(true);
+
+      const path = findPath(map, map.entrance, map.exit);
+      expect(path).not.toBeNull();
+      if (path) {
+        expect(path[0]).toEqual(map.entrance);
+        expect(path[path.length - 1]).toEqual(map.exit);
+      }
+    }
+  });
+
+  it('returns null when path is blocked by walls or out of bounds', () => {
+    const rng = new SeededRNG('blocked-path-seed');
+    const map = generateFloor(rng, 1);
+
+    // Try finding path to a wall tile on the outer border
+    const wallPos = { x: 0, y: 0 };
+    expect(map.tiles[wallPos.y][wallPos.x].type).toBe('wall');
+    expect(hasValidPath(map, map.entrance, wallPos)).toBe(false);
+
+    // Out of bounds
+    expect(hasValidPath(map, map.entrance, { x: -1, y: 5 })).toBe(false);
+  });
+});
+
+describe('Fog of War & FOV', () => {
+  it('marks origin and surrounding unblocked tiles as visible and explored', () => {
+    const rng = new SeededRNG('fov-test-seed');
+    const map = generateFloor(rng, 1);
+    const origin = map.entrance;
+
+    computeFOV(map, origin, 7);
+
+    expect(map.visible[origin.y][origin.x]).toBe(true);
+    expect(map.explored[origin.y][origin.x]).toBe(true);
+
+    // Check that some surrounding tiles within radius are visible
+    let visibleCount = 0;
+    for (let y = 0; y < map.height; y++) {
+      for (let x = 0; x < map.width; x++) {
+        if (map.visible[y][x]) {
+          visibleCount++;
+          expect(map.explored[y][x]).toBe(true);
+        }
+      }
+    }
+    expect(visibleCount).toBeGreaterThan(1);
+  });
+
+  it('blocks line of sight behind wall tiles while keeping wall visible', () => {
+    // Construct a tiny 5x5 test map
+    const testMap: FloorMap = {
+      level: 1,
+      width: 5,
+      height: 5,
+      tiles: Array.from({ length: 5 }, (_, y) =>
+        Array.from({ length: 5 }, (_, x) => ({
+          x,
+          y,
+          type: x === 2 ? 'wall' : 'floor',
+          shiftGroupId: null,
+        }))
+      ),
+      shiftGroups: {},
+      entrance: { x: 0, y: 2 },
+      exit: { x: 4, y: 2 },
+      explored: Array.from({ length: 5 }, () => Array(5).fill(false)),
+      visible: Array.from({ length: 5 }, () => Array(5).fill(false)),
+    };
+
+    // Origin at (0, 2), wall column at x = 2
+    computeFOV(testMap, { x: 0, y: 2 }, 5);
+
+    // Origin (0,2) and (1,2) are visible
+    expect(testMap.visible[2][0]).toBe(true);
+    expect(testMap.visible[2][1]).toBe(true);
+
+    // Wall at (2,2) is visible
+    expect(testMap.visible[2][2]).toBe(true);
+
+    // Tiles behind wall (3,2) and (4,2) are NOT visible
+    expect(testMap.visible[2][3]).toBe(false);
+    expect(testMap.visible[2][4]).toBe(false);
+  });
+
+  it('persists explored status across multiple FOV computations', () => {
+    const rng = new SeededRNG('fov-persist-seed');
+    const map = generateFloor(rng, 1);
+
+    const startPos = map.entrance;
+    computeFOV(map, startPos, 5);
+
+    // Move to a different position along path
+    const path = findPath(map, map.entrance, map.exit);
+    expect(path).not.toBeNull();
+    if (!path || path.length < 2) return;
+
+    const nextPos = path[Math.floor(path.length / 2)];
+    computeFOV(map, nextPos, 5);
+
+    // Explored tiles from startPos should remain explored
+    expect(map.explored[startPos.y][startPos.x]).toBe(true);
+  });
+});
