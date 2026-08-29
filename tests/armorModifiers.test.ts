import { describe, it, expect } from 'vitest';
import { createArmor, coinsPerKill, createCoinCache, createNewGame, xpPerKill } from '../src/core/game';
import { armorMagnitude, describeModifier, modifierLabel, rollArmorModifier } from '../src/core/armorModifiers';
import { dispatchAction } from '../src/core/engine';
import { executeShift, shiftInterval, floorPressure } from '../src/core/shift/shiftSystem';
import { decodeRun, encodeRun } from '../src/core/save';
import { SeededRNG } from '../src/core/rng';
import { createRunConfig } from '../src/core/runConfig';
import { ArmorModifierType, GameState, Item, Position } from '../src/core/state';
import { createMockGameState, createMockEnemy } from './helpers';

/** A piece carrying exactly one modifier, with the defense left out of the way. */
function modifiedArmor(type: ArmorModifierType, magnitude: number, defense = 0): Item {
  return {
    id: `test_${type}`,
    type: 'padded_vest',
    name: 'Test Vest',
    description: '',
    category: 'armor',
    defense,
    modifier: { type, magnitude },
  };
}

/** Open a box of floor around the player so a shove has somewhere to go. */
function clearArea(state: GameState, radius: number): void {
  const { x, y } = state.player.position;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const row = state.floorMap.tiles[y + dy];
      if (row?.[x + dx]) row[x + dx].type = 'floor';
    }
  }
}

/** One enemy standing east of the player, which is the direction a shove sends it. */
function attackerEastOfPlayer(state: GameState, hp = 40) {
  const enemy = createMockEnemy({ x: state.player.position.x + 1, y: state.player.position.y });
  enemy.hp = hp;
  enemy.maxHp = Math.max(hp, enemy.maxHp);
  state.entities.push(enemy);
  return enemy;
}

describe('Armor modifiers — the roll', () => {
  it('is reproducible from the run seed alone', () => {
    const a = createArmor('warden_carapace', 'armor_7', new SeededRNG('same-run'));
    const b = createArmor('warden_carapace', 'armor_7', new SeededRNG('same-run'));
    expect(a.modifier).toEqual(b.modifier);
    expect(a.defense).toBe(b.defense);
  });

  it('does not spend the floor generator\'s stream', () => {
    // The whole reason the roll is derived: two draws taken from the floor's own
    // generator re-phase everything it rolls afterwards, and the completability
    // bot walks a different dungeon for it.
    const rng = new SeededRNG('stream');
    rng.randomInt(0, 10);
    const before = rng.getCallCount();
    createArmor('padded_vest', 'armor_1', rng);
    expect(rng.getCallCount()).toBe(before);
  });

  it('rolls on the piece, so two of a tier are two different pieces', () => {
    const rng = new SeededRNG('variety');
    const rolled = Array.from({ length: 25 }, (_, i) =>
      createArmor('warden_carapace', `armor_${i + 1}`, rng)
    ).map(piece => `${piece.modifier!.type}:${piece.modifier!.magnitude}`);

    expect(new Set(rolled).size).toBeGreaterThan(1);
  });

  it('draws every modifier in the table over enough rolls', () => {
    const rng = new SeededRNG('coverage');
    const seen = new Set(
      Array.from({ length: 400 }, () => rollArmorModifier(rng).type)
    );
    expect(seen).toEqual(
      new Set(['bulwark', 'thorns', 'bracing', 'ballast', 'prospecting', 'ponderous'])
    );
  });

  it('folds a ponderous roll into the piece\'s own defense', () => {
    const rng = new SeededRNG('ponderous-hunt');
    let found: Item | undefined;
    for (let i = 0; i < 200 && !found; i++) {
      const piece = createArmor('padded_vest', `armor_${i}`, rng);
      if (piece.modifier?.type === 'ponderous') found = piece;
    }
    expect(found, 'no ponderous roll in 200 pieces').toBeDefined();
    // Padded Vest is 2 defense before the roll adds its own.
    expect(found!.defense).toBe(2 + found!.modifier!.magnitude);
  });

  it('names and describes every modifier it can roll', () => {
    const rng = new SeededRNG('describe');
    for (let i = 0; i < 60; i++) {
      const modifier = rollArmorModifier(rng);
      expect(modifierLabel(modifier)).toMatch(/\w+ \d+/);
      expect(describeModifier(modifier).length).toBeGreaterThan(10);
    }
  });

  it('puts a rolled piece on a real floor and keeps it through a save', () => {
    const state = createNewGame('rolled-floor', createRunConfig('short', 'standard'));
    const piece = state.floorMap.drops!.find(d => d.item.category === 'armor')!.item;
    expect(piece.modifier).toBeDefined();

    state.player.armor = piece;
    const resumed = decodeRun(encodeRun(state))!;
    expect(resumed.player.armor?.modifier).toEqual(piece.modifier);
  });

  it('decodes a run saved before modifiers existed as unmodified armor', () => {
    const state = createMockGameState();
    state.player.armor = modifiedArmor('thorns', 4, 3);
    const saved = encodeRun(state);
    delete (saved.state.player.armor as Partial<Item>).modifier;
    delete (saved.state as Partial<GameState>).armorReactions;

    const resumed = decodeRun(saved)!;
    expect(resumed.player.armor?.modifier).toBeUndefined();
    expect(resumed.player.armor?.defense).toBe(3);
    expect(resumed.armorReactions).toEqual([]);
    expect(armorMagnitude(resumed.player.armor, 'thorns')).toBe(0);
  });
});

