import {
  Enemy,
  GameState,
  FloorMap,
  PendingShift,
  Position,
  PreShiftSnapshot,
  ShiftGroupMove,
  ShiftTileChange,
  ShiftType,
  TileType,
} from '../state';
import { SeededRNG } from '../rng';
import { damagePlayer } from '../damage';
import { hasValidPath } from '../map/pathfinding';

const CARDINAL_OFFSETS: Position[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

/**
 * Capture a geometry snapshot of the current floor map for Rewind Scroll.
 * Stores tile types and where each shift group sits — not HP, entities, or items.
 */
export function capturePreShiftSnapshot(map: FloorMap): PreShiftSnapshot {
  const shiftGroupPlacements: Record<string, ShiftGroupMove> = {};
  for (const [id, group] of Object.entries(map.shiftGroups)) {
    shiftGroupPlacements[id] = {
      bounds: { ...group.bounds },
      currentOffset: { ...group.currentOffset },
    };
  }

  return {
    floorIndex: map.level,
    tiles: map.tiles.map(row => row.map(tile => tile.type)),
    shiftGroupPlacements,
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

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      map.tiles[y][x].type = snapshot.tiles[y][x];
    }
  }

  for (const [id, placement] of Object.entries(snapshot.shiftGroupPlacements)) {
    const group = map.shiftGroups[id];
    if (!group) continue;
    group.bounds = { ...placement.bounds };
    group.currentOffset = { ...placement.currentOffset };
  }

  // A rewind rewrites the geometry a pending plan was rehearsed against, so its
  // recorded tile changes — and the warnings drawn from them — no longer describe
  // anything real. Dropping the plan makes the next telegraph re-rehearse.
  state.pendingShift = null;
  clearTelegraphs(map);

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
 * Nearest safe tile to `pos`, by BFS. `isTaken` rejects tiles that are safe but
 * already occupied, so a shift that shunts things out of a collapse cannot stack
 * two enemies on one tile or drop one on top of the player.
 *
 * Falls back to a merely-safe tile if every reachable one is taken — being
 * inside another entity beats being inside the void.
 */
function findNearestSafeTile(
  map: FloorMap,
  pos: Position,
  isTaken?: (p: Position) => boolean
): Position | null {
  const visited = new Set<string>([`${pos.x},${pos.y}`]);
  const queue: Position[] = [pos];
  let fallback: Position | null = null;

  // Index cursor rather than shift(): shift() is O(n) and this walks the map.
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (isSafeTile(map.tiles[current.y][current.x].type)) {
      if (!isTaken || !isTaken(current)) return current;
      fallback ??= current;
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

  return fallback;
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
 * How many shifts in a row may leave the exit unreachable. The dungeon is
 * allowed to seal the way out — that is the oscillation the mechanic is built
 * on — but a second consecutive sealing shift is rejected at plan time, so the
 * player is never locked away from the stairs for longer than one shift cycle.
 */
export const MAX_EXIT_BLOCKED_STREAK = 1;

/** Attempts to find a shift that satisfies the safety rules before giving up. */
const PLAN_ATTEMPTS = 6;

/** Clone the geometry a shift can touch, so a shift can be rehearsed safely. */
function cloneGeometry(map: FloorMap): FloorMap {
  return {
    ...map,
    tiles: map.tiles.map(row => row.map(tile => ({ ...tile }))),
    shiftGroups: Object.fromEntries(
      Object.entries(map.shiftGroups).map(([id, g]) => [
        id,
        { ...g, bounds: { ...g.bounds }, currentOffset: { ...g.currentOffset } },
      ])
    ),
  };
}

function diffGeometry(
  before: FloorMap,
  after: FloorMap
): { changes: ShiftTileChange[]; groupMoves: Record<string, ShiftGroupMove> } {
  const changes: ShiftTileChange[] = [];
  for (let y = 0; y < before.height; y++) {
    for (let x = 0; x < before.width; x++) {
      const a = before.tiles[y][x];
      const b = after.tiles[y][x];
      if (a.type !== b.type || a.shiftGroupId !== b.shiftGroupId) {
        changes.push({ x, y, to: b.type, shiftGroupId: b.shiftGroupId });
      }
    }
  }

  const groupMoves: Record<string, ShiftGroupMove> = {};
  for (const [id, g] of Object.entries(after.shiftGroups)) {
    const was = before.shiftGroups[id];
    if (!was) continue;
    if (
      was.bounds.x !== g.bounds.x ||
      was.bounds.y !== g.bounds.y ||
      was.currentOffset.x !== g.currentOffset.x ||
      was.currentOffset.y !== g.currentOffset.y
    ) {
      groupMoves[id] = { bounds: { ...g.bounds }, currentOffset: { ...g.currentOffset } };
    }
  }

  return { changes, groupMoves };
}

/**
 * The subset of a plan's changes that alters a tile's *type*, i.e. the ones a
 * player could actually see happen. Changes that only re-tag a tile's shift
 * group look identical on screen, so they are neither telegraphed nor flashed.
 */
function visibleChanges(map: FloorMap, changes: ShiftTileChange[]): ShiftTileChange[] {
  return changes.filter(
    c => inBounds(map, c) && map.tiles[c.y][c.x].type !== c.to
  );
}

/** Groups ordered by how close they are to the player, nearest first. */
function orderGroupsByDistance(map: FloorMap, ids: string[], playerPos: Position): string[] {
  const first = pickGroupNearPlayer(map, ids, playerPos);
  const rest = ids
    .filter(id => id !== first)
    .sort((a, b) => {
      const ca = groupCenter(map, a);
      const cb = groupCenter(map, b);
      return (
        Math.abs(ca.x - playerPos.x) + Math.abs(ca.y - playerPos.y) -
        (Math.abs(cb.x - playerPos.x) + Math.abs(cb.y - playerPos.y))
      );
    });
  return first ? [first, ...rest] : rest;
}

/**
 * Dig an L-shaped floor corridor from `from` to `to`, so a sealed-off exit can
 * always be reopened. This is the hard fail-safe behind MAX_EXIT_BLOCKED_STREAK:
 * the dungeon may lock the stairs away for one shift cycle, never longer.
 */
function carveRescuePath(map: FloorMap, from: Position, to: Position): void {
  const open = (x: number, y: number): void => {
    if (!inBounds(map, { x, y })) return;
    const tile = map.tiles[y][x];
    if (isSafeTile(tile.type)) return;
    tile.type = 'floor';
    tile.shiftGroupId = 'corridor_rescue';
  };

  const stepX = from.x <= to.x ? 1 : -1;
  for (let x = from.x; x !== to.x + stepX; x += stepX) open(x, from.y);

  const stepY = from.y <= to.y ? 1 : -1;
  for (let y = from.y; y !== to.y + stepY; y += stepY) open(to.x, y);
}

/**
 * Recompute which tiles are doors, so door glyphs stay a pure function of the
 * geometry instead of a memory of where junctions used to be.
 *
 * Rooms here are solid floor rectangles with no wall border, so a door is not a
 * gap in a wall — it is the tile where a corridor meets a room, which is exactly
 * the rule the floor generator places doors by. Shifts slide rooms away from
 * their corridors and collapse corridors out from under them, which used to
 * strand `+` glyphs in open floor or bury them in rock, and left newly formed
 * junctions unmarked. Re-deriving both directions fixes both.
 *
 * Only floor and door tiles are ever swapped; stairs and chasms are left alone.
 */
export function syncDoors(map: FloorMap): void {
  const isCorridorGroup = (id: string | null): boolean => id !== null && id.startsWith('corridor');

  const isRoomTile = (p: Position): boolean => {
    if (!inBounds(map, p)) return false;
    const tile = map.tiles[p.y][p.x];
    return isSafeTile(tile.type) && tile.shiftGroupId !== null && !isCorridorGroup(tile.shiftGroupId);
  };

  const isOpen = (p: Position): boolean =>
    inBounds(map, p) && isSafeTile(map.tiles[p.y][p.x].type);

  /**
   * A threshold is a corridor tile with a room on one side and the passage
   * continuing on the opposite side — the pinch point a house plan draws the
   * door in. Both halves matter: without the room test the glyph lands anywhere
   * in the corridor, and without the opposite-side test a corridor running
   * flush along a room's outer edge marks its entire length as one absurdly
   * wide doorway.
   */
  const isThreshold = (x: number, y: number): boolean =>
    CARDINAL_OFFSETS.some(
      o => isRoomTile({ x: x + o.x, y: y + o.y }) && isOpen({ x: x - o.x, y: y - o.y })
    );

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y][x];
      if (tile.type !== 'floor' && tile.type !== 'door') continue;

      // The door belongs to the corridor, not the room. Marking the room's own
      // edge tile — which is what this did originally — drew the glyph one
      // square inside the room, short of the gap it was meant to fill.
      tile.type = isCorridorGroup(tile.shiftGroupId) && isThreshold(x, y) ? 'door' : 'floor';
    }
  }
}

