import { GameState, Position } from './state';
import { DIFFICULTIES } from './runConfig';

/**
 * The single path by which the player loses HP, shared by combat and shift
 * fallout. It lives here rather than in engine.ts because shiftSystem needs it
 * too, and engine.ts already imports shiftSystem — importing back would cycle.
 *
 * Fallout used to carry its own copy of this logic and drifted: it drained the
 * shield without clearing the shield's remaining duration, which left the player
 * unable to raise a new one while the old, empty one was still nominally up.
 */
export function damagePlayer(
  state: GameState,
  amount: number,
  events: string[],
  source: string = 'the dungeon',
  /** Where the blow came from, when the source stands somewhere. */
  from: Position | null = null
): void {
  const { player } = state;
  state.lastDamageSource = source;

  // The one place the chosen difficulty is applied. Every source of player HP
  // loss already funnels through here, so scaling incoming damage covers all of
  // them without each one needing to know the difficulty exists.
  let remaining = Math.max(1, Math.round(amount * DIFFICULTIES[state.config.difficulty].damageTaken));

  // Armor soaks before the shield so a worn plate is worth something even when
  // the shield is down, but never to zero — no armor makes the player immune.
  const defense = player.armor?.defense ?? 0;
  if (defense > 0) {
    const soaked = Math.min(defense, remaining - 1);
    if (soaked > 0) {
      remaining -= soaked;
      events.push(`${player.armor!.name} turns aside ${soaked} damage.`);
    }
  }

  if (player.shieldHp > 0) {
    const absorbed = Math.min(player.shieldHp, remaining);
    player.shieldHp -= absorbed;
    remaining -= absorbed;
    events.push(`Fallout Shield absorbs ${absorbed} damage.`);

    // A depleted shield is gone, not merely empty — otherwise its remaining
    // duration would keep blocking the player from raising a new one.
    if (player.shieldHp === 0) {
      player.shieldTurnsRemaining = 0;
      events.push('Fallout Shield shatters.');
    }
  }

  if (remaining > 0) {
    player.hp = Math.max(0, player.hp - remaining);
    events.push(`You take ${remaining} damage.`);
  }

  // Recorded even when armor and shield ate all of it: a blow that landed and
  // cost nothing is still a blow, and the shell wants to show the block.
  state.combatHits.push({
    target: 'player',
    targetId: player.id,
    amount: remaining,
    x: player.position.x,
    y: player.position.y,
    from,
    lethal: player.hp <= 0,
  });
}
