import { GameState } from './state';

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
  source: string = 'the dungeon'
): void {
  let remaining = amount;
  const { player } = state;
  state.lastDamageSource = source;

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
}
