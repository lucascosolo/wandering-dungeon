import {
  ABILITY_COOLDOWN,
  SHIELD_BASE_FRACTION,
  SHIELD_BRACE_COUNTDOWN,
  SHIELD_BRACE_MULTIPLIER,
  SHIELD_DURATION,
  TELEGRAPH_COUNTDOWN,
} from '../core/engine';
import { ACTIONS, currentKeybinds, keyLabel } from './keybinds';
import { DISMISS_KEYS } from './modalGate';
import { escapeHtml } from './escapeHtml';
import { showOverlayScreen } from './overlayScreen';

/**
 * Every number and binding printed here is taken from the code that enforces it:
 *
 * - Shield strength, duration, cooldown, the brace window and the telegraph
 *   window are imported from `engine.ts` rather than written out, so the numbers
 *   on screen are the numbers the engine applies.
 * - Touch gestures are `SWIPE_THRESHOLD` and the tap handling in
 *   `src/ui/controls.ts` plus `tapTile` in `src/main.ts`.
 * - Desktop keys are rendered live from `currentKeybinds()`, so a rebind cannot
 *   make this panel lie.
 *
 * What is left in prose — the sealed arena, walks that break off, pressure
 * shortening the interval — is behaviour rather than a number. Check it against
 * `descend`, `stepTravelOnce` and `shiftInterval` before rewording any of it.
 */
/** 0.375 reads as "37.5%", 0.25 as "25%" — no trailing zero either way. */
function percent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(1))}%`;
}

function keyRows(): string {
  const binds = currentKeybinds();
  return ACTIONS.map(({ id, label }) => {
    const keys = binds[id];
    const printed = keys.length > 0 ? keys.map(k => escapeHtml(keyLabel(k))).join(' / ') : 'unbound';
    return `
      <div class="keybind">
        <span class="keybind__label">${label}</span>
        <span class="help__keys">${printed}</span>
      </div>`;
  }).join('');
}

export function howToPlayHtml(): string {
  return `
    <h2 class="setup__heading">How to Play</h2>

    <span class="setup__label">The run</span>
    <p class="help__body">
      Reality is coming apart, and each dungeon below you is a wound in it. You go
      down. Reaching the stairs on the last floor of the run ends it — that is the
      win, and there is no other one.
    </p>
    <p class="help__body">
      Every fifth floor is an arena, and it stays sealed until its guardian falls.
      Kill the guardian and that floor stops moving for good.
    </p>

    <span class="setup__label">The floor does not stay where you left it</span>
    <p class="help__body">
      The pill at the top of the screen counts your turns down to the next shift.
      When it reaches <strong>SHIFT IN ${TELEGRAPH_COUNTDOWN}</strong> the floor shows its hand:
      <span class="legend__warn legend__warn--close">red</span> tiles are closing,
      <span class="legend__warn legend__warn--open">violet</span> ones are opening
      or sliding. At zero the rooms and corridors move — with you, the monsters and
      the loot standing on them.
    </p>
    <p class="help__body">
      Linger on a floor and the shifts come faster. Stasis Flasks, Hourglass Shards
      and Haste Sigils all move that clock; the pill reads STASIS while one is
      holding, and STABLE on a floor whose guardian is dead.
    </p>

    <span class="setup__label">Fallout Shield</span>
    <p class="help__body">
      Your one ability. It absorbs damage equal to <strong>${percent(SHIELD_BASE_FRACTION)} of
      your maximum HP</strong>, holds for <strong>${SHIELD_DURATION} turns</strong>, then
      recharges for <strong>${ABILITY_COOLDOWN}</strong>.
    </p>
    <p class="help__body help__body--note">
      Raise it while the pill reads <strong>SHIFT IN ${SHIELD_BRACE_COUNTDOWN} or
      less</strong> and it comes up half again as strong —
      <strong>${percent(SHIELD_BASE_FRACTION * SHIELD_BRACE_MULTIPLIER)} of your maximum
      HP</strong> instead of ${percent(SHIELD_BASE_FRACTION)}. Bracing for a shift you can
      already see coming is the best trade in the game. (Armour that rolled
      <em>ponderous</em> adds to the recharge.)
    </p>

    <span class="setup__label">Touch</span>
    <div class="help__list">
      <div class="keybind"><span class="keybind__label">Move one tile</span><span class="help__keys">swipe &uarr; &darr; &larr; &rarr;</span></div>
      <div class="keybind"><span class="keybind__label">Step into the next tile, or hit whatever stands there</span><span class="help__keys">tap beside you</span></div>
      <div class="keybind"><span class="keybind__label">Walk to somewhere you have already seen</span><span class="help__keys">tap it</span></div>
      <div class="keybind"><span class="keybind__label">Wait &middot; Shield &middot; Items &middot; Descend</span><span class="help__keys">bottom buttons</span></div>
    </div>
    <p class="help__body help__body--note">
      A long walk stops itself the moment an enemy comes into view, you take a hit,
      or the way closes. It never routes through ground you have not explored.
    </p>

    <span class="setup__label">Keyboard</span>
    <div class="help__list">
      ${keyRows()}
      <div class="keybind"><span class="keybind__label">Close any panel</span><span class="help__keys">${DISMISS_KEYS.map(k => escapeHtml(keyLabel(k))).join(' / ')}</span></div>
    </div>
  `;
}

export function showHowToPlay(onBack: () => void): void {
  showOverlayScreen(howToPlayHtml(), onBack);
}
