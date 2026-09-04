import { GameState, Position, manhattan, samePosition } from '../state';
import { SeededRNG } from '../rng';
import { executeShift, restorePreShiftSnapshot, shiftInterval } from '../shift/shiftSystem';
import { findPath } from '../map/pathfinding';

const RIFT_SHARD_RANGE = 5;

function isWalkableTile(state: GameState, pos: Position): boolean {
  const { floorMap } = state;
  if (pos.x < 0 || pos.x >= floorMap.width || pos.y < 0 || pos.y >= floorMap.height) return false;
  const type = floorMap.tiles[pos.y][pos.x].type;
  return type === 'floor' || type === 'door' || type === 'stairs_down';
}

function entityAt(state: GameState, pos: Position) {
  return state.entities.find(e => e.hp > 0 && samePosition(e.position, pos));
}

/**
 * Apply Rift Shard: blink up to RIFT_SHARD_RANGE tiles along the shortest path
 * to the stairs, landing past any enemy standing on it — a teleport isn't
 * blocked by an occupied tile the way a normal step is. If the exact target
 * tile is occupied, land on the nearest open tile short of it instead of
 * refusing outright.
 */
export function applyRiftShard(state: GameState): string[] {
  const { player, floorMap } = state;

  const path = findPath(floorMap, player.position, floorMap.exit);
  if (path && path.length > 1) {
    const targetIndex = Math.min(RIFT_SHARD_RANGE, path.length - 1);
    for (let i = targetIndex; i >= 1; i--) {
      const candidate = path[i];
      if (entityAt(state, candidate)) continue;
      player.position = { x: candidate.x, y: candidate.y };
      return [`You crack the dungeon open and blink ${i} tiles down the path to the stairs.`];
    }
  }

  return applyRiftShardFallback(state);
}

/**
 * Every walkable, unoccupied tile within `radius` (manhattan) of `origin`,
 * walls or no walls between — a blink is a tear through the geometry, not a
 * walk, so the seal that cut the exit off is exactly what it is for.
 */
function blinkTargets(state: GameState, origin: Position, radius: number): Position[] {
  const out: Position[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) + Math.abs(dy) > radius) continue;
      const candidate = { x: origin.x + dx, y: origin.y + dy };
      if (!isWalkableTile(state, candidate) || entityAt(state, candidate)) continue;
      out.push(candidate);
    }
  }
  return out;
}

/**
 * No walkable path to the exit exists — the way out is sealed. Tear through
 * the seal: of every tile within range, prefer one on the exit's side of it
 * (a valid path to the stairs from there), nearest the stairs. If no tile in
 * range reconnects, blink to the one furthest from the Pursuer instead; it
 * phases through walls one stalled step at a time, so distance is turns.
 *
 * The first shape of this fallback only walked the pocket the player was
 * sealed inside, so a small pocket meant a one-tile hop with the Pursuer
 * adjacent again the next turn — which read as the shard doing nothing.
 */
function applyRiftShardFallback(state: GameState): string[] {
  const { player, floorMap } = state;
  const pursuer = state.entities.find(e => e.enemyType === 'pursuer' && e.hp > 0);
  const candidates = blinkTargets(state, player.position, RIFT_SHARD_RANGE);

  let reconnect: Position | null = null;
  let reconnectSteps = Infinity;
  for (const candidate of candidates) {
    const path = findPath(floorMap, candidate, floorMap.exit);
    if (!path) continue;
    if (path.length < reconnectSteps) {
      reconnectSteps = path.length;
      reconnect = candidate;
    }
  }
  if (reconnect) {
    player.position = reconnect;
    return ['You crack the seal open and blink through — the way to the stairs is clear again.'];
  }

  let best: Position | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = pursuer
      ? manhattan(candidate, pursuer.position)
      : manhattan(candidate, player.position);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (best) {
    player.position = best;
    return ['You crack the dungeon open and blink away through the fracture.'];
  }

  return ['The Rift Shard crumbles uselessly — there is nowhere to go.'];
}

/**
 * Apply Stasis Flask: pause shift countdown for 6 turns.
 */
