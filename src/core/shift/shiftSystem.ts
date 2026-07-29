import {
  GameState,
  FloorMap,
  PendingShift,
  Position,
  PreShiftSnapshot,
  ShiftType,
  TileType,
} from '../state';
import { SeededRNG } from '../rng';
import { hasValidPath, findPath } from '../map/pathfinding';

const CARDINAL_OFFSETS: Position[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

/**
 * Capture a geometry snapshot of the current floor map for Rewind Scroll.
 * Stores only tile types and shift group positions — not HP, entities, or items.
 */
export function capturePreShiftSnapshot(map: FloorMap): PreShiftSnapshot {
  const tiles: TileType[][] = map.tiles.map(row =>
    row.map(tile => tile.type)
  );

  const shiftGroupPositions: Record<string, Position> = {};
  for (const [id, group] of Object.entries(map.shiftGroups)) {
    shiftGroupPositions[id] = { x: group.currentOffset.x, y: group.currentOffset.y };
  }

  return {
    floorIndex: map.level,
    tiles,
    shiftGroupPositions,
  };
}

/**
 * Restore map geometry from a pre-shift snapshot.
 * Only tile types, doors, and pathways are restored.
 * Entity positions, HP, items, and combat state are NOT affected.
 */
export function restorePreShiftSnapshot(state: GameState): void {
  const snapshot = state.preShiftSnapshot;
  if (!snapshot) return;

  const map = state.floorMap;

  // Restore tile types from snapshot
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      map.tiles[y][x].type = snapshot.tiles[y][x];
    }
  }

  // Restore shift group offsets
  for (const [id, offset] of Object.entries(snapshot.shiftGroupPositions)) {
    if (map.shiftGroups[id]) {
      map.shiftGroups[id].currentOffset = { x: offset.x, y: offset.y };
    }
  }

  // Clear the consumed snapshot
  state.preShiftSnapshot = null;
}

/**
 * Check if a position is within map bounds.
 */
function inBounds(map: FloorMap, pos: Position): boolean {
  return pos.x >= 0 && pos.x < map.width && pos.y >= 0 && pos.y < map.height;
}

/**
 * Check if a tile is safe (walkable and not chasm).
 */
function isSafeTile(type: TileType): boolean {
  return type === 'floor' || type === 'door' || type === 'stairs_down';
}

/**
 * Find the nearest safe tile to a given position using BFS.
 */
