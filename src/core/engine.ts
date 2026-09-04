import {
  Chest,
  Enemy,
  EnemyType,
  GameState,
  GridTile,
  isUnkillable,
  Item,
  ItemDrop,
  LogMessage,
  manhattan,
  Position,
  samePosition,
  WeaponType,
} from './state';
import { SeededRNG } from './rng';
import { damagePlayer } from './damage';
import { armorMagnitude } from './armorModifiers';
import {
  applyTelegraphs,
  clearTelegraphs,
  describePendingShift,
  executeShift,
  floorPressure,
  isFloorStabilized,
  shiftInterval,
} from './shift/shiftSystem';
import { useItem } from './items/itemEffects';
import { computeFOV } from './map/fow';
import { findPath, hasValidPath } from './map/pathfinding';
import {
  buildFloor,
  coinsPerKill,
  createItem,
  pickSpawnPosition,
  PURSUER_TEMPLATE,
  xpPerKill,
  xpToNextLevel,
} from './game';
import { isRegionEnd, regionForFloor } from './regions';
import { createShop, resolvePurchase } from './shop';

export type GameAction =
  | { type: 'MOVE'; dx: number; dy: number }
  | { type: 'WAIT' }
  | { type: 'USE_ITEM'; itemId: string }
  | { type: 'ABILITY' }
  | { type: 'DESCEND' }
  | { type: 'EQUIP_ARMOR' }
  | { type: 'DECLINE_ARMOR' }
  | { type: 'PICK_UP_ARMOR' }
  | { type: 'BUY_ITEM'; offerId: string }
  | { type: 'EQUIP_WEAPON' }
  | { type: 'DECLINE_WEAPON' }
  | { type: 'PICK_UP_WEAPON' }
  | { type: 'TOGGLE_WEAPON' }
  | { type: 'INSPECT_TILE'; x: number; y: number };

export interface DispatchResult {
  state: GameState;
  events: string[];
}

/**
 * Fallout Shield: base absorb is 25% of max HP, +50% when a shift is imminent.
 *
 * Exported because the How to Play panel states all four numbers to the player,
 * and the synergy they describe is the best decision in the game — a panel that
 * taught a bonus the engine no longer paid would be worse than no panel. Same
 * contract as `ENEMY_STYLES` feeding the glyph key.
 */
export const SHIELD_BASE_FRACTION = 0.25;
export const SHIELD_DURATION = 3;
export const ABILITY_COOLDOWN = 6;
/** The shield brace bonus applies at or below this many turns on the clock. */
export const SHIELD_BRACE_COUNTDOWN = 2;
export const SHIELD_BRACE_MULTIPLIER = 1.5;
/**
 * How many turns out the floor starts painting warning tiles. The same number as
 * the shield's brace window today, and deliberately a separate constant: they
 * are two rules that happen to agree, and the How to Play panel quotes both.
 */
export const TELEGRAPH_COUNTDOWN = 2;
const ENEMY_AGGRO_RADIUS = 8;

/**
 * Actions that advance the world clock. Everything else is free — answering the
 * armor prompt in particular must not, or the dungeon would get a turn for a
 * question it asked the player.
 */
function consumesTurn(action: GameAction): boolean {
  return (
    action.type !== 'INSPECT_TILE' &&
    action.type !== 'EQUIP_ARMOR' &&
    action.type !== 'DECLINE_ARMOR' &&
    // Reopening a prompt the player already answered is not an act in the world
    // either — it only re-asks the question that EQUIP/DECLINE will answer.
    action.type !== 'PICK_UP_ARMOR' &&
    action.type !== 'EQUIP_WEAPON' &&
    action.type !== 'DECLINE_WEAPON' &&
    action.type !== 'PICK_UP_WEAPON' &&
    // Sheathing or drawing a bow is a stance change, not an act in the world.
    action.type !== 'TOGGLE_WEAPON' &&
    // Trading is free. Charging a turn would let the dungeon shift the arena
    // apart while the player reads a price list.
    action.type !== 'BUY_ITEM'
  );
}

function isWalkableAt(state: GameState, pos: Position): boolean {
  const { floorMap } = state;
  if (pos.x < 0 || pos.x >= floorMap.width || pos.y < 0 || pos.y >= floorMap.height) {
    return false;
  }
  const type = floorMap.tiles[pos.y][pos.x].type;
  return type === 'floor' || type === 'door' || type === 'stairs_down';
}

function enemyAt(state: GameState, pos: Position): Enemy | undefined {
  return state.entities.find(e => e.hp > 0 && samePosition(e.position, pos));
}

/**
 * Ranged attack with the Longbow. Scans in the pressed direction for the first
 * visible enemy within range and fires at it. Spends the turn whether or not
 * anything was hit — the arrow was loosed.
 */
function rangedAttack(state: GameState, rng: SeededRNG, range: number, dx: number, dy: number, events: string[]): boolean {
  // Walk outward in the pressed direction, looking for an enemy
  let cx = state.player.position.x + dx;
  let cy = state.player.position.y + dy;
  const { floorMap } = state;
  for (let dist = 1; dist <= range; dist++) {
    if (cx < 0 || cx >= floorMap.width || cy < 0 || cy >= floorMap.height) break;
    // Blocked by a wall — arrow stops
    if (floorMap.tiles[cy][cx].type === 'wall' || floorMap.tiles[cy][cx].type === 'chasm') break;
    if (!floorMap.visible[cy][cx]) { cx += dx; cy += dy; continue; }
    const enemy = state.entities.find(e => e.hp > 0 && e.position.x === cx && e.position.y === cy);
    if (enemy) {
      if (isUnkillable(enemy)) {
        events.push(`Your arrow passes through ${enemy.name}. It does not slow.`);
        return true;
      }
      const dealt = Math.max(1, state.player.attackPower + rng.randomInt(-2, 2));
      events.push(`Your arrow hits ${enemy.name} for ${dealt} damage.`);
      damageEnemy(state, enemy, dealt, events);
      return true;
    }
    cx += dx;
    cy += dy;
  }
  events.push('The arrow finds nothing.');
  return true;
}

function log(state: GameState, text: string, type: LogMessage['type'] = 'info'): void {
  state.eventLog.push({
    id: `log_${state.turnCount}_${state.eventLog.length}`,
    text,
    type,
    timestamp: state.turnCount,
  });
  // Keep the log bounded — the HUD only ever shows the tail.
  if (state.eventLog.length > 200) {
    state.eventLog.splice(0, state.eventLog.length - 200);
  }
}

