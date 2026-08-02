import { showOverlayScreen } from './overlayScreen';

/**
 * The framing a run opens on, shown before the first turn and never on resume.
 *
 * It exists for the Pursuer. A thing that hunts you and cannot be fought only
 * frightens if you knew it was coming; met cold, it reads as a bug in the enemy
 * AI — the player's first thought is "why won't this die", not "run". So the
 * three facts it must land are the three the board cannot teach in time: the
 * floor moves, something is following, and the stairs are the answer to it.
 *
 * A prompt rather than a notification. The level-up and boss-defeat splashes in
 * `hud.ts` are `pointer-events: none` and fade on their own, which is right for
 * something that confirms what you just did and wrong for something you have to
 * read. `showOverlayScreen` already holds until dismissed and swallows keys in
 * capture phase, so the board behind it cannot act on the keypress that closes
 * it.
 */
const OPENING_HTML = `
  <h2 class="setup__heading">The Wandering Dungeon</h2>
  <p class="settings__hint">before the first step down</p>

  <div class="opening">
    <p>
      You are a wanderer, one blade and one lamp deep in a place that will not
      hold still.
    </p>
    <p>
      Walls close. Rooms slide. Floors open underneath you. You are given two
      turns' warning and never more, and the marked tiles are the whole of it.
    </p>
    <p>
      Something came down behind you. It does not hurry and it does not stop, and
      nothing you are carrying will kill it. Stay too long on a floor and it will
      arrive at the far end of it — you will see it come, through walls and dark
      alike, because it is the one thing this place never hides. The stairs are
      the only door it has never followed you through.
    </p>
    <p class="opening__charge">Go down. Do not settle.</p>
  </div>
`;

export function showOpeningSplash(onBegin: () => void): void {
  showOverlayScreen(OPENING_HTML, onBegin, 'Descend');
}
