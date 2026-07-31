import {
  createRunConfig,
  DIFFICULTIES,
  Difficulty,
  FORCED_BRUTAL_LENGTH,
  RunConfig,
  RunLength,
  RUN_LENGTHS,
} from '../core/runConfig';
import { showSettingsScreen } from './settingsScreen';

export interface TitleScreenHandlers {
  onNewGame: (config: RunConfig) => void;
}

const LENGTH_ORDER: RunLength[] = ['short', 'medium', 'long', 'extreme'];
const DIFFICULTY_ORDER: Difficulty[] = ['gentle', 'standard', 'brutal'];

/**
 * Mounted on `document.body` rather than into `#app`, because `mountUI` owns
 * `#app`'s innerHTML outright — a title screen living inside it would be wiped
 * the moment a run starts.
 */
export function showTitleScreen(handlers: TitleScreenHandlers): void {
  const screen = document.createElement('div');
  screen.className = 'title-screen';
  document.body.appendChild(screen);

  let length: RunLength = 'short';
  let difficulty: Difficulty = 'standard';

  function close(): void {
    screen.remove();
  }

  function renderMenu(): void {
    screen.innerHTML = `
      <div class="title-screen__inner">
        <pre class="title-screen__mark">#####
#@..&gt;
#.+.#
#####</pre>
        <h1 class="title-screen__name">The Wandering Dungeon</h1>
        <p class="title-screen__tagline">the floor does not stay where you left it</p>

        <div class="title-screen__menu">
          <button class="title-btn title-btn--primary" id="btn-new-game" type="button">
            New Game
          </button>
          <button class="title-btn" id="btn-continue" type="button" disabled>
            Continue
            <small>no run in progress</small>
          </button>
          <button class="title-btn" id="btn-settings" type="button">
            Settings
            <small>controls</small>
          </button>
        </div>
      </div>
    `;
    screen.querySelector('#btn-new-game')!.addEventListener('click', renderSetup);
    // Settings stacks on top rather than replacing the menu, so backing out of it
    // needs no state — this screen is still underneath, untouched.
    screen.querySelector('#btn-settings')!.addEventListener('click', () =>
      showSettingsScreen(() => {})
    );
  }

  function renderSetup(): void {
    // EXTREME is a brutal-only badge, so the difficulty row is shown locked
    // rather than hidden — the constraint is part of what makes it a badge.
    const locked = length === FORCED_BRUTAL_LENGTH;
    const shown: Difficulty = locked ? 'brutal' : difficulty;
    const floors = RUN_LENGTHS[length].floors;

    screen.innerHTML = `
      <div class="title-screen__inner">
        <h2 class="setup__heading">New Run</h2>

        <span class="setup__label">Length</span>
        <div class="setup__options">
          ${LENGTH_ORDER.map(
            key => `
            <button class="setup-btn ${key === length ? 'setup-btn--on' : ''}"
                    data-length="${key}" type="button">
              ${RUN_LENGTHS[key].label}
              <small>${RUN_LENGTHS[key].floors} floors</small>
            </button>`
          ).join('')}
        </div>

        <span class="setup__label">Difficulty${locked ? ' — locked by EXTREME' : ''}</span>
        <div class="setup__options ${locked ? 'setup__options--locked' : ''}">
          ${DIFFICULTY_ORDER.map(
            key => `
            <button class="setup-btn ${key === shown ? 'setup-btn--on' : ''}"
                    data-difficulty="${key}" type="button" ${locked ? 'disabled' : ''}>
              ${DIFFICULTIES[key].label}
            </button>`
          ).join('')}
        </div>

        <p class="setup__summary">
          ${floors} floors &middot; ${DIFFICULTIES[shown].label} &middot;
          ${Math.round(DIFFICULTIES[shown].damageTaken * 100)}% damage taken
        </p>

        <div class="title-screen__menu">
          <button class="title-btn title-btn--primary" id="btn-begin" type="button">Descend</button>
          <button class="title-btn" id="btn-back" type="button">Back</button>
        </div>
      </div>
    `;

    screen.querySelectorAll<HTMLButtonElement>('[data-length]').forEach(btn =>
      btn.addEventListener('click', () => {
        length = btn.dataset.length as RunLength;
        renderSetup();
      })
    );
    screen.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(btn =>
      btn.addEventListener('click', () => {
        difficulty = btn.dataset.difficulty as Difficulty;
        renderSetup();
      })
    );
    screen.querySelector('#btn-back')!.addEventListener('click', renderMenu);
    screen.querySelector('#btn-begin')!.addEventListener('click', () => {
      close();
      handlers.onNewGame(createRunConfig(length, difficulty));
    });
  }

  renderMenu();
}