export function applyStasisFlask(state: GameState): string[] {
  state.isStasisActive = true;
  state.stasisTurnsRemaining = 6;
  return ['You activate the Stasis Flask. The dungeon freezes in place for 6 turns.'];
}

/**
 * Apply Hourglass Shard: add 3 turns to shift countdown.
 */
export function applyHourglassShard(state: GameState): string[] {
  state.shiftCountdown += 3;
  return ['You crush the Hourglass Shard. The shift countdown extends by 3 turns.'];
}

/**
 * Apply Haste Sigil: force the next shift immediately.
 * - Enemies the shift displaces are staggered for 1 turn.
 * - The shift interval shortens by 2 for the rest of the run, floored at 3.
 */
export function applyHasteSigil(state: GameState, rng: SeededRNG): string[] {
  const events: string[] = ['You activate the Haste Sigil! Reality fractures immediately!'];

  // "Caught in the shift" means displaced by it. Checking for enemies left on
  // chasm or telegraphed tiles afterwards found none and staggered nobody:
  // executeShift clears the telegraph flags and its own fallout pass has already
  // shunted every buried enemy back onto safe ground.
  const before = new Map(state.entities.map(e => [e.id, `${e.position.x},${e.position.y}`]));

  events.push(...executeShift(state, rng));

  for (const entity of state.entities) {
    if (entity.hp <= 0) continue;
    if (before.get(entity.id) === `${entity.position.x},${entity.position.y}`) continue;
    entity.staggeredTurns = 1;
    events.push(`${entity.name} is staggered by the forced shift!`);
  }

  state.nextShiftCountdownMax = Math.max(3, state.nextShiftCountdownMax - 2);
  // Through shiftInterval, not the raw max: on a floor the player has lingered on,
  // resetting to the base would hand back the turns escalating pressure took.
  state.shiftCountdown = shiftInterval(state);
  events.push('Instability increases. Next shift will come 2 turns sooner.');

  return events;
}

/**
 * Apply Rewind Scroll: restore map geometry from pre-shift snapshot.
 * Does NOT undo HP, items, entity positions, or combat state.
 */
export function applyRewindScroll(state: GameState): string[] {
  if (!state.preShiftSnapshot) {
    return ['The Rewind Scroll crumbles uselessly — no shift to rewind.'];
  }

  restorePreShiftSnapshot(state);
  return ['You unroll the Rewind Scroll. The dungeon snaps back to its previous shape!'];
}

/**
 * Apply Health Potion: restore 30 HP (up to maxHp).
 */
export function applyHealthPotion(state: GameState): string[] {
  const healAmount = 30;
  const actualHeal = Math.min(healAmount, state.player.maxHp - state.player.hp);
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + healAmount);
  return [`You drink a Health Potion and recover ${actualHeal} HP.`];
}

/**
 * Use an item from the player's inventory by item ID.
 * Removes the item from inventory after use.
 * Returns event messages.
 */
export function useItem(state: GameState, itemId: string, rng: SeededRNG): string[] {
  const itemIndex = state.player.inventory.findIndex(i => i.id === itemId);
  if (itemIndex === -1) {
    return ['Item not found.'];
  }

  const item = state.player.inventory[itemIndex];
  let events: string[];

  switch (item.type) {
    case 'stasis_flask':
      events = applyStasisFlask(state);
      break;
    case 'hourglass_shard':
      events = applyHourglassShard(state);
      break;
    case 'haste_sigil':
      events = applyHasteSigil(state, rng);
      break;
    case 'rewind_scroll':
      events = applyRewindScroll(state);
      break;
    case 'rift_shard':
      events = applyRiftShard(state);
      break;
    case 'health_potion':
      events = applyHealthPotion(state);
      break;
    default:
      events = ['Unknown item type.'];
      break;
  }

  // Reduce stack count, remove the slot once it is empty.
  item.count = (item.count ?? 1) - 1;
  if (item.count <= 0) {
    state.player.inventory.splice(itemIndex, 1);
  }

  return events;
}