function classify(text: string): LogMessage['type'] {
  const lower = text.toLowerCase();
  // Checked before the shift branch: losing or regaining the way out is the most
  // consequential thing a shift can do, so it gets the warning colour, not violet.
  if (lower.includes('sealed') || lower.includes('opens up again')) {
    return 'warning';
  }
  if (
    lower.includes('shift') ||
    lower.includes('corridor') ||
    lower.includes('collapse') ||
    lower.includes('trembles') ||
    lower.includes('rearranged')
  ) {
    return 'shift';
  }
  if (lower.includes('hit') || lower.includes('strike') || lower.includes('damage')) {
    return 'combat';
  }
  return 'info';
}

export { damagePlayer };

/**
 * Everything a level is worth. Kept as constants beside the one function that
 * spends them so 10c retunes the payout in a single place.
 */
export const HP_PER_LEVEL = 8;
export const ATTACK_PER_LEVEL = 1;

/**
 * The only place levelling changes the player's stats. Nothing else in the engine
 * may touch `maxHp` or `attackPower` for progression reasons — 10c retunes the
 * curve here and in `xpToNextLevel`, and a second `maxHp +=` anywhere would make
 * that impossible to reason about.
 *
 * Loops rather than levelling once, because a boss can be worth more than a whole
 * level at the top of the curve.
 */
export function grantXp(state: GameState, amount: number, events: string[]): void {
  const { player } = state;
  player.xp += amount;

  while (player.xp >= xpToNextLevel(player.level)) {
    player.xp -= xpToNextLevel(player.level);
    player.level++;
    player.maxHp += HP_PER_LEVEL;
    // Healed by exactly the gain, not to full: a level-up should reward fighting,
    // not quietly replace the potion economy.
    player.hp += HP_PER_LEVEL;
    player.attackPower += ATTACK_PER_LEVEL;
    // Accumulated rather than overwritten so a multi-level kill splashes the
    // final level with everything it actually bought.
    const pending = state.lastLevelUp;
    state.lastLevelUp = {
      level: player.level,
      maxHpGained: (pending?.maxHpGained ?? 0) + HP_PER_LEVEL,
      attackGained: (pending?.attackGained ?? 0) + ATTACK_PER_LEVEL,
    };
    events.push(
      `You reach level ${player.level}. +${HP_PER_LEVEL} max HP, +${ATTACK_PER_LEVEL} attack.`
    );
  }
}

/**
 * The one path by which an enemy loses HP, and therefore the only place a kill
 * is paid out. Thorns routes through here rather than subtracting HP itself, so
 * a thorns kill awards the same XP and the same coins, in the same words, as a
 * kill by the player's own hand — the run log and the level curve cannot tell
 * them apart, which is the point.
 *
 * Nothing here can start another attack, so a kill mid-attack-resolution
 * terminates rather than recursing.
 */
function damageEnemy(state: GameState, target: Enemy, dealt: number, events: string[]): void {
  if (isUnkillable(target)) return;

  target.hp = Math.max(0, target.hp - dealt);
  if (target.hp > 0) return;

  // Only the player ever damages an enemy, so a kill here is always theirs. Paid
  // straight to the purse rather than dropped: a coin pile the next shift buries
  // would tax the player for fighting where the geometry was about to move.
  const regionIndex = regionForFloor(state.floorMap.level).index;
  const bounty = coinsPerKill(regionIndex, target.isBoss === true) + coinBonus(state);
  const xp = xpPerKill(target.enemyType, regionIndex);
  state.player.coins += bounty;
  // XP is named before coins so the run log's coin regex, which anchors on the
  // trailing "coins.", keeps matching this line.
  events.push(`${target.name} is destroyed. You gain ${xp} XP and collect ${bounty} coins.`);
  grantXp(state, xp, events);
}

/** What a `prospecting` roll adds to every coin the player picks up. */
function coinBonus(state: GameState): number {
  return armorMagnitude(state.player.armor, 'prospecting');
}

/**
 * Add an item to the inventory, stacking it onto an existing slot of the same
 * type and category rather than opening a new one. Armor and weapons never
 * reach here — they are equipped directly or routed through pendingArmorOffer
 * / pendingWeaponOffer — so this only ever stacks consumables.
 */
function addToInventory(state: GameState, item: Item): void {
  const existing = state.player.inventory.find(i => i.type === item.type && i.category === item.category);
  if (existing) {
    existing.count = (existing.count ?? 1) + 1;
  } else {
    item.count = 1;
    state.player.inventory.push(item);
  }
}

function openChestContents(state: GameState, chest: Chest, events: string[]): void {
  const { contents } = chest;
  if (contents.category === 'currency') {
    const value = (contents.value ?? 0) + coinBonus(state);
    state.player.coins += value;
    events.push(`The chest holds ${contents.name}.`);
  } else if (contents.category === 'armor' && state.player.armor) {
    // Armor with existing armor: offer as swap (same pattern as floor armor)
    state.pendingArmorOffer = contents;
    events.push(`The chest contains ${contents.name}.`);
  } else if (contents.category === 'armor') {
    // No armor yet: equip directly
    state.player.armor = contents;
    events.push(`The chest contains ${contents.name} — you equip it.`);
  } else {
    // Consumable: add to inventory
    addToInventory(state, contents);
    events.push(`The chest contains a ${contents.name}.`);
  }
}

function playerAttack(state: GameState, rng: SeededRNG, target: Enemy, events: string[]): void {
  // Answered before the roll, so the log never reports a number that was never
  // taken. The swing still spends the turn — that is what makes trading blows
  // with it the wrong move rather than merely a fruitless one.
  if (isUnkillable(target)) {
    events.push(`Your blow closes over ${target.name}. It does not slow.`);
    return;
  }

  const weaponBonus = state.player.weapon?.damageBonus ?? 0;
  const dealt = Math.max(1, state.player.attackPower + weaponBonus + rng.randomInt(-2, 2));
  events.push(`You hit ${target.name} for ${dealt} damage.`);
  damageEnemy(state, target, dealt, events);
}

/**
 * One enemy's blow, and the armor's answer to it.
 *
 * The reactions fire after the hit lands and only while the player is still up:
 * armor that keeps working after its wearer is down would let a corpse collect
 * the kill. Thorns resolves before the shove so the attacker is billed for the
 * hit it actually landed, and a shove is skipped once thorns has killed it.
 */
