import { describe, it, expect } from 'vitest';
import {
  ATTACK_PER_LEVEL,
  declinedArmorUnderfoot,
  dispatchAction,
  grantXp,
  HP_PER_LEVEL,
} from '../src/core/engine';
import { damagePlayer } from '../src/core/damage';
import { EnemyType, GameState, Item, Position } from '../src/core/state';
import {
  buildFloor,
  coinsPerPile,
  coinsPerKill,
  createCoinCache,
  createItem,
  createNewGame,
  xpPerKill,
  xpToNextLevel,
} from '../src/core/game';
import { priceFor, rollShopStock } from '../src/core/shop';
import { FLOORS_PER_REGION, Region, REGIONS } from '../src/core/regions';
import { SeededRNG } from '../src/core/rng';
import { createRunConfig, RUN_LENGTHS } from '../src/core/runConfig';
import { findPath } from '../src/core/map/pathfinding';
import { createMockGameState, createMockEnemy, walkableStep } from './helpers';

function enemyAtDistance(state: ReturnType<typeof createMockGameState>, distance: number) {
  const { player, floorMap } = state;
  for (let y = 0; y < floorMap.height; y++) {
    for (let x = 0; x < floorMap.width; x++) {
      const tile = floorMap.tiles[y][x].type;
      const position = { x, y };
      const manhattan = Math.abs(x - player.position.x) + Math.abs(y - player.position.y);
      if (
        manhattan === distance &&
        (tile === 'floor' || tile === 'door') &&
        findPath(floorMap, position, player.position)?.length
      ) {
        return position;
      }
    }
  }
  throw new Error(`no walkable tile at distance ${distance}`);
}

function pendingShift(
  type: 'room_slide' | 'corridor_reconnect' | 'localized_collapse' = 'room_slide',
  blocksExit = false
) {
  return {
    type,
    targetGroupId: null,
    changes: [],
    groupMoves: {},
    blocksExit,
  };
}

function enemyWithExitPath(state: ReturnType<typeof createMockGameState>) {
  const { player, floorMap } = state;
  for (let y = 0; y < floorMap.height; y++) {
    for (let x = 0; x < floorMap.width; x++) {
      const position = { x, y };
      const tile = floorMap.tiles[y][x].type;
      const path = findPath(floorMap, position, floorMap.exit);
      const distanceToPlayer = Math.abs(x - player.position.x) + Math.abs(y - player.position.y);
      if ((tile === 'floor' || tile === 'door') && distanceToPlayer > 1 && path && path.length > 1) {
        return position;
      }
    }
  }
  throw new Error('no walkable tile with a route to the exit');
}

function enemyWithDivergingPaths(state: ReturnType<typeof createMockGameState>) {
  const { player, floorMap } = state;
  for (let y = 0; y < floorMap.height; y++) {
    for (let x = 0; x < floorMap.width; x++) {
      const position = { x, y };
      const tile = floorMap.tiles[y][x].type;
      const playerPath = findPath(floorMap, position, player.position);
      const exitPath = findPath(floorMap, position, floorMap.exit);
      const distanceToPlayer = Math.abs(x - player.position.x) + Math.abs(y - player.position.y);
      if (
        (tile === 'floor' || tile === 'door') &&
        distanceToPlayer > 1 &&
        distanceToPlayer <= 8 &&
        playerPath &&
        playerPath.length > 1 &&
        exitPath &&
        exitPath.length > 1 &&
        (playerPath[1].x !== exitPath[1].x || playerPath[1].y !== exitPath[1].y)
      ) {
        return { position, playerStep: playerPath[1], exitStep: exitPath[1] };
      }
    }
  }
  throw new Error('no tile with diverging player and exit paths');
}

function doorPosition(state: ReturnType<typeof createMockGameState>) {
  for (let y = 0; y < state.floorMap.height; y++) {
    for (let x = 0; x < state.floorMap.width; x++) {
      if (state.floorMap.tiles[y][x].type === 'door') return { x, y };
    }
  }
  throw new Error('generated floor has no door');
}

function shiftGroupTile(state: ReturnType<typeof createMockGameState>) {
  for (let y = 0; y < state.floorMap.height; y++) {
    for (let x = 0; x < state.floorMap.width; x++) {
      const groupId = state.floorMap.tiles[y][x].shiftGroupId;
      if (groupId) return { position: { x, y }, groupId };
    }
  }
  throw new Error('generated floor has no shift group tile');
}

function tileWithGroupPrefix(
  state: ReturnType<typeof createMockGameState>,
  prefix: string,
  type: 'floor' | 'door' = 'floor'
) {
  for (let y = 0; y < state.floorMap.height; y++) {
    for (let x = 0; x < state.floorMap.width; x++) {
      const tile = state.floorMap.tiles[y][x];
      if (tile.type === type && tile.shiftGroupId?.startsWith(prefix)) return { x, y };
    }
  }
  throw new Error(`generated floor has no ${prefix} ${type} tile`);
}

function stairsPosition(state: ReturnType<typeof createMockGameState>) {
  for (let y = 0; y < state.floorMap.height; y++) {
    for (let x = 0; x < state.floorMap.width; x++) {
      if (state.floorMap.tiles[y][x].type === 'stairs_down') return { x, y };
    }
  }
  throw new Error('generated floor has no stairs');
}

