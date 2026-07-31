import { Enemy, GameState, LogMessage, Position } from './state';
import { SeededRNG } from './rng';
import { damagePlayer } from './damage';
import {
  applyTelegraphs,
  clearTelegraphs,
  describePendingShift,
  executeShift,
} from './shift/shiftSystem';
import { useItem } from './items/itemEffects';
import { computeFOV } from './map/fow';
import { findPath } from './map/pathfinding';
import { buildFloor } from './game';

export type GameAction =
  | { type: 'MOVE'; dx: number; dy: number }
  | { type: 'WAIT' }
  | { type: 'USE_ITEM'; itemId: string }
  | { type: 'ABILITY' }
  | { type: 'DESCEND' }
  | { type: 'EQUIP_ARMOR' }
  | { type: 'DECLINE_ARMOR' }
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
    action.type !== 'DECLINE_ARMOR'
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
      events.push(`${target.name} is destroyed.`);
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

  if (!isWalkableAt(state, target)) {
    events.push('The way is blocked.');
    return false;
  }

  state.player.position = target;

  const drops = state.floorMap.drops;
  if (drops) {
    const index = drops.findIndex(d => d.position.x === target.x && d.position.y === target.y);
    if (index !== -1) {
      const drop = drops[index];
      if (drop.item.category === 'armor' && state.player.armor) {
        // Leave it on the floor and ask. The swap is destructive — the piece
        // being replaced falls here — so it is not something to do silently.
        state.pendingArmorOffer = drop.item;
        events.push(`A ${drop.item.name} lies here.`);
      } else if (drop.item.category === 'armor') {
        drops.splice(index, 1);
        state.player.armor = drop.item;
        events.push(`You strap on the ${drop.item.name}.`);
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
  if (previous) {
    drops.push({ item: previous, position: { ...player.position } });
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

function enemyTurns(state: GameState, rng: SeededRNG, events: string[]): void {
  for (const enemy of state.entities) {
    if (enemy.hp <= 0) continue;

    if (enemy.staggeredTurns > 0) {
      enemy.staggeredTurns--;
      continue;
    }

    const dist =
      Math.abs(enemy.position.x - state.player.position.x) +
      Math.abs(enemy.position.y - state.player.position.y);

    if (dist === 1) {
      attack(state, rng, enemy.name, enemy.attackPower, null, events);
      continue;
    }

    if (enemy.enemyType === 'fracture_leech' && !state.pendingShift) continue;
    if (enemy.enemyType === 'hinge_warden' && state.pendingShift) continue;

    let target = state.player.position;
    let aggroRadius = ENEMY_AGGRO_RADIUS;
    if (enemy.enemyType === 'ashlock' && state.pendingShift?.blocksExit) {
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

  state.shiftCountdown--;

  if (state.shiftCountdown <= 0) {
    events.push(...executeShift(state, rng));
    state.shiftCountdown = state.nextShiftCountdownMax;
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
      spentTurn = descend(state, rng, events);
      // A successful descent replaces the world; the old floor gets no response turn.
      changedFloor = state.floorMap.level !== before;
      break;
    }
    case 'EQUIP_ARMOR':
      equipOfferedArmor(state, events);
      break;
    case 'DECLINE_ARMOR':
      state.pendingArmorOffer = null;
      break;
    case 'INSPECT_TILE': {
      const { x, y } = action;
      const inBounds = x >= 0 && x < state.floorMap.width && y >= 0 && y < state.floorMap.height;
      events.push(inBounds ? `Tile (${x}, ${y}): ${state.floorMap.tiles[y][x].type}` : 'Nothing there.');
      break;
    }
  }

  if (consumesTurn(action) && spentTurn && !state.isGameOver && !changedFloor) {
    state.entities = state.entities.filter(e => e.hp > 0);
    enemyTurns(state, rng, events);
    advanceClock(state, rng, events);
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