function enemyAttack(state: GameState, rng: SeededRNG, attacker: Enemy, events: string[]): void {
  const dealt = Math.max(1, attacker.attackPower + rng.randomInt(-2, 2));
  events.push(`${attacker.name} strikes you.`);
  damagePlayer(state, dealt, events, attacker.name);

  if (state.player.hp <= 0) return;

  const { armor } = state.player;
  const thorns = armorMagnitude(armor, 'thorns');
  if (thorns > 0 && !isUnkillable(attacker)) {
    // Worded without "damage" on purpose: the shell sparks red on the player for
    // any line carrying that word, and this one is damage going the other way.
    events.push(`${armor!.name} strikes back at ${attacker.name} for ${thorns}.`);
    state.armorReactions.push({ kind: 'thorns', ...attacker.position });
    damageEnemy(state, attacker, thorns, events);
  }

  if (attacker.hp <= 0) return;

  const shove = armorMagnitude(armor, 'bulwark');
  if (shove > 0) {
    const landed = knockBack(state, attacker, shove);
    if (landed) {
      events.push(`${armor!.name} throws ${attacker.name} back.`);
      state.armorReactions.push({ kind: 'bulwark', ...attacker.position });
    }
  }
}

/**
 * Shove `target` up to `tiles` steps directly away from the player, one step at a
 * time, stopping at the first step it cannot take. Wedged against a wall, a
 * chasm, the map edge, another enemy, or the merchant, it simply does not move —
 * a shove with nowhere to go is a shove that fails, not one that teleports past
 * the obstacle or tunnels into it.
 *
 * A boss stands its ground: it only ever attacks once already adjacent, so a
 * shove that lands the instant it hits would repel it every single exchange,
 * denying the player a second swing forever and turning a defensive perk into
 * a wall between them and the one enemy they most need to land melee hits on.
 * Regular enemies don't have that problem — chasing one back down is a real
 * cost paid for the free hit bulwark bought, not an unwinnable stalemate.
 *
 * An enemy only ever attacks from an orthogonally adjacent tile, so the two axes
 * give a cardinal direction and the target can never be pushed onto the player.
 * Moving an entity cannot start another attack, so this cannot recurse.
 */
function knockBack(state: GameState, target: Enemy, tiles: number): boolean {
  if (target.isBoss) return false;

  const dx = Math.sign(target.position.x - state.player.position.x);
  const dy = Math.sign(target.position.y - state.player.position.y);
  if (dx === 0 && dy === 0) return false;

  let moved = false;
  for (let step = 0; step < tiles; step++) {
    const next = { x: target.position.x + dx, y: target.position.y + dy };
    if (!isWalkableAt(state, next)) break;
    if (enemyAt(state, next)) break;
    if (samePosition(next, state.player.position)) break;
    if (state.shop && samePosition(state.shop.position, next)) break;
    target.position = next;
    moved = true;
  }
  return moved;
}

/** Returns whether the action actually happened (a blocked bump is free). */
function playerMove(state: GameState, rng: SeededRNG, dx: number, dy: number, events: string[]): boolean {
  const target = { x: state.player.position.x + dx, y: state.player.position.y + dy };
  const occupant = enemyAt(state, target);

  if (occupant) {
    playerAttack(state, rng, occupant, events);
    return true;
  }

  // Ranged attack: if holding a ranged weapon and no adjacent enemy, scan
  // the direction for enemies in line of sight within range. Gated on
  // `weaponActive` so the bow can be sheathed to walk normally — without it,
  // every direction press while carrying one fires instead of moving, which is
  // unplayable on a touch device that moves by tapping a direction.
  const weapon = state.player.weapon;
  if (weapon?.range && !occupant && state.player.weaponActive) {
    const hit = rangedAttack(state, rng, weapon.range, dx, dy, events);
    if (hit) return true;
  }

  const { shop } = state;
  if (shop && samePosition(shop.position, target)) {
    // Bumping the merchant trades instead of stepping onto them, the same shape
    // as bumping an enemy attacks. Free, like BUY_ITEM itself: the floor is
    // stabilized by the time a merchant exists, so there is no clock to dodge —
    // and charging a turn for opening a price list, when reading it is free,
    // would only tax the player for closing the modal by accident.
    state.shopOpened = true;
    events.push(`${shop.merchant} spreads out their wares.`);
    return false;
  }

  const chestHere = (state.floorMap.chests ?? []).find(
    c => !c.looted && samePosition(c.position, target)
  );
  if (chestHere) {
    chestHere.looted = true;
    state.player.position = target;
    openChestContents(state, chestHere, events);
    return true;
  }

  if (!isWalkableAt(state, target)) {
    events.push('The way is blocked.');
    return false;
  }

  state.player.position = target;

  const drops = state.floorMap.drops;
  if (drops) {
    const here = (d: ItemDrop): boolean => samePosition(d.position, target);
    const answered = (d: ItemDrop): boolean =>
      d.item.category === 'armor' && state.declinedArmorIds.includes(d.item.id);
    // A tile can hold more than one drop — an equip drops the replaced piece
    // wherever the player is standing. Skip past anything already answered, so a
    // *new* piece landing on a declined one is still the thing the step finds.
    const unanswered = drops.findIndex(d => here(d) && !answered(d));
    const index = unanswered !== -1 ? unanswered : drops.findIndex(here);
    if (index !== -1) {
      const drop = drops[index];
      if (drop.item.category === 'armor' && state.player.armor) {
        if (state.declinedArmorIds.includes(drop.item.id)) {
          // Already answered. Re-asking every time the player crosses their own
          // floor is a modal prompt for a decision they have made, so the offer
          // demotes to the HUD's pickup hint until they ask for it again.
          events.push(`The ${drop.item.name} still lies here.`);
        } else {
          // Leave it on the floor and ask. The swap is destructive — the piece
          // being replaced falls here — so it is not something to do silently.
          state.pendingArmorOffer = drop.item;
          events.push(`A ${drop.item.name} lies here.`);
        }
      } else if (drop.item.category === 'armor') {
        drops.splice(index, 1);
        state.player.armor = drop.item;
        events.push(`You strap on the ${drop.item.name}.`);
      } else if (drop.item.category === 'weapon' && state.player.weapon && drop.item.type !== 'short_blade') {
        // Player has a weapon already and this isn't a starter. Offer the swap.
        if (state.declinedWeaponIds.includes(drop.item.id)) {
          events.push(`The ${drop.item.name} still lies here.`);
        } else {
          state.pendingWeaponOffer = drop.item;
          events.push(`A ${drop.item.name} lies here.`);
        }
      } else if (drop.item.category === 'weapon') {
        drops.splice(index, 1);
        const old = state.player.weapon;
        state.player.weapon = drop.item;
        if (state.player.weapon?.range) {
          state.player.weaponActive = false;
        }
        if (old) {
          drops.push({ item: old, position: target });
          events.push(`You pick up the ${drop.item.name}, dropping the ${old.name}.`);
        } else {
          events.push(`You pick up the ${drop.item.name}.`);
        }
      } else if (drop.item.category === 'currency') {
        // Currency never enters the inventory — it is a number on the player, so
        // it cannot be "used", dropped, or take up a hotbar slot.
        drops.splice(index, 1);
        const picked = (drop.item.value ?? 0) + coinBonus(state);
        state.player.coins += picked;
        state.lastPickupName = `${picked} coins`;
        state.lastPickupPosition = { ...target };
        events.push(`You pocket ${picked} coins.`);
      } else {
        drops.splice(index, 1);
        addToInventory(state, drop.item);
        state.lastPickupName = drop.item.name;
        state.lastPickupPosition = { ...target };
        events.push(`You pick up a ${drop.item.name}.`);
      }
    }
  }

  const tile = state.floorMap.tiles[target.y][target.x];
  if (tile.type === 'stairs_down') {
    events.push('Stairs descend into the dark here. Take them to go deeper.');
  }

  return true;
}

