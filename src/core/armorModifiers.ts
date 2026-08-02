import { ArmorModifier, ArmorModifierType, Item } from './state';
import { SeededRNG } from './rng';

/**
 * The rolled half of a piece of armor.
 *
 * Every effect is applied by the system it modifies — `shiftInterval` reads
 * `ballast`, `applyFalloutDamage` reads `bracing`, the enemy turn reads `thorns`
 * and `bulwark` — so nothing here knows about combat, and `damagePlayer` stays
 * the one HP-loss path without gaining a table of special cases.
 *
 * `ponderous` is the exception by design: its defense is folded into the piece's
 * own `defense` at roll time, because "more defense" *is* what `damagePlayer`
 * already does. Only its cost — a longer Fallout Shield recharge — is read live.
 */
interface ModifierSpec {
  name: string;
  /** Inclusive roll bounds for the modifier's single number. */
  min: number;
  max: number;
  describe(magnitude: number): string;
}

const MODIFIER_SPECS: Record<ArmorModifierType, ModifierSpec> = {
  bulwark: {
    name: 'Bulwark',
    min: 1,
    max: 2,
    describe: m => `Throws an attacker ${m} tile${m === 1 ? '' : 's'} back when it hits you.`,
  },
  thorns: {
    name: 'Thorned',
    min: 2,
    max: 5,
    describe: m => `Strikes back for ${m} whenever something hits you.`,
  },
  bracing: {
    name: 'Bracing',
    min: 20,
    max: 40,
    describe: m => `Shift fallout lands ${m}% softer.`,
  },
  ballast: {
    name: 'Ballast',
    min: 1,
    max: 2,
    describe: m => `Holds off ${m} tier${m === 1 ? '' : 's'} of a floor's mounting pressure.`,
  },
  prospecting: {
    name: 'Prospecting',
    min: 1,
    max: 2,
    describe: m => `Finds ${m} extra coin${m === 1 ? '' : 's'} on every kill and every pile.`,
  },
  ponderous: {
    name: 'Ponderous',
    min: 2,
    max: 3,
    describe: m => `The ${m} extra defense above is bought with ${m} more turns of Fallout Shield recharge.`,
  },
};

/**
 * Roll one modifier. Two draws off the run's generator, at drop-generation time,
 * so a seed still reproduces a run exactly — and so two pieces of the same tier
 * are two different pieces.
 *
 * `Object.keys` on a string-keyed object is insertion-ordered by spec, which is
 * what makes the type draw reproducible rather than merely arbitrary.
 */
export function rollArmorModifier(rng: SeededRNG): ArmorModifier {
  const types = Object.keys(MODIFIER_SPECS) as ArmorModifierType[];
  const type = types[rng.randomInt(0, types.length - 1)];
  const spec = MODIFIER_SPECS[type];
  return { type, magnitude: rng.randomInt(spec.min, spec.max) };
}

/** Extra defense a rolled `ponderous` folds into the piece it lands on. */
export function modifierDefenseBonus(modifier: ArmorModifier): number {
  return modifier.type === 'ponderous' ? modifier.magnitude : 0;
}

/**
 * How strongly `item` carries `type`, or 0 if it does not. Every consumer reads
 * armor through this, so "no armor", "armor without a modifier", and "armor with
 * a different one" are one branch instead of three at each call site.
 */
export function armorMagnitude(item: Item | null, type: ArmorModifierType): number {
  const modifier = item?.modifier;
  return modifier && modifier.type === type ? modifier.magnitude : 0;
}

export function modifierName(modifier: ArmorModifier): string {
  return MODIFIER_SPECS[modifier.type].name;
}

export function describeModifier(modifier: ArmorModifier): string {
  return MODIFIER_SPECS[modifier.type].describe(modifier.magnitude);
}

/** Name plus rolled number, for anywhere a piece of armor is named in one line. */
export function modifierLabel(modifier: ArmorModifier): string {
  return `${modifierName(modifier)} ${modifier.magnitude}`;
}