/** Where the player would stand once a rehearsed shift has landed. */
function playerLandingSpot(map: FloorMap, pos: Position): Position | null {
  if (isSafeTile(map.tiles[pos.y][pos.x].type)) return pos;
  return findNearestSafeTile(map, pos);
}

const INERT_SHIFT: Omit<PendingShift, 'type'> = {
  targetGroupId: null,
  changes: [],
  groupMoves: {},
  blocksExit: false,
};

/**
 * Roll the next shift and rehearse it on a throwaway copy of the map, so the
 * plan carries the exact tile changes it will make.
 *
 * The telegraph and the execution both read those changes, which is the only
 * way to guarantee they agree. Rolling only a *type* up front was not enough:
 * `localized_collapse` was re-derived at execution, failed its safety check
 * against the player's own room every time, and got skipped — so a warning of
 * sixteen collapsing tiles reliably resolved to "reality holds steady".
 *
 * Safety rules applied here (a rejected plan is re-rolled):
 * - the player must have somewhere safe to stand afterwards;
 * - the exit may become unreachable, but not for two shifts in a row.
 */
export function planShift(state: GameState, rng: SeededRNG): PendingShift {
  const map = state.floorMap;
  const ids = Object.keys(map.shiftGroups);
  const roomIds = ids.filter(id => map.shiftGroups[id].type === 'room');
  const corridorIds = ids.filter(id => map.shiftGroups[id].type === 'corridor');

  if (roomIds.length === 0) return { type: 'room_slide', ...INERT_SHIFT };

  const mustReopenExit = state.exitBlockedStreak >= MAX_EXIT_BLOCKED_STREAK;

  const roll = rng.randomInt(0, 2);
  let type: ShiftType =
    roll === 0 ? 'room_slide' : roll === 1 ? 'corridor_reconnect' : 'localized_collapse';

  // Corridor reconnection needs at least two corridors to trade between.
  if (type === 'corridor_reconnect' && corridorIds.length < 2) type = 'room_slide';

  // The type is rolled once and kept: retrying only the *target* keeps every
  // shift type as likely as its roll. Re-rolling the type on each attempt let
  // the safety rules quietly starve `localized_collapse` down to 3% of shifts.
  const pool = type === 'corridor_reconnect' ? corridorIds : roomIds;
  const candidates = orderGroupsByDistance(map, pool, state.player.position).slice(
    0,
    PLAN_ATTEMPTS
  );

  for (const targetGroupId of candidates) {
    const sim = cloneGeometry(map);
    rehearseShift({ ...state, floorMap: sim }, type, targetGroupId, roomIds[0], rng);

    const landing = playerLandingSpot(sim, state.player.position);
    if (!landing) continue; // nowhere to stand — never acceptable

    // Sealing the exit is a legitimate outcome, not a failure: the dungeon is
    // meant to close the way out and reopen it a cycle later. But when it is
    // already sealed, this shift owes the player a way back — so carve one.
    // Merely rejecting sealing plans is not a fail-safe: it opens nothing, and
    // the floor locks into a sealed state with every shift turning inert.
    if (mustReopenExit && !hasValidPath(sim, landing, sim.exit)) {
      carveRescuePath(sim, landing, sim.exit);
    }

    // Every wall this plan moved or dug through may have stranded a door, so the
    // sim is made door-consistent before it is diffed — that way the cleanup is
    // part of the plan and gets telegraphed rather than appearing out of nowhere.
    syncDoors(sim);
    const { changes, groupMoves } = diffGeometry(map, sim);
    if (changes.length === 0) continue;

    const blocksExit = !hasValidPath(sim, landing, sim.exit);
    return { type, targetGroupId, changes, groupMoves, blocksExit };
  }

  // No target worked. If the exit is currently sealed, the fail-safe still has
  // to fire, so fall back to a shift that does nothing but dig the way out —
  // telegraphed like any other, so the player watches the passage open.
  if (mustReopenExit) {
    const sim = cloneGeometry(map);
    const landing = playerLandingSpot(sim, state.player.position) ?? state.player.position;
    carveRescuePath(sim, landing, sim.exit);
    syncDoors(sim);
    const { changes, groupMoves } = diffGeometry(map, sim);
    if (changes.length > 0) {
      return { type: 'corridor_reconnect', targetGroupId: null, changes, groupMoves, blocksExit: false };
    }
  }

  return { type, ...INERT_SHIFT };
}