describe('Turn Engine & Items', () => {
  it('decrements shift countdown on turn-consuming actions, not non-turn actions', () => {
    const state = createMockGameState();
    const initialCountdown = state.shiftCountdown;

    dispatchAction(state, { type: 'INSPECT_TILE', x: 2, y: 2 });
    expect(state.shiftCountdown).toBe(initialCountdown); // 0 turns consumed

    dispatchAction(state, { type: 'WAIT' });
    expect(state.shiftCountdown).toBe(initialCountdown - 1); // 1 turn consumed
  });

  it('Haste Sigil forces shift immediately and reduces next max countdown by 2', () => {
    const state = createMockGameState();
    const initialMax = state.nextShiftCountdownMax;
    dispatchAction(state, { type: 'USE_ITEM', itemId: 'haste_1' });
    expect(state.nextShiftCountdownMax).toBe(initialMax - 2);
  });

  it('Stasis Flask pauses the countdown for its duration', () => {
    const state = createMockGameState();
    dispatchAction(state, { type: 'USE_ITEM', itemId: 'stasis_1' });
    const countdown = state.shiftCountdown;

    dispatchAction(state, { type: 'WAIT' });
    expect(state.shiftCountdown).toBe(countdown); // frozen
    // Drinking the flask cost a turn (6 -> 5); the WAIT cost another.
    expect(state.stasisTurnsRemaining).toBe(4);
  });

  it('using an unstacked item removes its slot', () => {
    const state = createMockGameState();
    dispatchAction(state, { type: 'USE_ITEM', itemId: 'stasis_1' });
    expect(state.player.inventory.some(item => item.id === 'stasis_1')).toBe(false);
  });

  it('using a stacked item decrements the count and keeps the slot until it empties', () => {
    const state = createMockGameState();
    const flask = state.player.inventory.find(item => item.id === 'stasis_1')!;
    flask.count = 2;

    dispatchAction(state, { type: 'USE_ITEM', itemId: 'stasis_1' });
    expect(state.player.inventory.find(item => item.id === 'stasis_1')?.count).toBe(1);

    dispatchAction(state, { type: 'WAIT' }); // let the first flask's effect lapse before drinking another
    dispatchAction(state, { type: 'USE_ITEM', itemId: 'stasis_1' });
    expect(state.player.inventory.some(item => item.id === 'stasis_1')).toBe(false);
  });

  it('picking up a consumable already carried stacks it onto the existing slot', () => {
    const state = createMockGameState();
    const carried = state.player.inventory.length;
    const step = walkableStep(state);
    state.floorMap.drops = [
      {
        item: {
          id: 'floor_potion',
          type: 'health_potion',
          name: 'Health Potion',
          description: 'Restores 30 HP.',
          category: 'consumable',
        },
        position: { x: step.x, y: step.y },
      },
    ];

    dispatchAction(state, { type: 'MOVE', dx: step.dx, dy: step.dy });

    expect(state.player.inventory).toHaveLength(carried);
    const potion = state.player.inventory.find(item => item.type === 'health_potion')!;
    expect(potion.id).toBe('health_1'); // the carried slot stacks, the dropped one never joins the array
    expect(potion.count).toBe(2);
  });

  it('moving into an adjacent enemy attacks it instead of moving', () => {
    const state = createMockGameState();
    const { x, y } = state.player.position;
    const enemy = createMockEnemy({ x: x + 1, y });
    state.entities.push(enemy);

    dispatchAction(state, { type: 'MOVE', dx: 1, dy: 0 });

    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(state.player.position).toEqual({ x, y });
  });

  it('kills an enemy that drops to zero HP and removes it from the floor', () => {
    const state = createMockGameState();
    const { x, y } = state.player.position;
    const enemy = createMockEnemy({ x: x + 1, y });
    enemy.hp = 1;
    state.entities.push(enemy);

    dispatchAction(state, { type: 'MOVE', dx: 1, dy: 0 });

    expect(state.entities.find(e => e.id === enemy.id)).toBeUndefined();
  });

  it('ends the game when the player runs out of HP', () => {
    const state = createMockGameState();
    state.player.hp = 1;
    const { x, y } = state.player.position;
    const enemy = createMockEnemy({ x: x + 1, y });
    enemy.attackPower = 50;
    state.entities.push(enemy);

    dispatchAction(state, { type: 'WAIT' });

    expect(state.player.hp).toBeLessThanOrEqual(0);
    expect(state.isGameOver).toBe(true);
  });

  it('advances the RNG state deterministically across dispatches', () => {
    const a = createMockGameState('determinism-seed');
    const b = createMockGameState('determinism-seed');

    for (let i = 0; i < 12; i++) {
      dispatchAction(a, { type: 'WAIT' });
      dispatchAction(b, { type: 'WAIT' });
    }

    expect(a.rngState.callCount).toBe(b.rngState.callCount);
    expect(a.player.hp).toBe(b.player.hp);
    expect(a.floorMap.tiles).toEqual(b.floorMap.tiles);
  });

  it('triggers a shift when the countdown expires and resets it to the max', () => {
    const state = createMockGameState();
    state.shiftCountdown = 1;

    dispatchAction(state, { type: 'WAIT' });

    expect(state.shiftCountdown).toBe(state.nextShiftCountdownMax);
    expect(state.eventLog.some(m => m.type === 'shift')).toBe(true);
  });

  /**
   * Per-species AI. Every species reads the shift telegraph differently — some go
   * dormant, some rush, some abandon the player for the exit — but the shape of the
   * check never varies: place the enemy, set the world, WAIT one turn, read where it
   * ended up. One row per rule, so a new species is a row rather than a copy.
   */
  const manhattan = (a: Position, b: Position) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  const aiCases: {
    name: string;
    type: EnemyType;
    place: { at: number } | 'exitPath' | 'diverging';
    shift?: Parameters<typeof pendingShift>;
    stasis?: true;
    outcome: 'holds' | 'moves' | 'closes' | 'closesOnExit' | 'playerStep' | 'exitStep';
  }[] = [
    { name: 'lets a Hinge Warden hold position during a shift telegraph', type: 'hinge_warden', place: { at: 4 }, shift: ['room_slide'], outcome: 'holds' },
    { name: 'lets a Hinge Warden resume pursuit outside a telegraph', type: 'hinge_warden', place: { at: 4 }, outcome: 'moves' },
    { name: 'keeps a Seam Skitter outside its normal aggro range', type: 'seam_skitter', place: { at: 7 }, outcome: 'holds' },
    { name: 'lets a Seam Skitter rush during a shift telegraph', type: 'seam_skitter', place: { at: 7 }, shift: ['room_slide'], outcome: 'closes' },
    { name: 'keeps a Fracture Leech dormant until a shift is telegraphed', type: 'fracture_leech', place: { at: 4 }, outcome: 'holds' },
    { name: 'lets a Fracture Leech pursue during a shift telegraph', type: 'fracture_leech', place: { at: 4 }, shift: ['room_slide'], outcome: 'moves' },
    { name: 'draws a Riftbound toward the exit route', type: 'riftbound', place: 'exitPath', outcome: 'closesOnExit' },
    { name: 'lets an Ashlock pursue the player without a sealing shift', type: 'ashlock', place: { at: 4 }, outcome: 'moves' },
    { name: 'sends an Ashlock toward the exit when a shift will seal it', type: 'ashlock', place: 'exitPath', shift: ['room_slide', true], outcome: 'exitStep' },
    { name: 'keeps a Stasis Scorcher outside its normal aggro range', type: 'stasis_scorcher', place: { at: 7 }, outcome: 'holds' },
    { name: 'makes a Stasis Scorcher advance while the clock is frozen', type: 'stasis_scorcher', place: { at: 7 }, stasis: true, outcome: 'moves' },
    { name: 'lets a Facet Reaver pursue the player on stable geometry', type: 'facet_reaver', place: 'diverging', outcome: 'playerStep' },
    { name: 'redirects a Facet Reaver to the exit during a telegraph', type: 'facet_reaver', place: 'diverging', shift: ['room_slide'], outcome: 'exitStep' },
    { name: 'keeps a Glass Moth dormant until a shift is telegraphed', type: 'glass_moth', place: { at: 7 }, outcome: 'holds' },
    { name: 'lets a Glass Moth pursue during a telegraph', type: 'glass_moth', place: { at: 7 }, shift: ['room_slide'], outcome: 'moves' },
    { name: 'keeps a Glass Moth outside its telegraph aggro range', type: 'glass_moth', place: { at: 11 }, shift: ['room_slide'], outcome: 'holds' },
    { name: 'keeps an Unmaking Hound just outside its normal aggro range', type: 'unmaking_hound', place: { at: 8 }, outcome: 'holds' },
    { name: 'makes an Unmaking Hound pursue during localized collapse', type: 'unmaking_hound', place: { at: 8 }, shift: ['localized_collapse'], outcome: 'moves' },
    { name: 'keeps a Null Scribe outside its normal aggro range', type: 'null_scribe', place: { at: 6 }, outcome: 'holds' },
    { name: 'sends a Null Scribe toward the exit during a room slide', type: 'null_scribe', place: 'diverging', shift: ['room_slide'], outcome: 'exitStep' },
    { name: 'keeps a Null Scribe player-focused during a corridor reconnect', type: 'null_scribe', place: { at: 4 }, shift: ['corridor_reconnect'], outcome: 'moves' },
  ];

  it.each(aiCases)('$name', ({ type, place, shift, stasis, outcome }) => {
    const state = createMockGameState();
    const before =
      place === 'exitPath'
        ? enemyWithExitPath(state)
        : place === 'diverging'
          ? enemyWithDivergingPaths(state).position
          : enemyAtDistance(state, place.at);

    // Routes are read off the geometry before the turn, so the expectation is the
    // step the enemy *should* take rather than a hardcoded tile.
    const playerStep = findPath(state.floorMap, before, state.player.position)?.[1];
    const exitStep = findPath(state.floorMap, before, state.floorMap.exit)?.[1];
    const exitPathLength = findPath(state.floorMap, before, state.floorMap.exit)?.length;
    const startDistance = manhattan(before, state.player.position);

    const enemy = createMockEnemy(before, type);
    state.entities.push(enemy);
    if (shift) {
      state.shiftCountdown = 3;
      state.pendingShift = pendingShift(...shift);
    }
    if (stasis) {
      state.isStasisActive = true;
      state.stasisTurnsRemaining = 2;
    }

    dispatchAction(state, { type: 'WAIT' });

    switch (outcome) {
      case 'holds':
        expect(enemy.position).toEqual(before);
        break;
      case 'moves':
        expect(enemy.position).not.toEqual(before);
        break;
      case 'closes':
        expect(manhattan(enemy.position, state.player.position)).toBeLessThan(startDistance);
        break;
      case 'closesOnExit':
        expect(enemy.position).not.toEqual(before);
        expect(findPath(state.floorMap, enemy.position, state.floorMap.exit)?.length).toBeLessThan(
          exitPathLength!
        );
        break;
      case 'playerStep':
        expect(enemy.position).toEqual(playerStep);
        break;
      case 'exitStep':
        expect(enemy.position).toEqual(exitStep);
        break;
    }
  });

  it('damages a player standing on a Shifting Halls door before a shift', () => {
    const state = createMockGameState();
    state.player.position = doorPosition(state);
    state.shiftCountdown = 5;

    const result = dispatchAction(state, { type: 'WAIT' });

    expect(state.shiftCountdown).toBe(4);
    expect(state.player.hp).toBe(98);
    expect(state.lastDamageSource).toBe("the Halls' hinge");
    expect(result.events.some(event => event.includes('stressed hinge'))).toBe(true);
  });

  it('does not trigger hinge stress on ordinary tiles, later regions, or stasis turns', () => {
    const ordinary = createMockGameState();
    ordinary.shiftCountdown = 5;
    dispatchAction(ordinary, { type: 'WAIT' });
    expect(ordinary.player.hp).toBe(100);

    const later = createMockGameState();
    later.floorMap.level = 6;
    later.player.position = doorPosition(later);
    later.shiftCountdown = 5;
    dispatchAction(later, { type: 'WAIT' });
    expect(later.player.hp).toBe(100);

    const frozen = createMockGameState();
    frozen.player.position = doorPosition(frozen);
    frozen.shiftCountdown = 5;
    frozen.isStasisActive = true;
    frozen.stasisTurnsRemaining = 2;
    dispatchAction(frozen, { type: 'WAIT' });
    expect(frozen.player.hp).toBe(100);
    expect(frozen.shiftCountdown).toBe(5);
  });

  it('damages a Fracture Deeps tile targeted by the pending shift', () => {
    const state = createMockGameState();
    const target = shiftGroupTile(state);
    state.floorMap.level = 6;
    state.player.position = target.position;
    state.shiftCountdown = 3;
    state.pendingShift = { ...pendingShift(), targetGroupId: target.groupId };

    const result = dispatchAction(state, { type: 'WAIT' });

    expect(state.shiftCountdown).toBe(2);
    expect(state.player.hp).toBe(98);
    expect(state.lastDamageSource).toBe("the Deeps' rift");
    expect(result.events.some(event => event.includes('rift shears'))).toBe(true);
  });

  it('does not trigger Fracture Deeps rift shear on an untargeted group', () => {
    const state = createMockGameState();
    const target = shiftGroupTile(state);
    state.floorMap.level = 6;
    state.player.position = target.position;
    state.shiftCountdown = 3;
    state.pendingShift = { ...pendingShift(), targetGroupId: 'other-group' };

    dispatchAction(state, { type: 'WAIT' });

    expect(state.player.hp).toBe(100);
  });

  it('damages a player standing in an Ashen Warrens corridor', () => {
    const state = createMockGameState();
    state.floorMap.level = 11;
    state.player.position = tileWithGroupPrefix(state, 'corridor_');
    state.shiftCountdown = 5;

    dispatchAction(state, { type: 'WAIT' });

    expect(state.player.hp).toBe(98);
    expect(state.lastDamageSource).toBe("the Warrens' ash");
    expect(state.eventLog.some(event => event.text.includes('Ash pours'))).toBe(true);

    dispatchAction(state, { type: 'WAIT' });
    expect(state.player.hp).toBe(98);
  });

  it('does not trigger Ash Choke on rooms or outside the Ashen Warrens', () => {
    const room = createMockGameState();
    room.floorMap.level = 11;
    room.player.position = tileWithGroupPrefix(room, 'room_');
    room.shiftCountdown = 5;
    dispatchAction(room, { type: 'WAIT' });
    expect(room.player.hp).toBe(100);

    const later = createMockGameState();
    later.floorMap.level = 16;
    later.player.position = tileWithGroupPrefix(later, 'corridor_');
    later.shiftCountdown = 5;
    dispatchAction(later, { type: 'WAIT' });
    expect(later.player.hp).toBe(100);
  });

  it('charges an Unmaking toll when the player waits on the stairs', () => {
    const state = createMockGameState();
    state.floorMap.level = 21;
    state.player.position = stairsPosition(state);
    state.shiftCountdown = 5;

    dispatchAction(state, { type: 'WAIT' });

    expect(state.shiftCountdown).toBe(4);
    expect(state.player.hp).toBe(98);
    expect(state.lastDamageSource).toBe("the Unmaking's stair toll");
  });

  it('does not charge the stair toll on other tiles or during stasis', () => {
    const ordinary = createMockGameState();
    ordinary.floorMap.level = 21;
    ordinary.shiftCountdown = 5;
    dispatchAction(ordinary, { type: 'WAIT' });
    expect(ordinary.player.hp).toBe(100);

    const frozen = createMockGameState();
    frozen.floorMap.level = 21;
    frozen.player.position = stairsPosition(frozen);
    frozen.shiftCountdown = 5;
    frozen.isStasisActive = true;
    frozen.stasisTurnsRemaining = 2;
    dispatchAction(frozen, { type: 'WAIT' });
    expect(frozen.player.hp).toBe(100);
    expect(frozen.shiftCountdown).toBe(5);
  });

  it('lets final-floor descent win before any Unmaking toll can trigger', () => {
    const state = createNewGame('unmaking-victory', createRunConfig('extreme', 'brutal'));
    state.floorMap.level = 25;
    state.player.position = { ...state.floorMap.exit };
    state.entities = [];
    state.clearedRegions = [4];

    dispatchAction(state, { type: 'DESCEND' });

    expect(state.isVictory).toBe(true);
    expect(state.isGameOver).toBe(true);
    expect(state.player.hp).toBe(100);
    expect(state.turnCount).toBe(0);
  });
});