/**
 * The declined piece of armor the player is standing on, if any. The HUD's
 * pickup hint and PICK_UP_ARMOR both read this one function so the indicator can
 * never offer a pickup the action would refuse.
 */
export function declinedArmorUnderfoot(state: GameState): Item | null {
  if (state.isGameOver || state.pendingArmorOffer || state.pendingWeaponOffer) return null;
  const { x, y } = state.player.position;
  const drop = state.floorMap.drops?.find(
    d =>
      d.position.x === x &&
      d.position.y === y &&
      d.item.category === 'armor' &&
      state.declinedArmorIds.includes(d.item.id)
  );
  return drop ? drop.item : null;
}

/** Swap the worn armor for the piece underfoot, dropping the old one in its place. */
function equipOfferedArmor(state: GameState, events: string[]): void {
  const offered = state.pendingArmorOffer;
  state.pendingArmorOffer = null;
  if (!offered) return;

  const { player, floorMap } = state;
  const drops = floorMap.drops ?? [];
  const index = drops.findIndex(d => d.item.id === offered.id);
  // The floor can shift out from under an open prompt, taking the piece with it.
  if (index === -1) return;

  drops.splice(index, 1);
  const previous = player.armor;
  player.armor = offered;
  // Taking a piece is an answer too: the one just replaced falls at the player's
  // feet, and prompting for it the next time they step back onto this tile would
  // re-ask the swap they only just made. It stays declined until they ask.
  state.declinedArmorIds = state.declinedArmorIds.filter(id => id !== offered.id);
  if (previous) {
    drops.push({ item: previous, position: { ...player.position } });
    if (!state.declinedArmorIds.includes(previous.id)) state.declinedArmorIds.push(previous.id);
  }
  events.push(`You swap into the ${offered.name}.`);
}

/** The declined weapon the player is standing on, if any. Same pattern as declinedArmorUnderfoot. */
export function declinedWeaponUnderfoot(state: GameState): Item | null {
  if (state.isGameOver || state.pendingWeaponOffer) return null;
  const { x, y } = state.player.position;
  const drop = state.floorMap.drops?.find(
    d =>
      d.position.x === x &&
      d.position.y === y &&
      d.item.category === 'weapon' &&
      state.declinedWeaponIds.includes(d.item.id)
  );
  return drop ? drop.item : null;
}

/** Swap the worn weapon for the piece underfoot. Same pattern as equipOfferedArmor. */
function equipOfferedWeapon(state: GameState, events: string[]): void {
  const offered = state.pendingWeaponOffer;
  state.pendingWeaponOffer = null;
  if (!offered) return;

  const { player, floorMap } = state;
  const drops = floorMap.drops ?? [];
  const index = drops.findIndex(d => d.item.id === offered.id);
  if (index === -1) return;

  drops.splice(index, 1);
  const previous = player.weapon;
  player.weapon = offered;
  if (player.weapon?.range) {
    player.weaponActive = false;
  }
  state.declinedWeaponIds = state.declinedWeaponIds.filter(id => id !== offered.id);
  if (previous) {
    drops.push({ item: previous, position: { ...player.position } });
    if (!state.declinedWeaponIds.includes(previous.id)) state.declinedWeaponIds.push(previous.id);
  }
  events.push(`You take up the ${offered.name}.`);
}

/**
 * Vanguard Fallout Shield: temporary damage absorption, stronger when a shift
 * is about to land (within 2 turns), per the class fantasy of bracing for impact.
 */
function useAbility(state: GameState, events: string[]): boolean {
  const { player } = state;

  if (player.shieldTurnsRemaining > 0) {
    events.push('Fallout Shield is already active.');
    return false;
  }
  if (state.abilityCooldown > 0) {
    events.push(`Fallout Shield is recharging (${state.abilityCooldown} turns).`);
    return false;
  }

  const imminent = state.shiftCountdown <= SHIELD_BRACE_COUNTDOWN;
  const fraction = imminent
    ? SHIELD_BASE_FRACTION * SHIELD_BRACE_MULTIPLIER
    : SHIELD_BASE_FRACTION;
  player.shieldHp = Math.round(player.maxHp * fraction);
  player.shieldTurnsRemaining = SHIELD_DURATION;
  // A `ponderous` roll's whole cost: the extra defense it already folded into the
  // piece is paid for here, in turns the shield is not available.
  state.abilityCooldown = ABILITY_COOLDOWN + armorMagnitude(player.armor, 'ponderous');

  events.push(
    imminent
      ? `You brace against the coming shift. Fallout Shield absorbs ${player.shieldHp} damage.`
      : `Fallout Shield raised, absorbing ${player.shieldHp} damage.`
  );

  return true;
}

function descend(state: GameState, rng: SeededRNG, events: string[]): boolean {
  const { player, floorMap } = state;
  const tile = floorMap.tiles[player.position.y][player.position.x];

  if (tile.type !== 'stairs_down') {
    events.push('There are no stairs here.');
    return false;
  }

  if (isRegionEnd(floorMap.level)) {
    const regionIndex = regionForFloor(floorMap.level).index;
    if (state.entities.some(enemy => enemy.isBoss && enemy.hp > 0)) {
      events.push('The arena remains sealed while its guardian lives.');
      return false;
    }
    if (!state.clearedRegions.includes(regionIndex)) {
      events.push('The arena remains sealed until its guardian is defeated.');
      return false;
    }
  }

  if (floorMap.level >= state.config.finalFloor) {
    state.isVictory = true;
    state.isGameOver = true;
    events.push('You climb out of the shifting dark. You survived the Wandering Dungeon.');
    return true;
  }

  events.push(`You descend to floor ${floorMap.level + 1}.`);
  buildFloor(state, rng, floorMap.level + 1);

  // Announce boss when entering an arena floor
  const boss = state.entities.find(e => e.isBoss && e.hp > 0);
  if (boss) {
    events.push(`${boss.name} bars your path.`);
  }

  return true;
}

/**
 * Spend coins on a stocked offer. The shop module decides whether the trade is
 * legal; the write to `GameState` stays here, so there remains exactly one place
 * the player's purse and inventory change.
 */