/**
 * Run one shift's geometry mutation on a throwaway map. These are the only
 * callers of the apply* helpers — nothing mutates the live map through them, so
 * they emit no log lines; the flavour text comes from SHIFT_FLAVOUR at execution.
 */
function rehearseShift(
  simState: GameState,
  type: ShiftType,
  targetGroupId: string | null,
  fallbackRoomId: string,
  rng: SeededRNG
): void {
  if (type === 'room_slide') {
    applyRoomSlide(simState.floorMap, targetGroupId ?? fallbackRoomId, rng);
  } else if (type === 'corridor_reconnect') {
    applyCorridorReconnect(simState.floorMap, targetGroupId, simState.player.position, rng);
  } else {
    applyLocalizedCollapse(simState.floorMap, targetGroupId ?? fallbackRoomId);
  }
}

/** Human-readable warning for the shift that is about to land. */
export function describePendingShift(shift: PendingShift): string {
  const sealing = shift.blocksExit ? ' The way out will be cut off.' : '';

  switch (shift.type) {
    case 'localized_collapse':
      return `Reality trembles. The tiles marked in red are about to fall away.${sealing}`;
    case 'corridor_reconnect':
      return `Reality trembles. Passages will close where marked red, open where marked violet.${sealing}`;
    default:
      return `Reality trembles. A chamber is about to slide — red tiles close, violet tiles open.${sealing}`;
  }
}

