import { Enemy, GameState, Item, ItemDrop, LogMessage, Position } from './state';
import { SeededRNG } from './rng';
import { damagePlayer } from './damage';
import {
  applyTelegraphs,
  clearTelegraphs,
  describePendingShift,
  executeShift,
  isFloorStabilized,
  shiftInterval,
} from './shift/shiftSystem';
import { useItem } from './items/itemEffects';
import { computeFOV } from './map/fow';
import { findPath } from './map/pathfinding';
import {
  buildFloor,
  coinsPerKill,
  createItem,
  pickSpawnPosition,
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
  | { type: 'INSPECT_TILE'; x: number; y: number };

export interface DispatchResult {
  state: GameState;
  events: string[];
}

/** Fallout Shield: base absorb is 25% of max HP, +50% when a shift is imminent. */
const SHIELD_BASE_FRACTION = 0.25;
const SHIELD_DURATION = 3;
const ABILITY_COOLDOWN = 6;
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
  return state.entities.find(e => e.hp > 0 && e.position.x === pos.x && e.position.y === pos.y);
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

function attack(
  state: GameState,
  rng: SeededRNG,
  attackerName: string,
  attackPower: number,
  target: Enemy | null,
  events: string[]
): void {
  const damage = attackPower + rng.randomInt(-2, 2);
  const dealt = Math.max(1, damage);

  if (target) {
    target.hp = Math.max(0, target.hp - dealt);
    events.push(`${attackerName} hits ${target.name} for ${dealt} damage.`);
    if (target.hp <= 0) {
      // Only the player ever has an enemy as a target, so a kill here is always
      // theirs. Paid straight to the purse rather than dropped: a coin pile the
      // next shift buries would tax the player for fighting where the geometry
      // was about to move.
      const regionIndex = regionForFloor(state.floorMap.level).index;
      const bounty = coinsPerKill(regionIndex, target.isBoss === true);
      const xp = xpPerKill(target.enemyType, regionIndex);
      state.player.coins += bounty;
      // XP is named before coins so the run log's coin regex, which anchors on the
      // trailing "coins.", keeps matching this line.
      events.push(`${target.name} is destroyed. You gain ${xp} XP and collect ${bounty} coins.`);
      grantXp(state, xp, events);
    }
  } else {
    events.push(`${attackerName} strikes you.`);
    damagePlayer(state, dealt, events, attackerName);
  }
}

/** Returns whether the action actually happened (a blocked bump is free). */
function playerMove(state: GameState, rng: SeededRNG, dx: number, dy: number, events: string[]): boolean {
  const target = { x: state.player.position.x + dx, y: state.player.position.y + dy };
  const occupant = enemyAt(state, target);

  if (occupant) {
    attack(state, rng, 'You', state.player.attackPower, occupant, events);
    return true;
  }

  const { shop } = state;
  if (shop && shop.position.x === target.x && shop.position.y === target.y) {
    // Bumping the merchant trades instead of stepping onto them, the same shape
    // as bumping an enemy attacks. Free, like BUY_ITEM itself: the floor is
    // stabilized by the time a merchant exists, so there is no clock to dodge —
    // and charging a turn for opening a price list, when reading it is free,
    // would only tax the player for closing the modal by accident.
    state.shopOpened = true;
    events.push(`${shop.merchant} spreads out their wares.`);
    return false;
  }

  if (!isWalkableAt(state, target)) {
    events.push('The way is blocked.');
    return false;
  }

  state.player.position = target;

  const drops = state.floorMap.drops;
  if (drops) {
    const here = (d: ItemDrop): boolean => d.position.x === target.x && d.position.y === target.y;
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
      } else if (drop.item.category === 'currency') {
        // Currency never enters the inventory — it is a number on the player, so
        // it cannot be "used", dropped, or take up a hotbar slot.
        drops.splice(index, 1);
        state.player.coins += drop.item.value ?? 0;
        events.push(`You pocket ${drop.item.value ?? 0} coins.`);
      } else {
        drops.splice(index, 1);
        state.player.inventory.push(drop.item);
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
  if (state.isGameOver || state.pendingArmorOffer) return null;
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

  const imminent = state.shiftCountdown <= 2;
  const fraction = imminent ? SHIELD_BASE_FRACTION * 1.5 : SHIELD_BASE_FRACTION;
  player.shieldHp = Math.round(player.maxHp * fraction);
  player.shieldTurnsRemaining = SHIELD_DURATION;
  state.abilityCooldown = ABILITY_COOLDOWN;

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
  state.player.inventory.push(result.item);
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
  state.player.inventory.push(reward);
  state.lastBossDefeat = {
    floor: state.floorMap.level,
    regionName: region.name,
    bossName: defeatedBosses[0].name,
  };
  events.push(`${defeatedBosses[0].name} falls. ${region.name} is cleared; you claim a ${reward.name}.`);
  events.push(`${state.shop.merchant} sets up a stall in the quiet arena. Walk into them to trade.`);
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

    const dist =
      Math.abs(enemy.position.x - state.player.position.x) +
      Math.abs(enemy.position.y - state.player.position.y);

    if (dist === 1) {
      attack(state, rng, enemy.name, enemy.attackPower, null, events);
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

    if (enemy.enemyType === 'rift_regent' && enemy.bossTarget) {
      const marked =
        enemy.bossTarget.x === state.player.position.x &&
        enemy.bossTarget.y === state.player.position.y;
      if (marked) {
        damagePlayer(state, 6, events, enemy.name);
        events.push(`${enemy.name} tears open the marked rift beneath you.`);
      } else {
        events.push(`${enemy.name}'s marked rift collapses harmlessly.`);
      }
      enemy.bossTarget = undefined;
      enemy.bossCooldown = 4;
      continue;
    }

    if (enemy.enemyType === 'cinder_gatekeeper' && enemy.bossTarget) {
      const radius =
        Math.abs(state.player.position.x - enemy.bossTarget.x) +
        Math.abs(state.player.position.y - enemy.bossTarget.y);
      if (radius <= 2) {
        damagePlayer(state, 5, events, enemy.name);
        events.push(`${enemy.name} seals the exit in a choking ash cloud.`);
      } else {
        events.push(`${enemy.name}'s ash interdict disperses harmlessly.`);
      }
      enemy.bossTarget = undefined;
      enemy.bossCooldown = 4;
      continue;
    }

    if (enemy.enemyType === 'cinder_gatekeeper' && enemy.bossCooldown === 0 && state.isStasisActive) {
      enemy.bossTarget = { ...state.floorMap.exit };
      events.push(`${enemy.name} marks the exit with an ash interdict.`);
      continue;
    }

    if (enemy.enemyType === 'prism_refractor' && enemy.bossTarget) {
      const marked =
        enemy.bossTarget.x === state.player.position.x &&
        enemy.bossTarget.y === state.player.position.y;
      if (marked) {
        damagePlayer(state, 6, events, enemy.name);
        events.push(`${enemy.name} fractures the marked tile into a spray of glass.`);
      } else {
        events.push(`${enemy.name}'s refracted fault misses as you move.`);
      }
      enemy.bossTarget = undefined;
      enemy.bossCooldown = 4;
      continue;
    }

    if (enemy.enemyType === 'null_testament' && enemy.bossTarget) {
      const sheltered =
        enemy.bossTarget.x === state.player.position.x &&
        enemy.bossTarget.y === state.player.position.y;
      if (sheltered) {
        events.push(`${enemy.name} watches as you shelter in the marked refuge.`);
      } else {
        damagePlayer(state, 7, events, enemy.name);
        events.push(`${enemy.name} erases everything beyond the marked refuge.`);
      }
      enemy.bossTarget = undefined;
      enemy.bossCooldown = 4;
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
        !(position.x === enemy.position.x && position.y === enemy.position.y)
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
          !(change.x === state.player.position.x && change.y === state.player.position.y) &&
          !(change.x === enemy.position.x && change.y === enemy.position.y)
        )
        .sort((a, b) =>
          Math.abs(a.x - state.player.position.x) + Math.abs(a.y - state.player.position.y) -
          (Math.abs(b.x - state.player.position.x) + Math.abs(b.y - state.player.position.y))
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
    }
    if (dist > aggroRadius) continue;

    const path = findPath(state.floorMap, enemy.position, target);
    if (!path || path.length < 2) continue;

    const step = path[1];
    if (enemyAt(state, step)) continue;
    if (step.x === state.player.position.x && step.y === state.player.position.y) continue;
    if (!isWalkableAt(state, step)) continue;

    enemy.position = { x: step.x, y: step.y };
  }
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

  const currentTile = state.floorMap.tiles[state.player.position.y][state.player.position.x];
  if (
    state.shiftCountdown === 2 &&
    regionForFloor(state.floorMap.level).index === 1 &&
    state.pendingShift?.targetGroupId &&
    currentTile.shiftGroupId === state.pendingShift.targetGroupId
  ) {
    events.push('A rift shears open beneath you as the chamber prepares to move.');
    damagePlayer(state, 2, events, "the Deeps' rift");
  }

  if (
    state.shiftCountdown === 4 &&
    regionForFloor(state.floorMap.level).index === 2 &&
    currentTile.shiftGroupId?.startsWith('corridor')
  ) {
    events.push('Ash pours through the passage and sears your lungs.');
    damagePlayer(state, 2, events, "the Warrens' ash");
  }

  if (
    state.shiftCountdown === 4 &&
    regionForFloor(state.floorMap.level).index === 4 &&
    currentTile.type === 'stairs_down' &&
    state.player.hp > 0
  ) {
    events.push('The Unmaking demands a toll from the stairs.');
    damagePlayer(state, 2, events, "the Unmaking's stair toll");
  }

  if (
    state.shiftCountdown === 4 &&
    regionForFloor(state.floorMap.level).index === 0 &&
    currentTile.type === 'door'
  ) {
    events.push('A stressed hinge tears at your footing.');
    damagePlayer(state, 2, events, "the Halls' hinge");
  }

  if (state.shiftCountdown <= 0) {
    events.push(...executeShift(state, rng));
    state.shiftCountdown = shiftInterval(state);
  } else if (state.shiftCountdown <= 2) {
    const hadPlan = state.pendingShift !== null;
    applyTelegraphs(state, rng);
    if (state.shiftCountdown === 2 && !hadPlan && state.pendingShift) {
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
  state.shopOpened = false;

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
    case 'INSPECT_TILE': {
      const { x, y } = action;
      const inBounds = x >= 0 && x < state.floorMap.width && y >= 0 && y < state.floorMap.height;
      events.push(inBounds ? `Tile (${x}, ${y}): ${state.floorMap.tiles[y][x].type}` : 'Nothing there.');
      break;
    }
  }

  if (consumesTurn(action) && spentTurn && !state.isGameOver && !changedFloor) {
    awardBossDefeats(state, rng, events);
    state.entities = state.entities.filter(e => e.hp > 0);
    enemyTurns(state, rng, events);
    advanceClock(state, rng, events);
    awardBossDefeats(state, rng, events);
    state.entities = state.entities.filter(e => e.hp > 0);
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