function buyFromShop(state: GameState, offerId: string, events: string[]): void {
  const shop = state.shop;
  if (!shop) {
    events.push('There is no one here to trade with.');
    return;
  }

  const result = resolvePurchase(shop, offerId, state.player.coins);
  events.push(result.message);
  if (!result.ok || !result.item) return;

  const offer = shop.stock.find(entry => entry.id === offerId)!;
  offer.sold = true;
  state.player.coins -= offer.price;
  addToInventory(state, result.item);
}

function awardBossDefeats(state: GameState, rng: SeededRNG, events: string[]): void {
  const defeatedBosses = state.entities.filter(enemy => enemy.isBoss && enemy.hp <= 0);
  if (defeatedBosses.length === 0) return;

  const clearedRegions = state.clearedRegions;
  const region = regionForFloor(state.floorMap.level);
  if (clearedRegions.includes(region.index)) return;

  clearedRegions.push(region.index);
  // The merchant arrives with the region's fall, and is rolled exactly once —
  // see ShopState. Reopening the modal must never reroll the stock.
  const stall =
    pickSpawnPosition(state.floorMap, rng, state.player.position, [state.player.position]) ??
    state.floorMap.entrance;
  state.shop = createShop(rng, region.index, state.floorMap.level, stall);
  const reward = createItem('hourglass_shard', `boss_reward_${state.floorMap.level}`);
  addToInventory(state, reward);
  state.lastBossDefeat = {
    floor: state.floorMap.level,
    regionName: region.name,
    bossName: defeatedBosses[0].name,
  };
  events.push(`${defeatedBosses[0].name} falls. ${region.name} is cleared; you claim a ${reward.name}.`);
  events.push(`${state.shop.merchant} sets up a stall in the quiet arena. Walk into them to trade.`);
}

/**
 * Every boss but the Hinge Sovereign works the same way: mark a tile one turn
 * out, resolve it the next. Only the radius, the damage, and the words differ,
 * so they are a table rather than four near-identical blocks — adding a marking
 * boss is an entry, and sharing one resolution is what keeps every one of them
 * dodgeable by the same movement.
 *
 * `inverted` is the Null Testament alone: its mark is the one tile that is safe,
 * so standing on it is the shelter rather than the trap.
 *
 * Damage is dealt before the line narrating it, in every entry, so a mark that
 * kills reads in the same order as any other killing blow.
 */
const BOSS_MARK_COOLDOWN = 4;

interface BossMark {
  /** Manhattan tiles from the mark that still count as caught. 0 is the tile itself. */
  radius: number;
  damage: number;
  inverted?: boolean;
  caught: (name: string) => string;
  spared: (name: string) => string;
}

const BOSS_MARKS: Partial<Record<EnemyType, BossMark>> = {
  rift_regent: {
    radius: 0,
    damage: 6,
    caught: name => `${name} tears open the marked rift beneath you.`,
    spared: name => `${name}'s marked rift collapses harmlessly.`,
  },
  cinder_gatekeeper: {
    radius: 2,
    damage: 5,
    caught: name => `${name} seals the exit in a choking ash cloud.`,
    spared: name => `${name}'s ash interdict disperses harmlessly.`,
  },
  prism_refractor: {
    radius: 0,
    damage: 6,
    caught: name => `${name} fractures the marked tile into a spray of glass.`,
    spared: name => `${name}'s refracted fault misses as you move.`,
  },
  null_testament: {
    radius: 0,
    damage: 7,
    inverted: true,
    caught: name => `${name} erases everything beyond the marked refuge.`,
    spared: name => `${name} watches as you shelter in the marked refuge.`,
  },
};

function settleDeaths(state: GameState, rng: SeededRNG, events: string[]): void {
  awardBossDefeats(state, rng, events);
  // Capture kill flash positions before removing corpses
  const killed = state.entities.filter(e => e.hp <= 0 && e.hp !== undefined);
  if (killed.length > 0) {
    state.lastKillPosition = killed[0].position;
  }
  state.entities = state.entities.filter(e => e.hp > 0);
}

/**
 * What the Pursuer does when a shift has severed every route to the player — the
 * one situation a hunter must not simply stop in, because a hunter that can be
 * walled off is a hunter that has been solved.
 *
 * It goes through instead: one tile along whichever axis it is furthest out on,
 * walls included, and then it stands still for a turn. So geometry costs it
 * time — half speed through rock, which is slower than a player who has
 * somewhere to run — and never costs it the hunt. The stall is `staggeredTurns`,
 * which the renderer already dims, so the state it leaves behind is one the
 * screen already tells.
 */
function phaseTowardPlayer(state: GameState, enemy: Enemy, events: string[]): void {
  const dx = state.player.position.x - enemy.position.x;
  const dy = state.player.position.y - enemy.position.y;
  const step =
    Math.abs(dx) >= Math.abs(dy)
      ? { x: enemy.position.x + Math.sign(dx), y: enemy.position.y }
      : { x: enemy.position.x, y: enemy.position.y + Math.sign(dy) };

  if (
    step.x < 0 ||
    step.x >= state.floorMap.width ||
    step.y < 0 ||
    step.y >= state.floorMap.height ||
    samePosition(step, state.player.position) ||
    enemyAt(state, step)
  ) {
    return;
  }

  enemy.position = step;
  enemy.staggeredTurns = 1;
  if (state.floorMap.visible[step.y][step.x]) {
    events.push(`${enemy.name} comes through the wall.`);
  }
}