describe('Armor', () => {
  const armor = (id: string, defense: number): Item => ({
    id,
    type: 'padded_vest',
    name: `Vest ${defense}`,
    description: '',
    category: 'armor',
    defense,
  });

  const stepTarget = walkableStep;

  it('soaks damage but never all of it', () => {
    const state = createMockGameState();
    state.player.armor = armor('a', 100);
    damagePlayer(state, 10, []);
    expect(state.player.hp).toBe(99);
  });

  it('equips the first piece automatically and asks before replacing one', () => {
    const state = createMockGameState();
    const step = stepTarget(state);
    state.floorMap.drops = [{ item: armor('found_1', 3), position: { x: step.x, y: step.y } }];

    dispatchAction(state, { type: 'MOVE', dx: step.dx, dy: step.dy });
    expect(state.player.armor?.id).toBe('found_1');
    expect(state.pendingArmorOffer).toBeNull();
    expect(state.floorMap.drops).toHaveLength(0);

    // A second piece underfoot is an offer, not a pickup — it stays on the floor.
    state.floorMap.drops.push({ item: armor('found_2', 5), position: { ...state.player.position } });
    dispatchAction(state, { type: 'MOVE', dx: -step.dx, dy: -step.dy });
    dispatchAction(state, { type: 'MOVE', dx: step.dx, dy: step.dy });
    expect(state.pendingArmorOffer?.id).toBe('found_2');
    expect(state.player.armor?.id).toBe('found_1');

    dispatchAction(state, { type: 'EQUIP_ARMOR' });
    expect(state.player.armor?.id).toBe('found_2');
    expect(state.pendingArmorOffer).toBeNull();
    // The replaced piece lands where the player is standing.
    expect(state.floorMap.drops.map(d => d.item.id)).toEqual(['found_1']);
  });

  it('declining leaves the piece on the floor and costs no turn', () => {
    const state = createMockGameState();
    state.player.armor = armor('worn', 2);
    state.pendingArmorOffer = armor('offered', 9);
    const turn = state.turnCount;

    dispatchAction(state, { type: 'DECLINE_ARMOR' });
    expect(state.player.armor?.id).toBe('worn');
    expect(state.pendingArmorOffer).toBeNull();
    expect(state.turnCount).toBe(turn);
  });

  /** Wear something, step onto `piece` on the neighbouring tile, and say no. */
  function declineOnNeighbour(state: GameState, piece: Item) {
    const step = stepTarget(state);
    state.player.armor = armor('worn', 2);
    state.floorMap.drops = [{ item: piece, position: { x: step.x, y: step.y } }];

    dispatchAction(state, { type: 'MOVE', dx: step.dx, dy: step.dy });
    expect(state.pendingArmorOffer?.id).toBe(piece.id);
    dispatchAction(state, { type: 'DECLINE_ARMOR' });
    return step;
  }

  it('does not ask again after a decline, however often the tile is re-entered', () => {
    const state = createMockGameState();
    const step = declineOnNeighbour(state, armor('carapace_a', 5));

    for (let i = 0; i < 3; i++) {
      dispatchAction(state, { type: 'MOVE', dx: -step.dx, dy: -step.dy });
      dispatchAction(state, { type: 'MOVE', dx: step.dx, dy: step.dy });
      expect(state.pendingArmorOffer).toBeNull();
    }

    // Still there, still declined — which is what the HUD hint reads.
    expect(state.floorMap.drops).toHaveLength(1);
    expect(declinedArmorUnderfoot(state)?.id).toBe('carapace_a');
  });

  it('asks again for a different piece that lands on the same tile', () => {
    const state = createMockGameState();
    const step = declineOnNeighbour(state, armor('carapace_a', 5));

    // The dungeon puts a second, distinct piece where the first one lies. A new
    // piece is a new decision, so the decline on A must not answer for B.
    state.floorMap.drops!.push({ item: armor('carapace_b', 7), position: { x: step.x, y: step.y } });
    dispatchAction(state, { type: 'MOVE', dx: -step.dx, dy: -step.dy });
    dispatchAction(state, { type: 'MOVE', dx: step.dx, dy: step.dy });

    expect(state.pendingArmorOffer?.id).toBe('carapace_b');
  });

  it('re-raises the prompt on request, for free, and only where a declined piece lies', () => {
    const state = createMockGameState();
    const step = declineOnNeighbour(state, armor('carapace_a', 5));
    const turn = state.turnCount;

    dispatchAction(state, { type: 'PICK_UP_ARMOR' });
    expect(state.pendingArmorOffer?.id).toBe('carapace_a');
    expect(state.turnCount).toBe(turn);

    dispatchAction(state, { type: 'EQUIP_ARMOR' });
    expect(state.player.armor?.id).toBe('carapace_a');
    expect(state.floorMap.drops!.map(d => d.item.id)).toEqual(['worn']);

    // Off the tile there is nothing to re-raise.
    dispatchAction(state, { type: 'MOVE', dx: -step.dx, dy: -step.dy });
    expect(declinedArmorUnderfoot(state)).toBeNull();
    dispatchAction(state, { type: 'PICK_UP_ARMOR' });
    expect(state.pendingArmorOffer).toBeNull();
  });

  it('counts a swap as an answer for the piece it drops at the feet', () => {
    const state = createMockGameState();
    declineOnNeighbour(state, armor('carapace_a', 5));

    dispatchAction(state, { type: 'PICK_UP_ARMOR' });
    dispatchAction(state, { type: 'EQUIP_ARMOR' });

    // 'worn' is now on the floor underfoot. The player just took it off, so
    // stepping back onto it must not re-ask the swap they only made.
    expect(state.declinedArmorIds).toContain('worn');
    expect(declinedArmorUnderfoot(state)?.id).toBe('worn');
    expect(state.pendingArmorOffer).toBeNull();
  });

  it('forgets declines on descent, since the drops do not survive it', () => {
    const state = createMockGameState();
    declineOnNeighbour(state, armor('carapace_a', 5));
    expect(state.declinedArmorIds).toHaveLength(1);

    buildFloor(state, new SeededRNG('armor-descend'), 2);
    expect(state.declinedArmorIds).toEqual([]);
  });
});

