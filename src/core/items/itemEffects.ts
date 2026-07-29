import { GameState, Item, ItemType } from '../state';
import { SeededRNG } from '../rng';
import { executeShift, restorePreShiftSnapshot, capturePreShiftSnapshot } from '../shift/shiftSystem';

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
 * - Enemies on collapsing tiles take fallout and are staggered for 1 turn.
 * - Next shift countdown max is permanently reduced by 2 on this floor.
 */
export function applyHasteSigil(state: GameState, rng: SeededRNG): string[] {
  const events: string[] = [];
  events.push('You activate the Haste Sigil! Reality fractures immediately!');

  // Execute the shift
  const shiftEvents = executeShift(state, rng);
  events.push(...shiftEvents);

  // Stagger enemies on collapsed tiles (chasm tiles)
  for (const entity of state.entities) {
    if (entity.hp <= 0) continue;
    const tile = state.floorMap.tiles[entity.position.y][entity.position.x];
    if (tile.type === 'chasm' || tile.isTelegraphedCollapse) {
      entity.isStaggered = true;
      entity.staggeredTurns = 1;
      events.push(`${entity.name} is staggered by the forced shift!`);
    }
  }

  // Instability cost: reduce next countdown max by 2
  state.nextShiftCountdownMax = Math.max(3, state.nextShiftCountdownMax - 2);
  events.push(`Instability increases. Next shift will come ${2} turns sooner.`);

  // Reset countdown to new max
  state.shiftCountdown = state.nextShiftCountdownMax;

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
    case 'health_potion':
      events = applyHealthPotion(state);
      break;
    default:
      events = ['Unknown item type.'];
      break;
  }

  // Remove consumed item from inventory
  state.player.inventory.splice(itemIndex, 1);

  return events;
}