function enemyTurns(state: GameState, rng: SeededRNG, events: string[]): void {
  for (const enemy of state.entities) {
    if (enemy.hp <= 0) continue;

    if (enemy.staggeredTurns > 0) {
      enemy.staggeredTurns--;
      continue;
    }

    if (enemy.isBoss && (enemy.bossCooldown ?? 0) > 0) {
      enemy.bossCooldown = (enemy.bossCooldown ?? 1) - 1;
    }

    const dist = manhattan(enemy.position, state.player.position);

    if (dist === 1) {
      enemyAttack(state, rng, enemy, events);
      continue;
    }

    if (
      enemy.enemyType === 'hinge_sovereign' &&
      enemy.bossCooldown === 0 &&
      state.pendingShift &&
      state.shiftCountdown <= 2 &&
      dist <= 8
    ) {
      const damage = enemy.attackPower + rng.randomInt(1, 3);
      damagePlayer(state, damage, events, enemy.name);
      events.push(`${enemy.name} snaps the shifting halls toward you.`);
      enemy.bossCooldown = 3;
      continue;
    }

    const mark = BOSS_MARKS[enemy.enemyType];
    if (mark && enemy.bossTarget) {
      const within = manhattan(state.player.position, enemy.bossTarget) <= mark.radius;
      if (mark.inverted ? !within : within) {
        damagePlayer(state, mark.damage, events, enemy.name);
        events.push(mark.caught(enemy.name));
      } else {
        events.push(mark.spared(enemy.name));
      }
      enemy.bossTarget = undefined;
      enemy.bossCooldown = BOSS_MARK_COOLDOWN;
      continue;
    }

    if (enemy.enemyType === 'cinder_gatekeeper' && enemy.bossCooldown === 0 && state.isStasisActive) {
      enemy.bossTarget = { ...state.floorMap.exit };
      events.push(`${enemy.name} marks the exit with an ash interdict.`);
      continue;
    }

    if (enemy.enemyType === 'null_testament' && enemy.bossCooldown === 0 && state.pendingShift && state.shiftCountdown === 2) {
      const refuge = ([
        { x: state.player.position.x + 1, y: state.player.position.y },
        { x: state.player.position.x - 1, y: state.player.position.y },
        { x: state.player.position.x, y: state.player.position.y + 1 },
        { x: state.player.position.x, y: state.player.position.y - 1 },
      ] as Position[]).find(position =>
        isWalkableAt(state, position) &&
        !samePosition(position, enemy.position)
      );
      if (refuge) {
        enemy.bossTarget = refuge;
        events.push(`${enemy.name} reveals a refuge from the coming unmaking.`);
        continue;
      }
    }

    if (enemy.enemyType === 'prism_refractor' && enemy.bossCooldown === 0 && state.pendingShift && state.shiftCountdown === 2) {
      const candidates = state.pendingShift.changes
        .filter(change =>
          change.x >= 0 && change.x < state.floorMap.width &&
          change.y >= 0 && change.y < state.floorMap.height &&
          state.floorMap.visible[change.y][change.x] &&
          isWalkableAt(state, { x: change.x, y: change.y }) &&
          !samePosition(change, state.player.position) &&
          !samePosition(change, enemy.position)
        )
        .sort(
          (a, b) =>
            manhattan(a, state.player.position) - manhattan(b, state.player.position)
        );
      const target = candidates[0];
      if (target) {
        enemy.bossTarget = { x: target.x, y: target.y };
        events.push(`${enemy.name} refracts the coming shift around a glass-marked tile.`);
        continue;
      }
    }

    if (
      enemy.enemyType === 'rift_regent' &&
      enemy.bossCooldown === 0 &&
      state.pendingShift &&
      state.shiftCountdown <= 2 &&
      state.pendingShift.targetGroupId &&
      state.floorMap.tiles[enemy.position.y][enemy.position.x].shiftGroupId ===
        state.pendingShift.targetGroupId
    ) {
      enemy.bossTarget = { ...state.player.position };
      events.push(`${enemy.name} marks your footing as the chamber prepares to shift.`);
      continue;
    }

    if (enemy.enemyType === 'fracture_leech' && !state.pendingShift) continue;
    if (enemy.enemyType === 'glass_moth' && !state.pendingShift) continue;
    if (enemy.enemyType === 'hinge_warden' && state.pendingShift) continue;

    let target = state.player.position;
    let aggroRadius = ENEMY_AGGRO_RADIUS;
    if (enemy.enemyType === 'unmaking_hound') {
      aggroRadius = state.pendingShift?.type === 'localized_collapse' ? Infinity : 7;
    } else if (enemy.enemyType === 'null_scribe') {
      aggroRadius = 5;
      if (state.pendingShift?.type === 'room_slide') {
        target = state.floorMap.exit;
        aggroRadius = Infinity;
      }
    } else if (enemy.enemyType === 'facet_reaver' && state.pendingShift) {
      target = state.floorMap.exit;
      aggroRadius = Infinity;
    } else if (enemy.enemyType === 'ashlock' && state.pendingShift?.blocksExit) {
      target = state.floorMap.exit;
      aggroRadius = Infinity;
    } else if (enemy.enemyType === 'riftbound') {
      target = state.floorMap.exit;
      aggroRadius = Infinity;
    } else if (enemy.enemyType === 'seam_skitter') {
      aggroRadius = state.pendingShift ? 10 : 6;
    } else if (enemy.enemyType === 'fracture_leech') {
      aggroRadius = 12;
    } else if (enemy.enemyType === 'stasis_scorcher') {
      aggroRadius = state.isStasisActive ? 9 : 5;
    } else if (enemy.enemyType === 'glass_moth') {
      aggroRadius = 10;
    } else if (enemy.enemyType === 'pursuer') {
      // It knows where the player is from the moment it arrives. Losing it is a
      // matter of distance and the stairs, never of breaking line of sight.
      aggroRadius = Infinity;
    }
    if (dist > aggroRadius) continue;

    const path = findPath(state.floorMap, enemy.position, target);
    if (!path || path.length < 2) {
      if (enemy.enemyType === 'pursuer') phaseTowardPlayer(state, enemy, events);
      continue;
    }

    const step = path[1];
    if (enemyAt(state, step)) continue;
    if (samePosition(step, state.player.position)) continue;
    if (!isWalkableAt(state, step)) continue;

    enemy.position = { x: step.x, y: step.y };
  }
}

/**
 * The clock-driven region hazards: each fires on a fixed point of the shift
 * countdown, against the tile the player is standing on, and only in its own
 * region — so at most one can ever land on a turn and their order does not
 * matter.
 *
 * Region 3's hazard is deliberately absent. The Glass Expanse sprays shards from
 * the tiles a shift actually changed, so it is keyed on the executed diff and
 * lives in `shiftSystem.ts` rather than on the countdown.
 *
 * Indexed by region so a new region is an entry rather than another `if` block,
 * and so a hazard can be *named*: the roadmap's hazard-immunity armor modifier
 * needs something to key an exemption off, which four inline conditions did not
 * give it.
 *
 * Damage routes through `damagePlayer` like every other source, which is what
 * puts hazards through armor soak, shield absorption, and difficulty scaling.
 */
interface RegionHazard {
  /** The countdown value it strikes on. */
  countdown: number;
  damage: number;
  message: string;
  /** Named as the killer on the death line and in the run log. */
  source: string;
  catches: (state: GameState, tile: GridTile) => boolean;
}

