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

function applyRiftShardFallback(state: GameState): string[] {
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
