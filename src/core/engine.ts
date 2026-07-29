import { Enemy, GameState, LogMessage, Position } from './state';
import { SeededRNG } from './rng';
import { applyTelegraphs, executeShift } from './shift/shiftSystem';
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
  | { type: 'INSPECT_TILE'; x: number; y: number };

export interface DispatchResult {
  state: GameState;
  events: string[];
}

/** Floor the player must clear to win the MVP run. */
export const FINAL_FLOOR = 5;

/** Fallout Shield: base absorb is 25% of max HP, +50% when a shift is imminent. */
const SHIELD_BASE_FRACTION = 0.25;
const SHIELD_DURATION = 3;
const ABILITY_COOLDOWN = 6;
const ENEMY_AGGRO_RADIUS = 8;

/** Actions that advance the world clock. Everything else is free. */
function consumesTurn(action: GameAction): boolean {
  return action.type !== 'INSPECT_TILE';
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
  if (lower.includes('shift') || lower.includes('corridor') || lower.includes('collapse')) {
    return 'shift';
  }
  if (lower.includes('hit') || lower.includes('strike') || lower.includes('damage')) {
    return 'combat';
  }
  return 'info';
}

/**
 * Damage the player, spending Fallout Shield HP first.
 */
export function damagePlayer(state: GameState, amount: number, events: string[]): void {
  let remaining = amount;
  const { player } = state;

  if (player.shieldHp > 0) {
    const absorbed = Math.min(player.shieldHp, remaining);
    player.shieldHp -= absorbed;
    remaining -= absorbed;
    events.push(`Fallout Shield absorbs ${absorbed} damage.`);
  }

  if (remaining > 0) {
    player.hp = Math.max(0, player.hp - remaining);
    events.push(`You take ${remaining} damage.`);
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
      events.push(`${target.name} is destroyed.`);
    }
  } else {
    damagePlayer(state, dealt, events);
  }
}

function playerMove(state: GameState, rng: SeededRNG, dx: number, dy: number, events: string[]): void {
  const target = { x: state.player.position.x + dx, y: state.player.position.y + dy };
  const occupant = enemyAt(state, target);

  if (occupant) {
    attack(state, rng, 'You', state.player.attackPower, occupant, events);
    return;
  }

  if (!isWalkableAt(state, target)) {
    events.push('The way is blocked.');
    return;
  }

  state.player.position = target;

  const drops = state.floorMap.drops;
  if (drops) {
    const index = drops.findIndex(d => d.position.x === target.x && d.position.y === target.y);
    if (index !== -1) {
      const [drop] = drops.splice(index, 1);
      state.player.inventory.push(drop.item);
      events.push(`You pick up a ${drop.item.name}.`);
    }
  }

  const tile = state.floorMap.tiles[target.y][target.x];
  if (tile.type === 'stairs_down') {
    events.push('Stairs descend into the dark here. Take them to go deeper.');
  }
}

/**
 * Vanguard Fallout Shield: temporary damage absorption, stronger when a shift
 * is about to land (within 2 turns), per the class fantasy of bracing for impact.
 */
function useAbility(state: GameState, events: string[]): void {
  const { player } = state;

  if (player.shieldTurnsRemaining > 0) {
    events.push('Fallout Shield is already active.');
    return;
  }
  if (state.abilityCooldown > 0) {
    events.push(`Fallout Shield is recharging (${state.abilityCooldown} turns).`);
    return;
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
}

function descend(state: GameState, rng: SeededRNG, events: string[]): void {
  const { player, floorMap } = state;
  const tile = floorMap.tiles[player.position.y][player.position.x];

  if (tile.type !== 'stairs_down') {
    events.push('There are no stairs here.');
    return;
  }

  if (floorMap.level >= FINAL_FLOOR) {
    state.isVictory = true;
    state.isGameOver = true;
    events.push('You climb out of the shifting dark. You survived the Wandering Dungeon.');
    return;
  }

  events.push(`You descend to floor ${floorMap.level + 1}.`);
  buildFloor(state, rng, floorMap.level + 1);
}

function enemyTurns(state: GameState, rng: SeededRNG, events: string[]): void {
  for (const enemy of state.entities) {
    if (enemy.hp <= 0) continue;

    if (enemy.staggeredTurns && enemy.staggeredTurns > 0) {
      enemy.staggeredTurns--;
      if (enemy.staggeredTurns === 0) {
        enemy.isStaggered = false;
      }
      continue;
    }

    const dist =
      Math.abs(enemy.position.x - state.player.position.x) +
      Math.abs(enemy.position.y - state.player.position.y);

    if (dist === 1) {
      attack(state, rng, enemy.name, enemy.attackPower, null, events);
      continue;
    }
    if (dist > ENEMY_AGGRO_RADIUS) continue;

    const path = findPath(state.floorMap, enemy.position, state.player.position);
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
    applyTelegraphs(state, rng);
    if (state.shiftCountdown === 2) {
      events.push('Reality trembles. A shift is coming.');
    }
  }
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

  const rng = SeededRNG.fromSerialized(state.rngState);
  let changedFloor = false;

  switch (action.type) {
    case 'MOVE':
      playerMove(state, rng, action.dx, action.dy, events);
      break;
    case 'WAIT':
      events.push('You hold position.');
      break;
    case 'ABILITY':
      useAbility(state, events);
      break;
    case 'USE_ITEM':
      events.push(...useItem(state, action.itemId, rng));
      break;
    case 'DESCEND': {
      const before = state.floorMap.level;
      descend(state, rng, events);
      // A successful descent replaces the world; the old floor gets no response turn.
      changedFloor = state.floorMap.level !== before;
      break;
    }
    case 'INSPECT_TILE': {
      const { x, y } = action;
      const inBounds = x >= 0 && x < state.floorMap.width && y >= 0 && y < state.floorMap.height;
      events.push(inBounds ? `Tile (${x}, ${y}): ${state.floorMap.tiles[y][x].type}` : 'Nothing there.');
      break;
    }
  }

  if (consumesTurn(action) && !state.isGameOver && !changedFloor) {
    state.entities = state.entities.filter(e => e.hp > 0);
    enemyTurns(state, rng, events);
    advanceClock(state, rng, events);
    state.entities = state.entities.filter(e => e.hp > 0);
  }

  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.isGameOver = true;
    state.isVictory = false;
    events.push('The dungeon claims you. Run over.');
  }

  computeFOV(state.floorMap, state.player.position);
  state.rngState = rng.serialize();

  for (const text of events) {
    log(state, text, classify(text));
  }

  return { state, events };
}