describe('Coins', () => {
  const step = walkableStep;

  it('banks a cache instead of putting it in the inventory', () => {
    const state = createMockGameState();
    const target = step(state);
    const carried = state.player.inventory.length;
    state.floorMap.drops = [
      { item: createCoinCache(17, 'cache_1'), position: { x: target.x, y: target.y } },
    ];

    dispatchAction(state, { type: 'MOVE', dx: target.dx, dy: target.dy });

    expect(state.player.coins).toBe(17);
    // Currency must never reach the inventory, or it takes a hotbar slot and
    // becomes something the player can try to "use".
    expect(state.player.inventory).toHaveLength(carried);
    expect(state.floorMap.drops).toHaveLength(0);
  });

  it('pays a bounty for a kill, more for a boss', () => {
    expect(coinsPerKill(0, false)).toBeGreaterThan(0);
    expect(coinsPerKill(4, false)).toBeGreaterThan(coinsPerKill(0, false));
    expect(coinsPerKill(0, true)).toBeGreaterThan(coinsPerKill(0, false));
  });

  it('pays out when the player lands the killing blow', () => {
    const state = createMockGameState();
    const target = step(state);
    const enemy = createMockEnemy({ x: target.x, y: target.y });
    enemy.hp = 1;
    state.entities = [enemy];

    dispatchAction(state, { type: 'MOVE', dx: target.dx, dy: target.dy });

    expect(enemy.hp).toBe(0);
    expect(state.player.coins).toBe(coinsPerKill(0, false));
  });

  it('keeps a floor pile small and region-independent', () => {
    const rng = new SeededRNG('coin-income');
    for (let i = 0; i < 200; i++) {
      const pile = coinsPerPile(rng);
      expect(pile).toBeGreaterThanOrEqual(1);
      expect(pile).toBeLessThanOrEqual(3);
    }
  });

  it('accumulates across floors', () => {
    const state = createNewGame('coin-carry', createRunConfig('medium', 'standard'));
    state.player.coins = 42;
    buildFloor(state, new SeededRNG('coin-carry-rng'), 2);

    // Coins live on the player, not the floor, so descending cannot drop them.
    expect(state.player.coins).toBe(42);
  });

  it('puts spendable caches on a normal floor', () => {
    const state = createNewGame('coin-drops', createRunConfig('medium', 'standard'));
    const caches = (state.floorMap.drops ?? []).filter(d => d.item.category === 'currency');

    expect(caches.length).toBeGreaterThan(0);
    for (const cache of caches) expect(cache.item.value ?? 0).toBeGreaterThan(0);
  });
});