const REGION_HAZARDS: Partial<Record<number, RegionHazard>> = {
  0: {
    countdown: 4,
    damage: 2,
    message: 'A stressed hinge tears at your footing.',
    source: "the Halls' hinge",
    catches: (_state, tile) => tile.type === 'door',
  },
  1: {
    countdown: 2,
    damage: 2,
    message: 'A rift shears open beneath you as the chamber prepares to move.',
    source: "the Deeps' rift",
    catches: (state, tile) =>
      !!state.pendingShift?.targetGroupId &&
      tile.shiftGroupId === state.pendingShift.targetGroupId,
  },
  2: {
    countdown: 4,
    damage: 2,
    message: 'Ash pours through the passage and sears your lungs.',
    source: "the Warrens' ash",
    catches: (_state, tile) => tile.shiftGroupId?.startsWith('corridor') === true,
  },
  4: {
    countdown: 4,
    damage: 2,
    message: 'The Unmaking demands a toll from the stairs.',
    source: "the Unmaking's stair toll",
    catches: (_state, tile) => tile.type === 'stairs_down',
  },
};

/**
 * Pressure tier at which the Pursuer arrives — two, so it lands one step after
 * the ramp starts biting rather than with it. A floor is cleared in 40-90 turns
 * at a normal pace, and `PRESSURE_GRACE_TURNS + 2 * PRESSURE_STEP_TURNS` is 70,
 * so an efficient floor is finished before it appears and a picked-over one is
 * not.
 */
const PURSUER_PRESSURE_TIER = 2;

export const PURSUER_NAME = 'The Long Patience';

/**
 * The visible face of escalating pressure, and there is exactly one of it.
 *
 * Arena floors are exempt. Their stairs stay shut until the guardian falls, and
 * the merchant who arrives afterwards is meant to be read at leisure — billing
 * either wait would punish the player for a delay the game itself imposed.
 * Relying on `floorTurns` freezing is not enough: it freezes only while the
 * guardian lives, and starts running again over the shop.
 */
/**
 * The walkable tile furthest from the player: it comes in from the far end of
 * the floor, which is both the most warning the geometry can give and the only
 * anchor that survives a shift.
 *
 * The entrance would read better and does not work. By the time a floor has been
 * lingered on long enough to summon this, the door the player came in by has
 * often collapsed into wall or chasm — three of the six seeds this was first
 * written against ended with exactly that — and an arrival point that can stop
 * existing is an arrival that silently never happens. Camping the doorway must
 * not be a way to keep the floor to yourself either.
 *
 * Never the player's own tile: an entity standing on them is at distance 0, and
 * the entire hunt is written in terms of distance 1.
 */
function pursuerArrival(state: GameState): Position | null {
  const { width, height } = state.floorMap;
  let arrival: Position | null = null;
  let furthest = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const candidate = { x, y };
      if (samePosition(candidate, state.player.position)) continue;
      if (!isWalkableAt(state, candidate) || enemyAt(state, candidate)) continue;

      const distance = manhattan(candidate, state.player.position);
      if (distance > furthest) {
        furthest = distance;
        arrival = candidate;
      }
    }
  }

  return arrival;
}

function wakePursuer(state: GameState, events: string[]): void {
  if (isRegionEnd(state.floorMap.level)) return;
  if (floorPressure(state.floorTurns) < PURSUER_PRESSURE_TIER) return;
  if (state.entities.some(enemy => enemy.enemyType === 'pursuer')) return;

  const arrival = pursuerArrival(state);
  if (!arrival) return;

  state.entities.push({
    id: `pursuer_${state.floorMap.level}`,
    name: PURSUER_NAME,
    enemyType: 'pursuer',
    position: { x: arrival.x, y: arrival.y },
    hp: PURSUER_TEMPLATE.hp,
    maxHp: PURSUER_TEMPLATE.hp,
    attackPower: PURSUER_TEMPLATE.attackPower + regionForFloor(state.floorMap.level).attackBonus,
    staggeredTurns: 0,
  });
  events.push(`${PURSUER_NAME} steps onto the far side of the floor. It does not hurry.`);
}

/**
 * The true last resort: the exit is sealed and the Pursuer has caught up, with
 * no Rift Shard in hand to answer it. Silently grants one free charge so this
 * specific combination is never unwinnable by loot luck. Self-limiting: it only
 * fires while the player holds zero charges, so it cannot re-grant while still
 * cornered.
 *
 * "Caught up" means it will strike on its next turn: adjacent, standing on real
 * floor, and not stalled. It phases through walls at distance 1 all the time —
 * a silhouette inside the wall next to you has not caught you yet, and granting
 * on that read as the dungeon handing out shards early. Runs after the clock so
 * a shift that just reopened the exit does not also hand over a shard for a
 * seal that no longer exists.
 */
function grantEmergencyRiftShard(state: GameState, events: string[]): void {
  if (state.isGameOver) return;
  const pursuer = state.entities.find(e => e.enemyType === 'pursuer' && e.hp > 0);
  if (!pursuer) return;
  if (manhattan(pursuer.position, state.player.position) !== 1) return;
  if (pursuer.staggeredTurns > 0) return;
  if (!isWalkableAt(state, pursuer.position)) return;

  const held = state.player.inventory
    .filter(i => i.type === 'rift_shard')
    .reduce((sum, i) => sum + (i.count ?? 1), 0);
  if (held > 0) return;

  if (hasValidPath(state.floorMap, state.player.position, state.floorMap.exit)) return;

  addToInventory(state, createItem('rift_shard', `rift_shard_emergency_${state.turnCount}`));
  events.push('The dungeon offers you one way out.');
}

/**
 * Advance the world clock by one turn: expire buffs, tick the shift countdown,
 * telegraph an imminent shift, and execute a shift when the countdown expires.
 */