describe('Armor modifiers — thorns', () => {
  it('bites the attacker for the rolled amount when it hits you', () => {
    const state = createMockGameState('thorns-bite');
    state.player.armor = modifiedArmor('thorns', 5);
    const enemy = attackerEastOfPlayer(state);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.hp).toBe(35);
    expect(state.player.hp).toBeLessThan(state.player.maxHp);
  });

  it('pays a thorns kill exactly like any other kill', () => {
    const state = createMockGameState('thorns-kill');
    state.player.armor = modifiedArmor('thorns', 5);
    const enemy = attackerEastOfPlayer(state, 3);
    const coins = state.player.coins;

    const { events } = dispatchAction(state, { type: 'WAIT' });

    expect(enemy.hp).toBe(0);
    expect(state.entities.find(e => e.id === enemy.id)).toBeUndefined();
    // Same payout, same sentence, same code — the run log and the level curve
    // cannot tell a thorns kill from a swing.
    expect(state.player.coins).toBe(coins + coinsPerKill(0, false));
    expect(state.player.xp).toBe(xpPerKill('crawler', 0));
    expect(events.some(e => e.includes(`${enemy.name} is destroyed`))).toBe(true);
    expect(events.some(e => e.includes('XP and collect'))).toBe(true);
  });

  it('does not fire once the blow has killed the player', () => {
    const state = createMockGameState('thorns-dead');
    state.player.armor = modifiedArmor('thorns', 5);
    state.player.hp = 1;
    const enemy = attackerEastOfPlayer(state);

    dispatchAction(state, { type: 'WAIT' });

    expect(state.isGameOver).toBe(true);
    expect(enemy.hp).toBe(40);
  });

  it('reports the tile it fired on, for one turn only', () => {
    const state = createMockGameState('thorns-tell');
    state.player.armor = modifiedArmor('thorns', 2);
    const enemy = attackerEastOfPlayer(state);
    const at = { ...enemy.position };

    dispatchAction(state, { type: 'WAIT' });
    expect(state.armorReactions).toContainEqual({ kind: 'thorns', x: at.x, y: at.y });

    state.entities = [];
    dispatchAction(state, { type: 'WAIT' });
    expect(state.armorReactions).toEqual([]);
  });
});

