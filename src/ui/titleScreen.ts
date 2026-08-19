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
import { showHowToPlay } from './howToPlay';
import { GameState } from '../core/state';
import { BUILD_LABEL } from '../buildInfo';
import { openSupportPage, SUPPORT_LABEL } from './support';

export interface TitleScreenHandlers {
  onNewGame: (config: RunConfig) => void;
  onContinue: (saved: GameState) => void;
  /** The run in progress, already loaded — null when there is none. */
  saved: GameState | null;
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

  // Particle canvas behind the title content
  const canvas = document.createElement('canvas');
  canvas.className = 'title-screen__particles';
  screen.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  let animId = 0;

  function resizeCanvas(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Falling debris fragments
  interface Fragment {
    x: number; y: number;
    w: number; h: number;
    vx: number; vy: number;
    rot: number; rotV: number;
    alpha: number;
    color: string;
  }

  const fragments: Fragment[] = [];
  const COLORS = ['#4af', '#c99bff', '#f7b32b', '#e09f3e', '#ff6b35'];

  function spawnFragment(): void {
    fragments.push({
      x: Math.random() * canvas.width,
      y: -20,
      w: 4 + Math.random() * 10,
      h: 4 + Math.random() * 10,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 0.5 + Math.random() * 1.2,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.04,
      alpha: 0.3 + Math.random() * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
  }

  function animateParticles(): void {
    // Spawn 2-3 new fragments per frame
    for (let i = 0; i < 3; i++) spawnFragment();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = fragments.length - 1; i >= 0; i--) {
      const f = fragments[i];
      f.x += f.vx;
      f.y += f.vy;
      f.rot += f.rotV;
      f.alpha -= 0.003;

      if (f.alpha <= 0 || f.y > canvas.height + 20) {
        fragments.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.globalAlpha = Math.max(0, f.alpha);
      ctx.fillStyle = f.color;
      ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
      ctx.restore();
    }

    // Cap fragments to avoid memory issues
    if (fragments.length > 200) fragments.splice(0, fragments.length - 200);

    animId = requestAnimationFrame(animateParticles);
  }
  animId = requestAnimationFrame(animateParticles);

  const { saved } = handlers;
  let length: RunLength = 'short';
  let difficulty: Difficulty = 'standard';

  function close(): void {
    cancelAnimationFrame(animId);
    window.removeEventListener('resize', resizeCanvas);
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

        <div class="title-screen__menu title-screen__menu--main">
          <button class="title-btn title-btn--primary" id="btn-new-game" type="button">
            New Game
          </button>
          <button class="title-btn" id="btn-continue" type="button" ${saved ? '' : 'disabled'}>
            Continue
            <small>${
              saved
                ? `floor ${saved.floorMap.level}/${saved.config.finalFloor} &middot; turn ${saved.turnCount}`
                : 'no run in progress'
            }</small>
          </button>
          <button class="title-btn" id="btn-how-to-play" type="button">
            How to Play
            <small>the goal &middot; controls &middot; the shift</small>
          </button>
          <button class="title-btn" id="btn-settings" type="button">
            Settings
            <small>controls &middot; appearance</small>
          </button>
          <button class="title-btn" id="btn-support" type="button">
            ${SUPPORT_LABEL}
            <small>opens in a new tab &middot; nothing is gated</small>
          </button>
        </div>
      </div>
      <p class="title-screen__build">${BUILD_LABEL}</p>
    `;
    screen.querySelector('#btn-new-game')!.addEventListener('click', renderSetup);
    if (saved) {
      screen.querySelector('#btn-continue')!.addEventListener('click', () => {
        close();
        handlers.onContinue(saved);
      });
    }
    // These stack on top rather than replacing the menu, so backing out of one
    // needs no state — this screen is still underneath, untouched.
    screen.querySelector('#btn-how-to-play')!.addEventListener('click', () =>
      showHowToPlay(() => {})
    );
    screen.querySelector('#btn-settings')!.addEventListener('click', () =>
      showSettingsScreen(() => {})
    );
    screen.querySelector('#btn-support')!.addEventListener('click', openSupportPage);
  }

  function renderSetup(): void {
    // EXTREME is a brutal-only badge, so the difficulty row is shown locked
    // rather than hidden — the constraint is part of what makes it a badge.
    const locked = length === FORCED_BRUTAL_LENGTH;
    const shown: Difficulty = locked ? 'brutal' : difficulty;
    const floors = RUN_LENGTHS[length].floors;

    screen.innerHTML = `
      <div class="title-screen__inner title-screen__inner--wide">
        <h2 class="setup__heading">New Run</h2>

        <div class="setup__groups">
          <div class="setup__group">
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
          </div>

          <div class="setup__group">
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
          </div>
        </div>

        <p class="setup__summary">
          ${floors} floors &middot; ${DIFFICULTIES[shown].label} &middot;
          ${Math.round(DIFFICULTIES[shown].damageTaken * 100)}% damage taken
        </p>

        <div class="title-screen__menu title-screen__menu--row">
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
      // There is one save slot, so starting a run destroys the one in progress.
      // Losing a twenty-floor run to a mistapped button is not recoverable.
      if (saved) renderOverwriteWarning();
      else begin();
    });
  }

  function begin(): void {
    close();
    handlers.onNewGame(createRunConfig(length, difficulty));
  }

  function renderOverwriteWarning(): void {
    screen.innerHTML = `
      <div class="title-screen__inner title-screen__inner--wide">
        <h2 class="setup__heading">Abandon your run?</h2>
        <p class="setup__summary">
          A run is in progress on floor ${saved!.floorMap.level}/${saved!.config.finalFloor},
          turn ${saved!.turnCount}. Starting a new one erases it.
        </p>

        <div class="title-screen__menu title-screen__menu--row">
          <button class="title-btn title-btn--danger" id="btn-overwrite" type="button">
            Erase and descend
          </button>
          <button class="title-btn title-btn--primary" id="btn-keep" type="button">Keep it</button>
        </div>
      </div>
    `;
    screen.querySelector('#btn-overwrite')!.addEventListener('click', begin);
    screen.querySelector('#btn-keep')!.addEventListener('click', renderSetup);
  }

  renderMenu();
}