function advanceClock(state: GameState, rng: SeededRNG, events: string[]): void {
  state.turnCount++;
  // Escalating pressure is a tax on lingering, and lingering has to be a choice.
  // While a region guardian lives the stairs refuse to open, so the player cannot
  // leave however efficiently they play — the floor clock holds until the arena is
  // won. After it is won the floor is stabilized and stops shifting entirely, so
  // the counter keeps running here only for the ordinary floors it actually bills.
  if (!state.entities.some(enemy => enemy.isBoss && enemy.hp > 0)) state.floorTurns++;
  wakePursuer(state, events);

  const { player } = state;
  if (player.shieldTurnsRemaining > 0) {
    player.shieldTurnsRemaining--;
    if (player.shieldTurnsRemaining === 0) {
      player.shieldHp = 0;
      events.push('Fallout Shield fades.');
    }
  }
  if (state.abilityCooldown > 0) state.abilityCooldown--;

  if (state.isStasisActive) {
    state.stasisTurnsRemaining--;
    if (state.stasisTurnsRemaining <= 0) {
      state.isStasisActive = false;
      events.push('The Stasis Flask wears off. The dungeon stirs again.');
    }
    return;
  }

  // A cleared floor holds still: the countdown stops here, before the telegraph
  // and hazard blocks below, so the one choke point covers all three. A shift
  // already rehearsed when the guardian fell is dropped rather than left painted
  // on the map — same reason the Hourglass Shard branch below drops one.
  if (isFloorStabilized(state)) {
    if (state.pendingShift) {
      state.pendingShift = null;
      clearTelegraphs(state.floorMap);
    }
    return;
  }

  state.shiftCountdown--;

  const hazard = REGION_HAZARDS[regionForFloor(state.floorMap.level).index];
  if (
    hazard &&
    state.shiftCountdown === hazard.countdown &&
    state.player.hp > 0 &&
    hazard.catches(state, state.floorMap.tiles[state.player.position.y][state.player.position.x])
  ) {
    events.push(hazard.message);
    damagePlayer(state, hazard.damage, events, hazard.source);
  }

  if (state.shiftCountdown <= 0) {
    events.push(...executeShift(state, rng));
    state.shiftCountdown = shiftInterval(state);
  } else if (state.shiftCountdown <= TELEGRAPH_COUNTDOWN) {
    const hadPlan = state.pendingShift !== null;
    applyTelegraphs(state, rng);
    if (state.shiftCountdown === TELEGRAPH_COUNTDOWN && !hadPlan && state.pendingShift) {
      events.push(describePendingShift(state.pendingShift));
    }
  } else if (state.pendingShift) {
    // An Hourglass Shard can push the countdown back out of telegraph range,
    // which used to leave the warning tiles painted on the map for turns after
    // the threat had been postponed. Drop the plan so it is re-rehearsed against
    // whatever the geometry looks like when the countdown comes back around.
    state.pendingShift = null;
    clearTelegraphs(state.floorMap);
  }
}

/**
 * `SeededRNG.fromSerialized` rebuilds a generator by replaying every call it has
 * ever made, so reconstructing one per action costs more the longer the run gets.
 * Holding the live generator per state object keeps that cost flat while leaving
 * `rngState` the single source of truth: if it ever disagrees with the cached
 * generator (a rewind, a test reaching in), the replay path still runs.
 */
const liveRng = new WeakMap<GameState, SeededRNG>();

function rngFor(state: GameState): SeededRNG {
  const cached = liveRng.get(state);
  if (
    cached &&
    cached.getSeed() === state.rngState.seed &&
    cached.getCallCount() === state.rngState.callCount
  ) {
    return cached;
  }
  const fresh = SeededRNG.fromSerialized(state.rngState);
  liveRng.set(state, fresh);
  return fresh;
}

/**
 * Resolve one player action and, if it consumed a turn, the world's response.
 * Mutates and returns `state` — the caller owns the single game state object.
 */
export function dispatchAction(state: GameState, action: GameAction): DispatchResult {
  const events: string[] = [];

  if (state.isGameOver) {
    return { state, events };
  }

  // Last turn's splash is spent. Cleared here rather than by the HUD so the flag
  // means "gained this dispatch" for every caller, tests included.
  state.lastLevelUp = null;
  state.lastBossDefeat = null;
  state.armorReactions = [];
  state.shopOpened = false;
  state.lastKillPosition = null;
  state.lastPickupName = null;
  state.lastPickupPosition = null;

  const rng = rngFor(state);
  let changedFloor = false;
  // An action that could not happen at all costs the player nothing.
  let spentTurn = true;

  switch (action.type) {
    case 'MOVE':
      spentTurn = playerMove(state, rng, action.dx, action.dy, events);
      break;
    case 'WAIT':
      events.push('You hold position.');
      break;
    case 'ABILITY':
      spentTurn = useAbility(state, events);
      break;
    case 'USE_ITEM': {
      const hasItem = state.player.inventory.some(i => i.id === action.itemId);
      events.push(...useItem(state, action.itemId, rng));
      spentTurn = hasItem;
      break;
    }
    case 'DESCEND': {
      const before = state.floorMap.level;
      awardBossDefeats(state, rng, events);
      spentTurn = descend(state, rng, events);
      // A successful descent replaces the world; the old floor gets no response turn.
      changedFloor = state.floorMap.level !== before;
      break;
    }
    case 'EQUIP_ARMOR':
      equipOfferedArmor(state, events);
      break;
    case 'DECLINE_ARMOR': {
      const declined = state.pendingArmorOffer;
      state.pendingArmorOffer = null;
      // Dismissing the card routes here too, so a backdrop tap is a real "no"
      // and sticks exactly like the Keep Mine button.
      if (declined && !state.declinedArmorIds.includes(declined.id)) {
        state.declinedArmorIds.push(declined.id);
      }
      break;
    }
    case 'PICK_UP_ARMOR': {
      const underfoot = declinedArmorUnderfoot(state);
      if (underfoot) state.pendingArmorOffer = underfoot;
      break;
    }
    case 'BUY_ITEM':
      buyFromShop(state, action.offerId, events);
      break;
    case 'EQUIP_WEAPON':
      equipOfferedWeapon(state, events);
      break;
    case 'DECLINE_WEAPON': {
      const declined = state.pendingWeaponOffer;
      state.pendingWeaponOffer = null;
      if (declined && !state.declinedWeaponIds.includes(declined.id)) {
        state.declinedWeaponIds.push(declined.id);
      }
      break;
    }
    case 'PICK_UP_WEAPON': {
      const underfoot = declinedWeaponUnderfoot(state);
      if (underfoot) state.pendingWeaponOffer = underfoot;
      break;
    }
    case 'TOGGLE_WEAPON':
      state.player.weaponActive = !state.player.weaponActive;
      break;
    case 'INSPECT_TILE': {
      const { x, y } = action;
      const inBounds = x >= 0 && x < state.floorMap.width && y >= 0 && y < state.floorMap.height;
      events.push(inBounds ? `Tile (${x}, ${y}): ${state.floorMap.tiles[y][x].type}` : 'Nothing there.');
      break;
    }
  }

  if (consumesTurn(action) && spentTurn && !state.isGameOver && !changedFloor) {
    // Bodies are settled either side of the world's response: the player may have
    // just felled the guardian, and thorns or a hazard may fell one during it.
    // Order is load-bearing — `awardBossDefeats` looks for a dead boss still on
    // the floor, so it has to run before the corpses are swept.
    settleDeaths(state, rng, events);
    enemyTurns(state, rng, events);
    advanceClock(state, rng, events);
    settleDeaths(state, rng, events);
    grantEmergencyRiftShard(state, events);
  }

  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.isGameOver = true;
    state.isVictory = false;
    const source = state.lastDamageSource ?? 'the dungeon';
    events.push(
      source === 'the dungeon' || source === 'the shift'
        ? `You are consumed by ${source}. Run over.`
        : `${source} finishes you off. Run over.`
    );
  }

  computeFOV(state.floorMap, state.player.position);
  state.rngState = rng.serialize();

  for (const text of events) {
    log(state, text, classify(text));
  }

  return { state, events };
}
