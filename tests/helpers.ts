import { GameState, Player, Enemy, EnemyType } from '../src/core/state';
import { SeededRNG } from '../src/core/rng';
import { generateFloor } from '../src/core/map/generator';
import { createRunConfig } from '../src/core/runConfig';

/**
 * Create a minimal mock GameState for testing.
 * Uses a real generated floor map for realistic shift testing.
 */
export function createMockGameState(seed = 'test-seed-42'): GameState {
  const rng = new SeededRNG(seed);
  const floorMap = generateFloor(rng, 1);

  const player: Player = {
    id: 'player',
    name: 'Vanguard',
    classType: 'vanguard',
    position: { x: floorMap.entrance.x, y: floorMap.entrance.y },
    hp: 100,
    maxHp: 100,
    attackPower: 10,
    shieldHp: 0,
    shieldTurnsRemaining: 0,
    armor: null,
    coins: 0,
    level: 1,
    xp: 0,
    inventory: [
      {
        id: 'stasis_1',
        type: 'stasis_flask',
        name: 'Stasis Flask',
        description: 'Pauses shift countdown for 6 turns.',
        category: 'stabilization',
      },
      {
        id: 'hourglass_1',
        type: 'hourglass_shard',
        name: 'Hourglass Shard',
        description: 'Adds 3 turns to the shift countdown.',
        category: 'stabilization',
      },
      {
        id: 'haste_1',
        type: 'haste_sigil',
        name: 'Haste Sigil',
        description: 'Force the next shift immediately. Enemies on collapsing tiles take fallout and are staggered.',
        category: 'destabilization',
      },
      {
        id: 'rewind_1',
        type: 'rewind_scroll',
        name: 'Rewind Scroll',
        description: 'Restore map geometry from before the last shift.',
        category: 'stabilization',
      },
      {
        id: 'health_1',
        type: 'health_potion',
        name: 'Health Potion',
        description: 'Restores 30 HP.',
        category: 'consumable',
      },
    ],
  };

  return {
    seed,
    config: createRunConfig('short', 'standard'),
    rngState: rng.serialize(),
    turnCount: 0,
    floorTurns: 0,
    shiftCountdown: 8,
    nextShiftCountdownMax: 8,
    isStasisActive: false,
    stasisTurnsRemaining: 0,
    abilityCooldown: 0,
    player,
    entities: [],
    floorMap,
    preShiftSnapshot: null,
    pendingShift: null,
    pendingArmorOffer: null,
    lastLevelUp: null,
    lastBossDefeat: null,
    lastShiftChanges: [],
    lastShiftTurn: -999,
    lastShiftType: null,
    exitBlockedStreak: 0,
    lastDamageSource: null,
    clearedRegions: [],
    shop: null,
    shopOpened: false,
    eventLog: [],
    isGameOver: false,
    isVictory: false,
  };
}

/**
 * Create a mock enemy at a given position.
 */
export function createMockEnemy(
  position: { x: number; y: number },
  type: EnemyType = 'crawler'
): Enemy {
  return {
    id: `enemy_${position.x}_${position.y}`,
    name: type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '),
    position: { x: position.x, y: position.y },
    hp: 30,
    maxHp: 30,
    attackPower: 5,
    enemyType: type,
    staggeredTurns: 0,
  };
}