describe('Experience and levels', () => {
  const step = walkableStep;

  it('pays more XP for a deadlier species, a deeper region, and a boss', () => {
    expect(xpPerKill('riftbound', 0)).toBeGreaterThan(xpPerKill('seam_skitter', 0));
    expect(xpPerKill('hinge_warden', 4)).toBeGreaterThan(xpPerKill('hinge_warden', 0));
    expect(xpPerKill('hinge_sovereign', 0)).toBeGreaterThan(xpPerKill('hinge_warden', 0));
  });

  it('banks XP on the killing blow and names it in the event', () => {
    const state = createMockGameState();
    const target = step(state);
    const enemy = createMockEnemy({ x: target.x, y: target.y });
    enemy.hp = 1;
    state.entities = [enemy];

    const { events } = dispatchAction(state, { type: 'MOVE', dx: target.dx, dy: target.dy });

    const award = xpPerKill('crawler', 0);
    expect(state.player.xp).toBe(award);
    expect(events.some(e => e.includes(`You gain ${award} XP`))).toBe(true);
  });

  it('gains nothing from walking past a fight', () => {
    const state = createMockGameState();
    const target = step(state);
    state.entities = [createMockEnemy({ x: target.x + 4, y: target.y })];
    const { maxHp, attackPower } = state.player;

    for (let i = 0; i < 5; i++) dispatchAction(state, { type: 'WAIT' });

    expect(state.player.xp).toBe(0);
    expect(state.player.level).toBe(1);
    expect(state.player.maxHp).toBe(maxHp);
    expect(state.player.attackPower).toBe(attackPower);
  });

  it('routes every stat gain through grantXp, spending the threshold each level', () => {
    const state = createMockGameState();
    const before = { maxHp: state.player.maxHp, attack: state.player.attackPower };

    grantXp(state, xpToNextLevel(1) - 1, []);
    expect(state.player.level).toBe(1);
    expect(state.player.maxHp).toBe(before.maxHp);

    grantXp(state, 1, []);
    expect(state.player.level).toBe(2);
    expect(state.player.xp).toBe(0);
    expect(state.player.maxHp).toBe(before.maxHp + HP_PER_LEVEL);
    expect(state.player.attackPower).toBe(before.attack + ATTACK_PER_LEVEL);
  });

  it('levels more than once from a single windfall and keeps the remainder', () => {
    const state = createMockGameState();
    const before = { maxHp: state.player.maxHp, attack: state.player.attackPower };
    // Enough to clear the first four thresholds outright — a boss late in the run
    // can be worth more than a whole level, so the loop must not stop at one.
    const windfall = xpToNextLevel(1) + xpToNextLevel(2) + xpToNextLevel(3) + 7;

    const events: string[] = [];
    grantXp(state, windfall, events);

    expect(state.player.level).toBe(4);
    expect(state.player.xp).toBe(7);
    expect(events).toHaveLength(3);
    expect(state.player.maxHp).toBe(before.maxHp + 3 * HP_PER_LEVEL);
    expect(state.player.attackPower).toBe(before.attack + 3 * ATTACK_PER_LEVEL);
  });

  /**
   * The curve is scored against the run it is actually spent on, not against a
   * hand-typed XP total: both figures below are read off `REGIONS` and
   * `xpPerKill`, so retuning a species or a region's enemy count re-scores it.
   */
  const ORDINARY_FLOORS_PER_REGION = FLOORS_PER_REGION - 1;

  function averageKillXp(region: Region): number {
    const pool = region.enemyPool;
    return pool.reduce((total, type) => total + xpPerKill(type, region.index), 0) / pool.length;
  }

  /** Every ordinary enemy the region holds, if the player kills all of them. */
  function ordinaryFloorXp(region: Region): number {
    return ORDINARY_FLOORS_PER_REGION * region.enemyCount * averageKillXp(region);
  }

  function levelAfter(xp: number): number {
    let level = 1;
    let remaining = xp;
    while (remaining >= xpToNextLevel(level)) {
      remaining -= xpToNextLevel(level);
      level++;
    }
    return level;
  }

  /**
   * Nobody clears a floor completely. The one clean floor-1 trace in `logs/` that
   * reached a guardian banked 118 XP across region 0 against the 188 its floors
   * held, so the curve is scored against that rate rather than a perfect sweep.
   */
  const OBSERVED_CLEAR_RATE = 0.63;

  it('pays for a level on a region ordinary floors, before its guardian', () => {
    let xp = 0;
    for (const region of REGIONS) {
      const entering = levelAfter(xp);
      xp += ordinaryFloorXp(region) * OBSERVED_CLEAR_RATE;
      // The level-up has to land before the arena floor. Paying for it with the
      // guardian's own bounty hands the player their reward after the fight it
      // was supposed to help them survive, which is what `100 + 60` did here.
      expect(levelAfter(xp)).toBeGreaterThan(entering);
      // The guardian always dies — the region does not open otherwise.
      xp += xpPerKill(region.boss, region.index);
    }
  });

  it('reaches the final guardian measurably stronger for having fought the run', () => {
    let clearing = 0;
    let rushing = 0;
    for (const region of REGIONS) {
      clearing += ordinaryFloorXp(region) * OBSERVED_CLEAR_RATE;
      // The last region's guardian is the one both runs are standing in front of,
      // so neither has banked it yet.
      if (region.index < REGIONS.length - 1) {
        const bounty = xpPerKill(region.boss, region.index);
        clearing += bounty;
        rushing += bounty;
      }
    }

    expect(levelAfter(clearing) - levelAfter(rushing)).toBeGreaterThanOrEqual(3);
  });

  it('heals by exactly the max-HP gain rather than to full', () => {
    const state = createMockGameState();
    state.player.hp = 40;

    grantXp(state, xpToNextLevel(1), []);

    expect(state.player.hp).toBe(40 + HP_PER_LEVEL);
    expect(state.player.hp).toBeLessThan(state.player.maxHp);
  });

  it('signals the level-up for the splash and clears it on the next turn', () => {
    const state = createMockGameState();
    const before = state.player.level;

    grantXp(state, xpToNextLevel(before), []);

    expect(state.lastLevelUp).toEqual({
      level: before + 1,
      maxHpGained: HP_PER_LEVEL,
      attackGained: ATTACK_PER_LEVEL,
    });

    dispatchAction(state, { type: 'WAIT' });
    expect(state.lastLevelUp).toBeNull();
  });

  it('splashes a multi-level windfall once, naming the final level and total gains', () => {
    const state = createMockGameState();
    const windfall = xpToNextLevel(1) + xpToNextLevel(2);

    grantXp(state, windfall, []);

    expect(state.lastLevelUp).toEqual({
      level: 3,
      maxHpGained: 2 * HP_PER_LEVEL,
      attackGained: 2 * ATTACK_PER_LEVEL,
    });
  });

  it('leaves no level-up signal on a turn that gained no level', () => {
    const state = createMockGameState();

    grantXp(state, xpToNextLevel(1) - 1, []);

    expect(state.lastLevelUp).toBeNull();
  });

  it('makes each level cost more than the last', () => {
    expect(xpToNextLevel(2)).toBeGreaterThan(xpToNextLevel(1));
    expect(xpToNextLevel(8)).toBeGreaterThan(xpToNextLevel(7));
  });
});

