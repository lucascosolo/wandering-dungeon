export interface TitleScreenHandlers {
  onNewGame: () => void;
}

/**
 * Mounted on `document.body` rather than into `#app`, because `mountUI` owns
 * `#app`'s innerHTML outright — a title screen living inside it would be wiped
 * the moment a run starts.
 */
export function showTitleScreen(handlers: TitleScreenHandlers): void {
  const screen = document.createElement('div');
  screen.className = 'title-screen';
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
        <button class="title-btn" id="btn-settings" type="button" disabled>
          Settings
          <small>not yet</small>
        </button>
      </div>
    </div>
  `;

  screen.querySelector<HTMLButtonElement>('#btn-new-game')!.addEventListener('click', () => {
    screen.remove();
    handlers.onNewGame();
  });

  document.body.appendChild(screen);
}