/**
 * Mark exactly the tiles the pending shift will change. Called when
 * shiftCountdown reaches 2 or 1.
 *
 * Red marks a tile that is about to become impassable or deadly; violet marks
 * one that is about to open up. Both come straight off the rehearsed plan.
 */
export function applyTelegraphs(state: GameState, rng: SeededRNG): void {
  const map = state.floorMap;
  clearTelegraphs(map);

  state.pendingShift ??= planShift(state, rng);

  for (const change of visibleChanges(map, state.pendingShift.changes)) {
    const tile = map.tiles[change.y][change.x];
    if (isSafeTile(change.to)) tile.isTelegraphedShift = true;
    else tile.isTelegraphedCollapse = true;
  }
}

/**
 * Execute a dungeon shift by replaying the plan that was already telegraphed.
 *
 * No geometry decisions are made here — `planShift` rehearsed the shift and
 * recorded its exact tile changes, and this function applies them verbatim.
 * That is what keeps the warning tiles and the outcome identical.
 *
 * Safety guarantees (enforced at plan time, see `planShift`):
 * - the player always has a safe tile to stand on afterwards;
 * - the exit may be sealed off, but never for two shifts in a row.
 *
 * Fallout damage: 8% max HP base (Vanguard reduces by 50% to 4%).
 */
export function executeShift(state: GameState, rng: SeededRNG): string[] {
  const events: string[] = [];
  const map = state.floorMap;

  // Capture geometry snapshot before shift (for Rewind Scroll)
  state.preShiftSnapshot = capturePreShiftSnapshot(map);

  const plan = state.pendingShift ?? planShift(state, rng);
  state.pendingShift = null;

  // Tiles the player will actually see change — recorded before the changes are
  // applied, since afterwards there is nothing left to compare against.
  const changed: Position[] = visibleChanges(map, plan.changes).map(c => ({ x: c.x, y: c.y }));

  clearTelegraphs(map);

  if (plan.changes.length === 0) {
    // Nothing was telegraphed either, so this reads as a quiet turn rather than
    // a warning that came to nothing.
    events.push('Reality trembles but holds steady.');
  } else {
    for (const change of plan.changes) {
      if (!inBounds(map, change)) continue;
      map.tiles[change.y][change.x].type = change.to;
      map.tiles[change.y][change.x].shiftGroupId = change.shiftGroupId;
    }
    for (const [id, move] of Object.entries(plan.groupMoves)) {
      const group = map.shiftGroups[id];
      if (!group) continue;
      group.bounds = { ...move.bounds };
      group.currentOffset = { ...move.currentOffset };
    }

    events.push(SHIFT_FLAVOUR[plan.type]);

    // The player can be caught in the collapse: shunt them clear and bill them
    // for it. planShift guaranteed such a tile exists.
    if (!isSafeTile(map.tiles[state.player.position.y][state.player.position.x].type)) {
      const safeTile = findNearestSafeTile(map, state.player.position, p =>
        state.entities.some(e => e.hp > 0 && e.position.x === p.x && e.position.y === p.y)
      );
      if (safeTile) {
        state.player.position = safeTile;
        applyFalloutDamage(state, events);
      }
    }
  }

  state.lastShiftChanges = changed;
  state.lastShiftTurn = state.turnCount;
  state.lastShiftType = plan.changes.length > 0 ? plan.type : null;
  if (changed.length > 0) {
    events.push(`${changed.length} tiles rearranged themselves.`);
  }

  // The way out can close temporarily — say so, and count it so the next plan
  // is forced to reopen it.
  if (hasValidPath(map, state.player.position, map.exit)) {
    if (state.exitBlockedStreak > 0) {
      events.push('A path to the stairs opens up again.');
    }
    state.exitBlockedStreak = 0;
  } else {
    state.exitBlockedStreak++;
    events.push('The way to the stairs is sealed. The next shift will have to open it.');
  }

  // Apply fallout damage to entities on collapsed tiles
  applyEntityFallout(state, events);

  return events;
}