describe('Armor modifiers — knockback', () => {
  it('throws the attacker one tile directly away', () => {
    const state = createMockGameState('shove-basic');
    clearArea(state, 3);
    state.player.armor = modifiedArmor('bulwark', 1);
    const enemy = attackerEastOfPlayer(state);
    const from = { ...enemy.position };

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual({ x: from.x + 1, y: from.y });
    expect(state.armorReactions).toContainEqual({ kind: 'bulwark', ...enemy.position });
  });

  it('throws it the full rolled distance when the room allows', () => {
    const state = createMockGameState('shove-two');
    clearArea(state, 4);
    state.player.armor = modifiedArmor('bulwark', 2);
    const enemy = attackerEastOfPlayer(state);
    const from = { ...enemy.position };

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual({ x: from.x + 2, y: from.y });
  });

  it('stops at a wall instead of pushing through it', () => {
    const state = createMockGameState('shove-wall');
    clearArea(state, 3);
    state.player.armor = modifiedArmor('bulwark', 2);
    const enemy = attackerEastOfPlayer(state);
    const from = { ...enemy.position };
    // One tile of room, then wall: the shove takes the step it can and stops.
    state.floorMap.tiles[from.y][from.x + 2].type = 'wall';

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual({ x: from.x + 1, y: from.y });
  });

  it('leaves an attacker with nowhere to go exactly where it stood', () => {
    const state = createMockGameState('shove-blocked');
    clearArea(state, 3);
    state.player.armor = modifiedArmor('bulwark', 2);
    const enemy = attackerEastOfPlayer(state);
    const from = { ...enemy.position };
    state.floorMap.tiles[from.y][from.x + 1].type = 'wall';

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(from);
    // Nothing moved, so nothing sparks — a tell for an effect that did not happen
    // is worse than no tell at all.
    expect(state.armorReactions).toEqual([]);
  });

  it('never shoves one enemy onto another', () => {
    const state = createMockGameState('shove-occupied');
    clearArea(state, 3);
    state.player.armor = modifiedArmor('bulwark', 2);
    const enemy = attackerEastOfPlayer(state);
    const from = { ...enemy.position };
    const bystander = createMockEnemy({ x: from.x + 1, y: from.y }, 'sentinel');
    // Staggered so it takes no turn of its own and cannot wander out of the way.
    bystander.staggeredTurns = 99;
    state.entities.push(bystander);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(from);
    expect(bystander.position).toEqual({ x: from.x + 1, y: from.y });
  });

  it('never shoves an attacker off the map', () => {
    const state = createMockGameState('shove-edge');
    const { floorMap } = state;
    const y = state.player.position.y;
    // Stand the pair on the last two columns, so the only step is off the grid.
    state.player.position = { x: floorMap.width - 2, y };
    floorMap.tiles[y][floorMap.width - 2].type = 'floor';
    floorMap.tiles[y][floorMap.width - 1].type = 'floor';
    state.player.armor = modifiedArmor('bulwark', 2);
    const enemy = attackerEastOfPlayer(state);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual({ x: floorMap.width - 1, y });
  });

  it('never shoves an attacker onto the player', () => {
    const state = createMockGameState('shove-direction');
    clearArea(state, 3);
    state.player.armor = modifiedArmor('bulwark', 2);
    const player = { ...state.player.position };
    const enemy = attackerEastOfPlayer(state);

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).not.toEqual(state.player.position);
    expect(enemy.position.x).toBeGreaterThan(player.x);
  });

  it('does not shove a boss, so melee can still land a second hit', () => {
    const state = createMockGameState('shove-vs-boss');
    clearArea(state, 3);
    state.player.armor = modifiedArmor('bulwark', 2);
    const enemy = attackerEastOfPlayer(state);
    enemy.isBoss = true;
    const from = { ...enemy.position };

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.position).toEqual(from);
    expect(state.armorReactions.some(r => r.kind === 'bulwark')).toBe(false);
  });

  it('does not shove a corpse when thorns got there first', () => {
    const state = createMockGameState('shove-vs-thorns');
    clearArea(state, 3);
    state.player.armor = { ...modifiedArmor('thorns', 5), modifier: { type: 'thorns', magnitude: 5 } };
    const enemy = attackerEastOfPlayer(state, 2);
    const from = { ...enemy.position };

    dispatchAction(state, { type: 'WAIT' });

    expect(enemy.hp).toBe(0);
    expect(enemy.position).toEqual(from);
    expect(state.armorReactions.some(r => r.kind === 'bulwark')).toBe(false);
  });
});

