import { describe, it, expect } from 'vitest';
import { dispatchAction } from '../src/core/engine';
import { damagePlayer } from '../src/core/damage';
import { Item } from '../src/core/state';
import { buildFloor, createNewGame } from '../src/core/game';
import { SeededRNG } from '../src/core/rng';
import { createRunConfig, RUN_LENGTHS } from '../src/core/runConfig';
import { findPath } from '../src/core/map/pathfinding';
import { createMockGameState, createMockEnemy } from './helpers';

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

  it('lets a Hinge Warden hold position during a shift telegraph', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 4), 'hinge_warden');
    const before = { ...enemy.position };
    state.entities.push(enemy);
    state.shiftCountdown = 3;
    state.pendingShift = pendingShift();

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(before);
  });

  it('lets a Hinge Warden resume pursuit outside a telegraph', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 4), 'hinge_warden');
    const before = { ...enemy.position };
    state.entities.push(enemy);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).not.toEqual(before);
  });

  it('keeps a Seam Skitter outside its normal aggro range', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 7), 'seam_skitter');
    const before = { ...enemy.position };
    state.entities.push(enemy);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(before);
  });

  it('lets a Seam Skitter rush during a shift telegraph', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 7), 'seam_skitter');
    const beforeDistance =
      Math.abs(enemy.position.x - state.player.position.x) +
      Math.abs(enemy.position.y - state.player.position.y);
    state.entities.push(enemy);
    state.shiftCountdown = 3;
    state.pendingShift = pendingShift();

    dispatchAction(state, { type: 'WAIT' });

    const afterDistance =
      Math.abs(enemy.position.x - state.player.position.x) +
      Math.abs(enemy.position.y - state.player.position.y);
    expect(afterDistance).toBeLessThan(beforeDistance);
  });

  it('keeps a Fracture Leech dormant until a shift is telegraphed', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 4), 'fracture_leech');
    const before = { ...enemy.position };
    state.entities.push(enemy);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(before);
  });

  it('lets a Fracture Leech pursue during a shift telegraph', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 4), 'fracture_leech');
    const before = { ...enemy.position };
    state.entities.push(enemy);
    state.shiftCountdown = 3;
    state.pendingShift = pendingShift();

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).not.toEqual(before);
  });

  it('draws a Riftbound toward the exit route', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyWithExitPath(state), 'riftbound');
    const before = { ...enemy.position };
    const beforePathLength = findPath(state.floorMap, before, state.floorMap.exit)?.length;
    state.entities.push(enemy);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).not.toEqual(before);
    expect(findPath(state.floorMap, enemy.position, state.floorMap.exit)?.length).toBeLessThan(beforePathLength!);
  });

  it('lets an Ashlock pursue the player without a sealing shift', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 4), 'ashlock');
    const before = { ...enemy.position };
    state.entities.push(enemy);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).not.toEqual(before);
  });

  it('sends an Ashlock toward the exit when a shift will seal it', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyWithExitPath(state), 'ashlock');
    const before = { ...enemy.position };
    const expectedStep = findPath(state.floorMap, before, state.floorMap.exit)![1];
    state.entities.push(enemy);
    state.shiftCountdown = 3;
    state.pendingShift = pendingShift('room_slide', true);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(expectedStep);
  });

  it('keeps a Stasis Scorcher outside its normal aggro range', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 7), 'stasis_scorcher');
    const before = { ...enemy.position };
    state.entities.push(enemy);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(before);
  });

  it('makes a Stasis Scorcher advance while the clock is frozen', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 7), 'stasis_scorcher');
    const before = { ...enemy.position };
    state.entities.push(enemy);
    state.isStasisActive = true;
    state.stasisTurnsRemaining = 2;

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).not.toEqual(before);
  });

  it('lets a Facet Reaver pursue the player on stable geometry', () => {
    const state = createMockGameState();
    const route = enemyWithDivergingPaths(state);
    const enemy = createMockEnemy(route.position, 'facet_reaver');
    state.entities.push(enemy);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(route.playerStep);
  });

  it('redirects a Facet Reaver to the exit during a telegraph', () => {
    const state = createMockGameState();
    const route = enemyWithDivergingPaths(state);
    const enemy = createMockEnemy(route.position, 'facet_reaver');
    state.entities.push(enemy);
    state.shiftCountdown = 3;
    state.pendingShift = pendingShift();

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(route.exitStep);
  });

  it('keeps a Glass Moth dormant until a shift is telegraphed', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 7), 'glass_moth');
    const before = { ...enemy.position };
    state.entities.push(enemy);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(before);
  });

  it('lets a Glass Moth pursue during a telegraph', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 7), 'glass_moth');
    const before = { ...enemy.position };
    state.entities.push(enemy);
    state.shiftCountdown = 3;
    state.pendingShift = pendingShift();

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).not.toEqual(before);
  });

  it('keeps a Glass Moth outside its telegraph aggro range', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 11), 'glass_moth');
    const before = { ...enemy.position };
    state.entities.push(enemy);
    state.shiftCountdown = 3;
    state.pendingShift = pendingShift();

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(before);
  });

  it('keeps an Unmaking Hound just outside its normal aggro range', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 8), 'unmaking_hound');
    const before = { ...enemy.position };
    state.entities.push(enemy);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(before);
  });

  it('makes an Unmaking Hound pursue during localized collapse', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 8), 'unmaking_hound');
    const before = { ...enemy.position };
    state.entities.push(enemy);
    state.shiftCountdown = 3;
    state.pendingShift = pendingShift('localized_collapse');

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).not.toEqual(before);
  });

  it('keeps a Null Scribe outside its normal aggro range', () => {
    const state = createMockGameState();
    const enemy = createMockEnemy(enemyAtDistance(state, 6), 'null_scribe');
    const before = { ...enemy.position };
    state.entities.push(enemy);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(before);
  });

  it('sends a Null Scribe toward the exit during a room slide', () => {
    const state = createMockGameState();
    const route = enemyWithDivergingPaths(state);
    const enemy = createMockEnemy(route.position, 'null_scribe');
    state.entities.push(enemy);
    state.shiftCountdown = 3;
    state.pendingShift = pendingShift('room_slide');

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(route.exitStep);
  });

  it('keeps a Null Scribe player-focused during a corridor reconnect', () => {
    const state = createMockGameState();
    const position = enemyAtDistance(state, 4);
    const enemy = createMockEnemy(position, 'null_scribe');
    const before = { ...enemy.position };
    state.entities.push(enemy);
    state.shiftCountdown = 3;
    state.pendingShift = pendingShift('corridor_reconnect');

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).not.toEqual(before);
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

  /** Walkable neighbour of the player, so the test moves rather than bumps a wall. */
  function stepTarget(state: ReturnType<typeof createMockGameState>) {
    const { x, y } = state.player.position;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const type = state.floorMap.tiles[y + dy]?.[x + dx]?.type;
      if (type === 'floor' || type === 'door') return { dx, dy, x: x + dx, y: y + dy };
    }
    throw new Error('player is walled in');
  }

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