function findNearestSafeTile(map: FloorMap, pos: Position): Position | null {
  const visited = new Set<string>();
  const queue: Position[] = [pos];
  visited.add(`${pos.x},${pos.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (isSafeTile(map.tiles[current.y][current.x].type)) {
      return current;
    }

    for (const offset of CARDINAL_OFFSETS) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      const key = `${next.x},${next.y}`;
      if (inBounds(map, next) && !visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }

  return null;
}

/**
 * Clear telegraph overlay flags from all tiles.
 */
export function clearTelegraphs(map: FloorMap): void {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      map.tiles[y][x].isTelegraphedCollapse = false;
      map.tiles[y][x].isTelegraphedShift = false;
    }
  }
}

function groupCenter(map: FloorMap, id: string): Position {
  const { bounds } = map.shiftGroups[id];
  return {
    x: Math.floor(bounds.x + bounds.width / 2),
    y: Math.floor(bounds.y + bounds.height / 2),
  };
}

/**
 * Pick the group the shift should act on: the one the player is standing in if
 * possible, otherwise the closest. A shift the player cannot see may as well
 * not have happened, so the dungeon always rearranges itself under their nose.
 */
function pickGroupNearPlayer(map: FloorMap, ids: string[], playerPos: Position): string | null {
  if (ids.length === 0) return null;

  const standingIn = map.tiles[playerPos.y][playerPos.x].shiftGroupId;
  if (standingIn && ids.includes(standingIn)) return standingIn;

  let best = ids[0];
  let bestDist = Infinity;
  for (const id of ids) {
    const c = groupCenter(map, id);
    const dist = Math.abs(c.x - playerPos.x) + Math.abs(c.y - playerPos.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
}

/**
 * Roll the next shift up front so the telegraph can describe the real thing.
 * Previously the type was re-rolled at telegraph time and again at execution,
 * so the red warning tiles rarely matched what actually happened.
 */
export function planShift(state: GameState, rng: SeededRNG): PendingShift {
  const map = state.floorMap;
  const ids = Object.keys(map.shiftGroups);
  const roomIds = ids.filter(id => map.shiftGroups[id].type === 'room');
  const corridorIds = ids.filter(id => map.shiftGroups[id].type === 'corridor');

  const roll = rng.randomInt(0, 2);
  let type: ShiftType =
    roll === 0 ? 'room_slide' : roll === 1 ? 'corridor_reconnect' : 'localized_collapse';

  // Corridor reconnection needs at least two corridors to trade between.
  if (type === 'corridor_reconnect' && corridorIds.length < 2) type = 'room_slide';
  if (roomIds.length === 0) return { type: 'room_slide', targetGroupId: null };

  const pool = type === 'corridor_reconnect' ? corridorIds : roomIds;
  return { type, targetGroupId: pickGroupNearPlayer(map, pool, state.player.position) };
}

/** Human-readable warning for the shift that is about to land. */
export function describePendingShift(shift: PendingShift): string {
  switch (shift.type) {
    case 'localized_collapse':
      return 'Reality trembles. The edges of this chamber are about to fall away.';
    case 'corridor_reconnect':
      return 'Reality trembles. The passages nearby are about to rewire themselves.';
    default:
      return 'Reality trembles. The chamber marked in violet is about to slide.';
  }
}

/**
 * Mark the tiles the pending shift will disturb. Called when shiftCountdown
 * reaches 2 or 1.
 */
export function applyTelegraphs(state: GameState, rng: SeededRNG): void {
  const map = state.floorMap;
  clearTelegraphs(map);

  state.pendingShift ??= planShift(state, rng);
  const { type, targetGroupId } = state.pendingShift;
  if (!targetGroupId || !map.shiftGroups[targetGroupId]) return;

  const { bounds } = map.shiftGroups[targetGroupId];

  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      if (!inBounds(map, { x, y })) continue;
      if (map.tiles[y][x].shiftGroupId !== targetGroupId) continue;

      const isBorder =
        x === bounds.x || x === bounds.x + bounds.width - 1 ||
        y === bounds.y || y === bounds.y + bounds.height - 1;

      if (type === 'localized_collapse') {
        if (isBorder) map.tiles[y][x].isTelegraphedCollapse = true;
      } else {
        map.tiles[y][x].isTelegraphedShift = true;
      }
    }
  }
}

/**
 * Execute a dungeon shift. This is the core shift resolution function.
 *
 * Safety guarantees:
 * - Player ends on a valid safe tile after shift.
 * - Player retains a valid path to the exit.
 * - If a shift would violate either, the shift is rerolled (up to 5 attempts),
 *   and if no safe shift is found, the shift is skipped.
 *
 * Fallout damage: 8% max HP base (Vanguard reduces by 50% to 4%).
 */
export function executeShift(state: GameState, rng: SeededRNG): string[] {
  const events: string[] = [];
  const map = state.floorMap;

  // Capture geometry snapshot before shift (for Rewind Scroll)
  state.preShiftSnapshot = capturePreShiftSnapshot(map);

  // Clear any telegraph overlays
  clearTelegraphs(map);

  const shiftGroupIds = Object.keys(map.shiftGroups);
  const roomGroups = shiftGroupIds.filter(id => map.shiftGroups[id].type === 'room');

  if (roomGroups.length === 0) {
    events.push('The dungeon rumbles but nothing changes.');
    return events;
  }

  // Execute the shift that was telegraphed, not a fresh roll.
  const plan = state.pendingShift ?? planShift(state, rng);
  state.pendingShift = null;

  // Save map state for rollback if shift is unsafe
  const savedTileTypes: TileType[][] = map.tiles.map(row =>
    row.map(tile => tile.type)
  );

  const savedPlayerPos = { ...state.player.position };
  let shiftApplied = false;

  for (let attempt = 0; attempt < 5; attempt++) {
    // Reset tiles to saved state if retrying
    if (attempt > 0) {
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          map.tiles[y][x].type = savedTileTypes[y][x];
        }
      }
      state.player.position = { ...savedPlayerPos };
      events.length = 0;
    }

    if (plan.type === 'room_slide') {
      applyRoomSlide(state, plan.targetGroupId ?? roomGroups[0], rng, events);
    } else if (plan.type === 'corridor_reconnect') {
      applyCorridorReconnect(map, plan.targetGroupId, rng);
      events.push('Corridors twist and reconnect around you!');
    } else {
      applyLocalizedCollapse(map, plan.targetGroupId ?? roomGroups[0], events);
    }

    // Safety check: player must be on safe tile with path to exit
    const playerPos = state.player.position;
    const playerTile = map.tiles[playerPos.y][playerPos.x];
    const playerOnSafeTile = isSafeTile(playerTile.type);
    const pathExists = playerOnSafeTile && hasValidPath(map, playerPos, map.exit);

    if (playerOnSafeTile && pathExists) {
      shiftApplied = true;
      break;
    }

    // If player is not safe, try emergency repositioning
    if (!playerOnSafeTile) {
      const safeTile = findNearestSafeTile(map, playerPos);
      if (safeTile && hasValidPath(map, safeTile, map.exit)) {
        state.player.position = safeTile;
        applyFalloutDamage(state, events);
        shiftApplied = true;
        break;
      }
    }

    // This shift configuration is unsafe, retry with different RNG
  }

  if (!shiftApplied) {
    // Restore original tile state — skip the shift
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        map.tiles[y][x].type = savedTileTypes[y][x];
      }
    }
    state.player.position = { ...savedPlayerPos };
    events.length = 0;
    events.push('Reality trembles but holds steady.');
  }

  // Record what actually moved so the renderer can flash it — without this the
  // player has no way to tell a shift apart from nothing happening.
  const changed: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y][x].type !== savedTileTypes[y][x]) changed.push({ x, y });
    }
  }
  state.lastShiftChanges = changed;
  state.lastShiftTurn = state.turnCount;
  if (shiftApplied && changed.length > 0) {
    events.push(`${changed.length} tiles rearranged themselves.`);
  }

  // Apply fallout damage to entities on collapsed tiles
  applyEntityFallout(state, events);

  return events;
}

/**
 * Apply a room slide shift: move tiles of the target room by a small offset.
 */
function applyRoomSlide(
  state: GameState,
  targetId: string,
  rng: SeededRNG,
  events: string[]
): void {
  const map = state.floorMap;
  const group = map.shiftGroups[targetId];
  events.push('Rooms grind and shift position!');

  // Pick a small offset (1-2 tiles in a cardinal direction)
  const directions: Position[] = [
    { x: 1, y: 0 }, { x: -1, y: 0 },
    { x: 0, y: 1 }, { x: 0, y: -1 },
  ];
  const dir = directions[rng.randomInt(0, 3)];
  const magnitude = rng.randomInt(1, 2);
  const dx = dir.x * magnitude;
  const dy = dir.y * magnitude;

  const bounds = group.bounds;

  // Collect room tiles and clear them
  const roomTiles: { relX: number; relY: number; type: TileType; shiftGroupId: string | null }[] = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      if (inBounds(map, { x, y }) && map.tiles[y][x].shiftGroupId === targetId) {
        roomTiles.push({
          relX: x - bounds.x,
          relY: y - bounds.y,
          type: map.tiles[y][x].type,
          shiftGroupId: map.tiles[y][x].shiftGroupId,
        });
        map.tiles[y][x].type = 'wall';
        map.tiles[y][x].shiftGroupId = null;
      }
    }
  }

  // Place room tiles at new position
  const newX = Math.max(1, Math.min(map.width - bounds.width - 1, bounds.x + dx));
  const newY = Math.max(1, Math.min(map.height - bounds.height - 1, bounds.y + dy));

  for (const tile of roomTiles) {
    const px = newX + tile.relX;
    const py = newY + tile.relY;
    if (inBounds(map, { x: px, y: py })) {
      map.tiles[py][px].type = tile.type;
      map.tiles[py][px].shiftGroupId = tile.shiftGroupId;
    }
  }

  // Update group bounds
  group.bounds.x = newX;
  group.bounds.y = newY;
  group.currentOffset = {
    x: group.currentOffset.x + (newX - bounds.x),
    y: group.currentOffset.y + (newY - bounds.y),
  };

  // Reconnect corridors: carve floor tiles from the new room center to adjacent rooms
  const centerX = Math.floor(newX + bounds.width / 2);
  const centerY = Math.floor(newY + bounds.height / 2);

  // Find nearest other room and carve a short corridor
  const otherRooms = Object.values(map.shiftGroups).filter(
    g => g.id !== targetId && g.type === 'room'
  );
  if (otherRooms.length > 0) {
    let nearest = otherRooms[0];
    let minDist = Infinity;
    for (const other of otherRooms) {
      const otherCX = Math.floor(other.bounds.x + other.bounds.width / 2);
      const otherCY = Math.floor(other.bounds.y + other.bounds.height / 2);
      const dist = Math.abs(otherCX - centerX) + Math.abs(otherCY - centerY);
      if (dist < minDist) {
        minDist = dist;
        nearest = other;
      }
    }

    const nearCX = Math.floor(nearest.bounds.x + nearest.bounds.width / 2);
    const nearCY = Math.floor(nearest.bounds.y + nearest.bounds.height / 2);

    // Carve L-shaped corridor
    const stepX = centerX <= nearCX ? 1 : -1;
    for (let x = centerX; x !== nearCX + stepX; x += stepX) {
      if (inBounds(map, { x, y: centerY }) && map.tiles[centerY][x].type === 'wall') {
        map.tiles[centerY][x].type = 'floor';
        map.tiles[centerY][x].shiftGroupId = `corridor_shift_${targetId}`;
      }
    }
    const stepY = centerY <= nearCY ? 1 : -1;
    for (let y = centerY; y !== nearCY + stepY; y += stepY) {
      if (inBounds(map, { x: nearCX, y }) && map.tiles[y][nearCX].type === 'wall') {
        map.tiles[y][nearCX].type = 'floor';
        map.tiles[y][nearCX].shiftGroupId = `corridor_shift_${targetId}`;
      }
    }
  }
}

/**
 * Apply corridor reconnection: partially collapse the target corridor and
 * carve a new one between two rooms.
 */
function applyCorridorReconnect(
  map: FloorMap,
  targetId: string | null,
  rng: SeededRNG
): void {
  if (!targetId || !map.shiftGroups[targetId]) return;
  const group = map.shiftGroups[targetId];
  const bounds = group.bounds;

  // Collapse some corridor tiles to walls (but keep ends open)
  let collapsedCount = 0;
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      if (inBounds(map, { x, y }) && map.tiles[y][x].shiftGroupId === targetId) {
        // Only collapse middle tiles, not endpoints
        const isEndpoint =
          (x === bounds.x && y === bounds.y) ||
          (x === bounds.x + bounds.width - 1 && y === bounds.y + bounds.height - 1);
        if (!isEndpoint && rng.random() < 0.4) {
          map.tiles[y][x].type = 'wall';
          map.tiles[y][x].shiftGroupId = null;
          collapsedCount++;
        }
      }
    }
  }

  // Pick two random rooms and carve a new short corridor between them
  const roomGroups = Object.keys(map.shiftGroups).filter(
    id => map.shiftGroups[id].type === 'room'
  );
  if (roomGroups.length < 2) return;

  const r1Id = roomGroups[rng.randomInt(0, roomGroups.length - 1)];
  let r2Id = roomGroups[rng.randomInt(0, roomGroups.length - 1)];
  let safety = 0;
  while (r2Id === r1Id && safety < 10) {
    r2Id = roomGroups[rng.randomInt(0, roomGroups.length - 1)];
    safety++;
  }

  const r1 = map.shiftGroups[r1Id];
  const r2 = map.shiftGroups[r2Id];
  const c1x = Math.floor(r1.bounds.x + r1.bounds.width / 2);
  const c1y = Math.floor(r1.bounds.y + r1.bounds.height / 2);
  const c2x = Math.floor(r2.bounds.x + r2.bounds.width / 2);
  const c2y = Math.floor(r2.bounds.y + r2.bounds.height / 2);

  // Carve L-shaped corridor
  const newCorridorId = `corridor_reconnect_${rng.randomInt(100, 999)}`;
  const stepX = c1x <= c2x ? 1 : -1;
  for (let x = c1x; x !== c2x + stepX; x += stepX) {
    if (inBounds(map, { x, y: c1y }) && map.tiles[c1y][x].type === 'wall') {
      map.tiles[c1y][x].type = 'floor';
      map.tiles[c1y][x].shiftGroupId = newCorridorId;
    }
  }
  const stepY = c1y <= c2y ? 1 : -1;
  for (let y = c1y; y !== c2y + stepY; y += stepY) {
    if (inBounds(map, { x: c2x, y }) && map.tiles[y][c2x].type === 'wall') {
      map.tiles[y][c2x].type = 'floor';
      map.tiles[y][c2x].shiftGroupId = newCorridorId;
    }
  }
}

/**
 * Apply localized collapse: border tiles of the target room become chasms.
 */
function applyLocalizedCollapse(
  map: FloorMap,
  targetId: string,
  events: string[]
): void {
  const group = map.shiftGroups[targetId];
  const bounds = group.bounds;

  let collapsedCount = 0;
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      if (!inBounds(map, { x, y })) continue;
      const isBorder = x === bounds.x || x === bounds.x + bounds.width - 1 ||
                        y === bounds.y || y === bounds.y + bounds.height - 1;
      if (isBorder && map.tiles[y][x].shiftGroupId === targetId) {
        map.tiles[y][x].type = 'chasm';
        collapsedCount++;
      }
    }
  }

  if (collapsedCount > 0) {
    events.push(`Part of a chamber collapses into the void! (${collapsedCount} tiles lost)`);
  }
}

/**
 * Apply fallout damage to the player.
 * Base: 8% max HP. Vanguard passive reduces by 50% (to 4%).
 */
function applyFalloutDamage(state: GameState, events: string[]): void {
  state.lastDamageSource = 'the shift';
  const basePercent = 0.08;
  const reduction = state.player.classType === 'vanguard' ? 0.5 : 1.0;
  const damage = Math.max(1, Math.floor(state.player.maxHp * basePercent * reduction));

  // Damage goes to shield first
  if (state.player.shieldHp > 0) {
    const absorbed = Math.min(state.player.shieldHp, damage);
    state.player.shieldHp -= absorbed;
    const remaining = damage - absorbed;
    if (remaining > 0) {
      state.player.hp = Math.max(0, state.player.hp - remaining);
    }
    events.push(`Shift fallout deals ${damage} damage (${absorbed} absorbed by shield).`);
  } else {
    state.player.hp = Math.max(0, state.player.hp - damage);
    events.push(`Shift fallout deals ${damage} damage!`);
  }
}

/**
 * Check entities standing on collapsed tiles and apply fallout damage + stagger.
 */
function applyEntityFallout(state: GameState, events: string[]): void {
  for (const entity of state.entities) {
    if (entity.hp <= 0) continue;
    const tile = state.floorMap.tiles[entity.position.y][entity.position.x];
    if (tile.type === 'chasm') {
      // Move entity to nearest safe tile
      const safeTile = findNearestSafeTile(state.floorMap, entity.position);
      if (safeTile) {
        entity.position = safeTile;
        const damage = Math.max(1, Math.floor(entity.maxHp * 0.08));
        entity.hp = Math.max(0, entity.hp - damage);
        events.push(`${entity.name} takes ${damage} shift fallout damage!`);
      } else {
        // No safe tile — entity falls into the void
        entity.hp = 0;
        events.push(`${entity.name} falls into the void!`);
      }
    }
  }
}
