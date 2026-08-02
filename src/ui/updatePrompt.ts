/**
 * "A new version is ready" — shown when a new build has installed and is
 * waiting behind the one being played.
 *
 * Modelled on the title screen's panel vocabulary (`glass-panel`, `title-btn`)
 * rather than on `showLevelUp`'s toasts: those are `pointer-events: none` by
 * design, and this one has to be tappable. It is not a modal — the game stays
 * fully playable underneath, because the whole point is that the player chooses
 * when to take the reload. A forced reload mid-run is a lost run.
 */

let prompt: HTMLElement | null = null;

export function showUpdatePrompt(onReload: () => void): void {
  // One at a time. Two builds can land during a long session, and the second
  // notice would otherwise stack on top of the first.
  if (prompt) return;

  const el = document.createElement('div');
  prompt = el;
  el.className = 'update-prompt glass-panel';
  el.innerHTML = `
    <p class="update-prompt__text">A new version of the dungeon is ready.</p>
    <div class="update-prompt__actions">
      <button class="title-btn title-btn--primary" id="btn-update-reload" type="button">
        Reload
        <small>your run is saved</small>
      </button>
      <button class="title-btn" id="btn-update-later" type="button">
        Later
        <small>finish this run first</small>
      </button>
    </div>
  `;

  el.querySelector('#btn-update-reload')!.addEventListener('click', () => {
    dismiss();
    onReload();
  });
  el.querySelector('#btn-update-later')!.addEventListener('click', dismiss);

  document.body.appendChild(el);
}

function dismiss(): void {
  prompt?.remove();
  prompt = null;
}