const SHIFT_FLAVOUR: Record<ShiftType, string> = {
  room_slide: 'Rooms grind and shift position!',
  corridor_reconnect: 'Corridors twist and reconnect around you!',
  localized_collapse: 'Part of a chamber collapses into the void!',
};

/** Move the target room's tiles by a small cardinal offset and rewire it. */
function applyRoomSlide(map: FloorMap, targetId: string, rng: SeededRNG): void {
  const group = map.shiftGroups[targetId];

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
 *
 * The rooms are the two nearest the player rather than two picked at random
 * from the whole floor — a rewiring the player cannot see reads as nothing
 * having happened, and the telegraph and flash can only draw tiles on screen.
 */
function applyCorridorReconnect(
  map: FloorMap,
  targetId: string | null,
  playerPos: Position,
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

  // Carve a new corridor between the two rooms closest to the player.
  const roomGroups = Object.keys(map.shiftGroups)
    .filter(id => map.shiftGroups[id].type === 'room')
    .sort((a, b) => {
      const ca = groupCenter(map, a);
      const cb = groupCenter(map, b);
      const da = Math.abs(ca.x - playerPos.x) + Math.abs(ca.y - playerPos.y);
      const db = Math.abs(cb.x - playerPos.x) + Math.abs(cb.y - playerPos.y);
      return da - db;
    });
  if (roomGroups.length < 2) return;

  const r1Id = roomGroups[0];
  const r2Id = roomGroups[1];

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
 * The stairs are never swallowed — losing the exit tile itself would make the
 * floor unfinishable, which no fail-safe downstream could undo.
 */
function applyLocalizedCollapse(map: FloorMap, targetId: string): void {
  const group = map.shiftGroups[targetId];
  const bounds = group.bounds;

  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      if (!inBounds(map, { x, y })) continue;
      const isBorder = x === bounds.x || x === bounds.x + bounds.width - 1 ||
                        y === bounds.y || y === bounds.y + bounds.height - 1;
      if (!isBorder || map.tiles[y][x].shiftGroupId !== targetId) continue;
      if (map.tiles[y][x].type === 'stairs_down') continue;
      map.tiles[y][x].type = 'chasm';
    }
  }
}

/** Fraction of max HP a shift costs anything it catches. */
const FALLOUT_FRACTION = 0.08;

/** The Vanguard braces for impact, so fallout hits them at half strength. */
function applyFalloutDamage(state: GameState, events: string[]): void {
  const reduction = state.player.classType === 'vanguard' ? 0.5 : 1;
  const damage = Math.max(1, Math.floor(state.player.maxHp * FALLOUT_FRACTION * reduction));
  events.push('The collapse catches you.');
  damagePlayer(state, damage, events, 'the shift');
}

/**
 * Shunt every enemy the shift buried out of the geometry and bill them for it.
 *
 * The check is "not a safe tile", not "is a chasm": a room slide turns the tiles
 * it vacates into wall, and an enemy left inside one could never path out again —
 * it just sat there, embedded, attacking anything that walked past.
 */
function applyEntityFallout(state: GameState, events: string[]): void {
  const occupied = (p: Position, self: Enemy): boolean =>
    (state.player.position.x === p.x && state.player.position.y === p.y) ||
    state.entities.some(
      e => e !== self && e.hp > 0 && e.position.x === p.x && e.position.y === p.y
    );

  for (const entity of state.entities) {
    if (entity.hp <= 0) continue;
    const tile = state.floorMap.tiles[entity.position.y][entity.position.x];
    if (isSafeTile(tile.type)) continue;

    const safeTile = findNearestSafeTile(state.floorMap, entity.position, p =>
      occupied(p, entity)
    );
    if (!safeTile) {
      entity.hp = 0;
      events.push(`${entity.name} falls into the void!`);
      continue;
    }

    entity.position = safeTile;
    const damage = Math.max(1, Math.floor(entity.maxHp * FALLOUT_FRACTION));
    entity.hp = Math.max(0, entity.hp - damage);
    events.push(`${entity.name} takes ${damage} shift fallout damage!`);
  }
}