describe('Shop', () => {
  /** A boss floor with its guardian already one blow from death, beside the player. */
  function atBossDeath(seed: string) {
    const state = createNewGame(seed, createRunConfig('short', 'standard'));
    buildFloor(state, new SeededRNG(`${seed}-rng`), 5);
    const boss = state.entities[0];
    boss.position = { x: state.player.position.x + 1, y: state.player.position.y };
    boss.hp = 1;
    dispatchAction(state, { type: 'MOVE', dx: 1, dy: 0 });
    return state;
  }

  /** A tile the player can stand on to bump `target` from. */
  function adjacentWalkable(state: GameState, target: Position): Position {
    const step = [
      { x: target.x + 1, y: target.y },
      { x: target.x - 1, y: target.y },
      { x: target.x, y: target.y + 1 },
      { x: target.x, y: target.y - 1 },
    ].find(p => state.floorMap.tiles[p.y][p.x].type === 'floor');
    expect(step).toBeDefined();
    return step!;
  }

  it('opens a merchant when the region falls', () => {
    const state = atBossDeath('shop-open');

    expect(state.shop).not.toBeNull();
    expect(state.shop!.floor).toBe(5);
    expect(state.shop!.regionIndex).toBe(0);
    // The run's difficulty valve must never roll shut.
    expect(state.shop!.stock.some(offer => offer.item.type === 'health_potion')).toBe(true);
  });

  it('stands the merchant on a reachable room tile of the boss floor', () => {
    const state = atBossDeath('shop-place');
    const { position } = state.shop!;
    const tile = state.floorMap.tiles[position.y][position.x];

    expect(tile.type).toBe('floor');
    // Rooms only — the merchant is solid, and one parked in a corridor could seal
    // the way to the stairs on a floor that has stopped shifting.
    expect(state.floorMap.shiftGroups[tile.shiftGroupId!].type).toBe('room');
    expect(position).not.toEqual(state.floorMap.exit);
    expect(position).not.toEqual(state.player.position);
    expect(findPath(state.floorMap, state.player.position, position)).not.toBeNull();
  });

  it('opens the stock when the player walks into the merchant, and costs no turn', () => {
    const state = atBossDeath('shop-bump');
    const merchant = state.shop!.position;
    const step = adjacentWalkable(state, merchant);
    state.player.position = step;
    const turn = state.turnCount;

    dispatchAction(state, { type: 'MOVE', dx: merchant.x - step.x, dy: merchant.y - step.y });

    expect(state.shopOpened).toBe(true);
    // He is an obstacle, not a doormat: the bump trades instead of stepping in.
    expect(state.player.position).toEqual(step);
    // Free, like BUY_ITEM — the arena must not shift while a price list is read.
    expect(state.turnCount).toBe(turn);
  });

  it('reports the merchant only for the dispatch that bumped him', () => {
    const state = atBossDeath('shop-bump-clear');
    const merchant = state.shop!.position;
    const step = adjacentWalkable(state, merchant);
    state.player.position = step;

    dispatchAction(state, { type: 'MOVE', dx: merchant.x - step.x, dy: merchant.y - step.y });
    dispatchAction(state, { type: 'WAIT' });

    expect(state.shopOpened).toBe(false);
  });

  it('deducts coins and hands over the item', () => {
    const state = atBossDeath('shop-buy');
    const offer = state.shop!.stock[0];
    state.player.coins = offer.price + 5;
    // Counts items, not slots: a purchase that matches something already carried
    // stacks onto it instead of opening a new slot.
    const carried = state.player.inventory.reduce((sum, item) => sum + (item.count ?? 1), 0);

    dispatchAction(state, { type: 'BUY_ITEM', offerId: offer.id });

    expect(state.player.coins).toBe(5);
    const held = state.player.inventory.reduce((sum, item) => sum + (item.count ?? 1), 0);
    expect(held).toBe(carried + 1);
    expect(state.shop!.stock[0].sold).toBe(true);
  });

  it('refuses a second sale and a purchase beyond the purse', () => {
    const state = atBossDeath('shop-refuse');
    const [first, second] = state.shop!.stock;
    state.player.coins = first.price;

    dispatchAction(state, { type: 'BUY_ITEM', offerId: first.id });
    const carried = state.player.inventory.length;
    dispatchAction(state, { type: 'BUY_ITEM', offerId: first.id });
    dispatchAction(state, { type: 'BUY_ITEM', offerId: second.id });

    expect(state.player.coins).toBe(0);
    expect(state.player.inventory).toHaveLength(carried);
  });

  it('does not spend a turn, so the arena cannot shift while browsing', () => {
    const state = atBossDeath('shop-free');
    const offer = state.shop!.stock[0];
    state.player.coins = offer.price;
    const turn = state.turnCount;

    dispatchAction(state, { type: 'BUY_ITEM', offerId: offer.id });

    expect(state.turnCount).toBe(turn);
  });

  it('cannot be re-rolled, and retires when the player descends', () => {
    const state = atBossDeath('shop-stable');
    const before = state.shop!.stock.map(offer => `${offer.item.type}:${offer.price}`);
    const stall = { ...state.shop!.position };

    // Closing and reopening the modal only re-reads this stored stock.
    expect(state.shop!.stock.map(offer => `${offer.item.type}:${offer.price}`)).toEqual(before);

    // `awardBossDefeats` runs three times per dispatch and the corpse stays on the
    // floor for the first of them, so "rolled once" is a claim about every turn
    // after the kill, not only about the kill itself. The merchant's tile is part
    // of the same roll and must not wander either.
    const step = adjacentWalkable(state, stall);
    for (let i = 0; i < 5; i++) dispatchAction(state, { type: 'WAIT' });
    state.player.position = step;
    dispatchAction(state, { type: 'MOVE', dx: stall.x - step.x, dy: stall.y - step.y });

    expect(state.shop!.stock.map(offer => `${offer.item.type}:${offer.price}`)).toEqual(before);
    expect(state.shop!.position).toEqual(stall);

    state.player.position = { ...state.floorMap.exit };
    dispatchAction(state, { type: 'DESCEND' });

    expect(state.shop).toBeNull();
  });

  it('marks the same stock up in later regions', () => {
    expect(priceFor('health_potion', 4)).toBeGreaterThan(priceFor('health_potion', 0));
  });

  /**
   * The 6c pricing pass. A region's counter has to keep pace with what that
   * region pays, or the deepest shops go from a choice to a formality — which is
   * exactly what a flat-ish markup against a steepening income curve did.
   *
   * Modelled the way the pricing pass measured it: a full clear of a region is
   * every enemy on its four ordinary floors, its boss, and the pile trickle.
   */
  it('keeps a stall costing a steady share of the region that pays for it', () => {
    const ENEMIES_PER_FLOOR = [4, 5, 6, 7, 8];
    const PILE_INCOME_PER_REGION = 20;

    const shares = ENEMIES_PER_FLOOR.map((count, region) => {
      const income =
        count * 4 * coinsPerKill(region, false) +
        coinsPerKill(region, true) +
        PILE_INCOME_PER_REGION;
      const stall = rollShopStock(new SeededRNG(`stall-${region}`), region).reduce(
        (total, entry) => total + entry.price,
        0
      );
      return income / stall;
    });

    // Every region's clear buys its own stall over, and none buys it twice —
    // the failure the pass fixed was region 3 sitting at 1.86x.
    for (const share of shares) {
      expect(share).toBeGreaterThan(1);
      expect(share).toBeLessThan(1.6);
    }

    // And no region is more than half again as generous as the stingiest, so the
    // curve is flat rather than merely bounded.
    expect(Math.max(...shares) / Math.min(...shares)).toBeLessThan(1.5);
  });
});