describe('Armor modifiers — the quiet three', () => {
  it('bracing takes its percentage off shift fallout only', () => {
    const lost = (armor: Item | null): number => {
      const state = createMockGameState('bracing');
      state.player.armor = armor;
      const at: Position = { ...state.player.position };
      state.pendingShift = {
        type: 'localized_collapse',
        targetGroupId: null,
        changes: [{ x: at.x, y: at.y, to: 'chasm', shiftGroupId: null }],
        groupMoves: {},
        blocksExit: false,
      };
      const before = state.player.hp;
      executeShift(state, new SeededRNG('bracing-rng'));
      return before - state.player.hp;
    };

    const bare = lost(modifiedArmor('thorns', 1));
    const braced = lost(modifiedArmor('bracing', 40));
    expect(bare).toBeGreaterThan(0);
    expect(braced).toBeLessThan(bare);
  });

  it('ballast blunts a floor\'s mounting pressure but never lifts the interval', () => {
    const state = createMockGameState('ballast');
    // Two tiers in, where the interval has come down but not yet hit its floor.
    state.floorTurns = 70;
    expect(floorPressure(state.floorTurns)).toBe(2);

    const bare = shiftInterval(state);
    state.player.armor = modifiedArmor('ballast', 2);
    const held = shiftInterval(state);

    expect(held).toBeGreaterThan(bare);
    // It gives back turns pressure took; it never hands out turns of its own.
    expect(held).toBeLessThanOrEqual(state.nextShiftCountdownMax);
    state.floorTurns = 500;
    expect(shiftInterval(state)).toBeLessThanOrEqual(state.nextShiftCountdownMax);

    // A fresh floor has no pressure to blunt, so ballast is worth nothing there.
    state.floorTurns = 0;
    expect(shiftInterval(state)).toBe(state.nextShiftCountdownMax);
  });

  it('prospecting adds to every kill and every pile', () => {
    const state = createMockGameState('prospecting');
    state.player.armor = modifiedArmor('prospecting', 2);
    const { x, y } = state.player.position;

    const enemy = createMockEnemy({ x: x + 1, y });
    enemy.hp = 1;
    state.entities.push(enemy);
    const before = state.player.coins;
    dispatchAction(state, { type: 'MOVE', dx: 1, dy: 0 });
    expect(state.player.coins).toBe(before + coinsPerKill(0, false) + 2);

    // And on a pile walked over, which is a different code path entirely.
    const step = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ].find(d => {
      const type = state.floorMap.tiles[y + d.dy]?.[x + d.dx]?.type;
      return type === 'floor' || type === 'door';
    })!;
    state.floorMap.drops = [
      { item: createCoinCache(3, 'pile'), position: { x: x + step.dx, y: y + step.dy } },
    ];
    const purse = state.player.coins;
    dispatchAction(state, { type: 'MOVE', ...step });
    expect(state.player.coins).toBe(purse + 3 + 2);
  });

  it('ponderous buys its defense with a longer shield recharge', () => {
    const bare = createMockGameState('ponderous-bare');
    dispatchAction(bare, { type: 'ABILITY' });

    const heavy = createMockGameState('ponderous-heavy');
    heavy.player.armor = modifiedArmor('ponderous', 3, 5);
    dispatchAction(heavy, { type: 'ABILITY' });

    // Both spent a turn raising it, so the comparison is like for like.
    expect(heavy.abilityCooldown).toBe(bare.abilityCooldown + 3);
  });
});