describe('Run configuration', () => {
  it('keeps a boss-floor exit sealed while guardians remain', () => {
    const state = createNewGame('arena-lock', createRunConfig('short', 'standard'));
    buildFloor(state, new SeededRNG('arena-lock-rng'), 5);
    state.player.position = { ...state.floorMap.exit };
    const turn = state.turnCount;

    dispatchAction(state, { type: 'DESCEND' });

    expect(state.floorMap.level).toBe(5);
    expect(state.turnCount).toBe(turn);
    expect(state.isGameOver).toBe(false);
  });

  it('opens the region after a boss defeat and pays the reward once', () => {
    const state = createNewGame('boss-reward', createRunConfig('short', 'standard'));
    buildFloor(state, new SeededRNG('boss-reward-rng'), 5);
    const boss = state.entities[0];
    boss.position = { x: state.player.position.x + 1, y: state.player.position.y };
    boss.hp = 1;

    dispatchAction(state, { type: 'MOVE', dx: 1, dy: 0 });

    expect(state.entities).toHaveLength(0);
    expect(state.clearedRegions).toEqual([0]);
    expect(state.player.inventory.some(item => item.id === 'boss_reward_5')).toBe(true);
    expect(state.eventLog.some(log => log.text.includes('The Shifting Halls is cleared'))).toBe(true);

    state.player.position = { ...state.floorMap.exit };
    dispatchAction(state, { type: 'DESCEND' });
    expect(state.floorMap.level).toBe(6);
  });

  it('signals the boss defeat for the splash and clears it on the next turn', () => {
    const state = createNewGame('boss-splash', createRunConfig('short', 'standard'));
    buildFloor(state, new SeededRNG('boss-splash-rng'), 5);
    const boss = state.entities[0];
    boss.position = { x: state.player.position.x + 1, y: state.player.position.y };
    boss.hp = 1;
    const bossName = boss.name;

    dispatchAction(state, { type: 'MOVE', dx: 1, dy: 0 });

    expect(state.lastBossDefeat).toEqual({
      floor: 5,
      regionName: 'The Shifting Halls',
      bossName,
    });

    state.player.hp = state.player.maxHp;
    dispatchAction(state, { type: 'WAIT' });
    expect(state.lastBossDefeat).toBeNull();
  });

  it('leaves no boss signal on a turn that killed an ordinary enemy', () => {
    const state = createMockGameState();
    const spot = enemyAtDistance(state, 1);
    const enemy = createMockEnemy(spot);
    enemy.hp = 1;
    state.entities = [enemy];

    dispatchAction(state, {
      type: 'MOVE',
      dx: spot.x - state.player.position.x,
      dy: spot.y - state.player.position.y,
    });

    expect(state.entities).toHaveLength(0);
    expect(state.lastBossDefeat).toBeNull();
  });

  it('gives the Hinge Sovereign a shift-synchronized signature attack', () => {
    const state = createNewGame('hinge-sovereign', createRunConfig('short', 'standard'));
    buildFloor(state, new SeededRNG('hinge-sovereign-rng'), 5);
    const boss = state.entities[0];
    boss.position = { x: state.player.position.x + 2, y: state.player.position.y };
    state.pendingShift = pendingShift();
    state.shiftCountdown = 2;
    const hp = state.player.hp;

    dispatchAction(state, { type: 'WAIT' });

    expect(state.player.hp).toBeLessThan(hp);
    expect(state.entities[0].bossCooldown).toBe(3);
  });

  it('lets the Rift Regent mark a tile and rewards movement', () => {
    const state = createNewGame('rift-regent', createRunConfig('short', 'standard'));
    buildFloor(state, new SeededRNG('rift-regent-rng'), 10);
    const boss = state.entities[0];
    boss.position = { x: state.player.position.x + 2, y: state.player.position.y };
    state.pendingShift = { ...pendingShift(), targetGroupId: 'arena_1' };
    state.shiftCountdown = 2;

    dispatchAction(state, { type: 'WAIT' });

    expect(state.player.hp).toBe(100);
    expect(state.entities[0].bossTarget).toEqual(state.player.position);

    const hp = state.player.hp;
    state.player.position = { x: state.player.position.x, y: state.player.position.y + 1 };
    dispatchAction(state, { type: 'WAIT' });

    expect(state.player.hp).toBe(hp);
    expect(state.entities[0].bossTarget).toBeUndefined();
    expect(state.entities[0].bossCooldown).toBe(4);

    state.entities[0].bossCooldown = 0;
    state.entities[0].bossTarget = { ...state.player.position };
    const markedHp = state.player.hp;
    dispatchAction(state, { type: 'WAIT' });
    expect(state.player.hp).toBeLessThan(markedHp);
    expect(state.entities[0].bossCooldown).toBe(4);
  });

  it('makes the Cinder Gatekeeper punish stasis near the exit', () => {
    const state = createNewGame('cinder-gatekeeper', createRunConfig('long', 'standard'));
    buildFloor(state, new SeededRNG('cinder-gatekeeper-rng'), 15);
    const boss = state.entities[0];
    boss.position = { x: state.player.position.x + 2, y: state.player.position.y };
    state.isStasisActive = true;
    state.stasisTurnsRemaining = 3;

    dispatchAction(state, { type: 'WAIT' });
    expect(state.player.hp).toBe(100);
    expect(state.entities[0].bossTarget).toEqual(state.floorMap.exit);

    state.player.position = { ...state.floorMap.exit };
    const hp = state.player.hp;
    dispatchAction(state, { type: 'WAIT' });

    expect(state.player.hp).toBeLessThan(hp);
    expect(state.entities[0].bossCooldown).toBe(4);
  });

  it('makes the Prism Refractor mark a visible tile from the pending shift', () => {
    const state = createNewGame('prism-refractor', createRunConfig('extreme', 'standard'));
    buildFloor(state, new SeededRNG('prism-refractor-rng'), 20);
    const boss = state.entities[0];
    boss.position = { x: state.player.position.x + 2, y: state.player.position.y };
    const target = { x: state.player.position.x, y: state.player.position.y + 1 };
    state.floorMap.visible[target.y][target.x] = true;
    state.pendingShift = {
      ...pendingShift(),
      changes: [{ x: target.x, y: target.y, to: 'floor', shiftGroupId: 'arena_1' }],
    };
    state.shiftCountdown = 2;

    dispatchAction(state, { type: 'WAIT' });

    expect(state.entities[0].bossTarget).toEqual(target);
    state.player.position = target;
    const hp = state.player.hp;
    dispatchAction(state, { type: 'WAIT' });
    expect(state.player.hp).toBeLessThan(hp);
    expect(state.entities[0].bossCooldown).toBe(4);
  });

  it('gives the Null Testament a dodgeable refuge against the Unmaking', () => {
    const state = createNewGame('null-testament', createRunConfig('extreme', 'brutal'));
    buildFloor(state, new SeededRNG('null-testament-rng'), 25);
    const boss = state.entities[0];
    boss.position = { x: state.player.position.x + 2, y: state.player.position.y };
    state.pendingShift = pendingShift();
    state.shiftCountdown = 2;

    dispatchAction(state, { type: 'WAIT' });

    expect(state.entities[0].bossTarget).toBeDefined();
    const refuge = state.entities[0].bossTarget!;
    state.player.position = refuge;
    state.entities[0].position = { x: state.player.position.x + 5, y: state.player.position.y };
    state.shiftCountdown = 10;
    const shelteredHp = state.player.hp;
    dispatchAction(state, { type: 'WAIT' });
    expect(state.player.hp).toBe(shelteredHp);

    state.entities[0].bossCooldown = 0;
    state.entities[0].bossTarget = { x: state.player.position.x, y: state.player.position.y + 1 };
    state.player.position = { x: state.player.position.x + 2, y: state.player.position.y };
    const exposedHp = state.player.hp;
    dispatchAction(state, { type: 'WAIT' });
    expect(state.player.hp).toBeLessThan(exposedHp);
  });

  it('offers four lengths, each a whole number of five-floor regions', () => {
    const floors = Object.values(RUN_LENGTHS).map(l => l.floors);
    expect(floors).toEqual([10, 15, 20, 25]);
    for (const count of floors) expect(count % 5).toBe(0);
  });

  it('forces the longest run to brutal and leaves the others free', () => {
    expect(createRunConfig('extreme', 'gentle').difficulty).toBe('brutal');
    expect(createRunConfig('long', 'gentle').difficulty).toBe('gentle');
  });

  it('ends the run on the configured floor, not a hardcoded one', () => {
    const state = createNewGame('config-victory', createRunConfig('medium', 'standard'));
    expect(state.config.finalFloor).toBe(15);

    // Standing on the last floor's stairs is the win condition.
    state.floorMap.level = 15;
    const { x, y } = state.player.position;
    state.floorMap.tiles[y][x].type = 'stairs_down';
    state.entities = [];
    state.clearedRegions = [2];
    dispatchAction(state, { type: 'DESCEND' });

    expect(state.isVictory).toBe(true);
    expect(state.isGameOver).toBe(true);
  });

  it('descends past the old five-floor limit on a longer run', () => {
    const state = createNewGame('config-descend', createRunConfig('medium', 'standard'));
    state.floorMap.level = 5;
    const { x, y } = state.player.position;
    state.floorMap.tiles[y][x].type = 'stairs_down';
    state.entities = [];
    state.clearedRegions = [0];
    dispatchAction(state, { type: 'DESCEND' });

    expect(state.isVictory).toBe(false);
    expect(state.floorMap.level).toBe(6);
  });

  it('scales incoming damage by difficulty at a single choke point', () => {
    const hits = (difficulty: 'gentle' | 'standard' | 'brutal') => {
      const state = createMockGameState();
      state.config = createRunConfig('short', difficulty);
      damagePlayer(state, 20, []);
      return 100 - state.player.hp;
    };

    expect(hits('standard')).toBe(20);
    expect(hits('gentle')).toBe(14);
    expect(hits('brutal')).toBe(26);
  });

  it('never scales damage away entirely', () => {
    const state = createMockGameState();
    state.config = createRunConfig('short', 'gentle');
    damagePlayer(state, 1, []);
    expect(state.player.hp).toBe(99);
  });
});

describe('Ranged weapons', () => {
  it('fires instead of walking while a bow is aimed', () => {
    const state = createMockGameState();
    state.player.weapon = createItem('longbow', 'test_bow');
    state.player.weaponActive = true;
    const { dx, dy, x, y } = walkableStep(state);
    const from = { ...state.player.position };

    const { events } = dispatchAction(state, { type: 'MOVE', dx, dy });

    expect(state.player.position).toEqual(from);
    expect(state.player.position).not.toEqual({ x, y });
    expect(events.some(e => e.toLowerCase().includes('arrow'))).toBe(true);
  });

  it('walks normally once a bow is sheathed', () => {
    const state = createMockGameState();
    state.player.weapon = createItem('longbow', 'test_bow');
    state.player.weaponActive = false;
    const { dx, dy, x, y } = walkableStep(state);

    dispatchAction(state, { type: 'MOVE', dx, dy });

    expect(state.player.position).toEqual({ x, y });
  });

  it('toggles the aim stance for free, without spending a turn', () => {
    const state = createMockGameState();
    state.player.weapon = createItem('longbow', 'test_bow');
    const turnBefore = state.turnCount;

    dispatchAction(state, { type: 'TOGGLE_WEAPON' });
    expect(state.player.weaponActive).toBe(false);

    dispatchAction(state, { type: 'TOGGLE_WEAPON' });
    expect(state.player.weaponActive).toBe(true);
    expect(state.turnCount).toBe(turnBefore);
  });
});
