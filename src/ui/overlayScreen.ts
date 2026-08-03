import { isDismissKey } from './modalGate';
import { escapeHtml } from './escapeHtml';

/**
 * A full-screen reference panel, mounted on `document.body` like the title and
 * settings screens and for the same reason — `mountUI` owns `#app`'s innerHTML
 * outright, so anything nested inside it is wiped when a run starts.
 *
 * These are reachable from the title screen *and* from inside a run, which is
 * why the keydown listener is capture phase and swallows everything: the game
 * shell's own listener stays attached for the life of the page, so an
 * unswallowed keypress would act on the board behind the panel. The in-run menu
 * underneath already blocks input through `modalGate`, but this screen also
 * opens straight off the title, where there is no modal to do it.
 */
export function showOverlayScreen(
  bodyHtml: string,
  onBack: () => void,
  backLabel = 'Back'
): void {
  const screen = document.createElement('div');
  screen.className = 'title-screen';
  document.body.appendChild(screen);

  screen.innerHTML = `
    <div class="title-screen__inner settings__inner panel__inner">
      <div class="panel__body">${bodyHtml}</div>
      <div class="title-screen__menu">
        <button class="title-btn title-btn--primary" data-overlay-back type="button">${escapeHtml(backLabel)}</button>
      </div>
    </div>
  `;

  function close(): void {
    window.removeEventListener('keydown', onKeyDown, true);
    screen.remove();
    onBack();
  }

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isDismissKey(e.key.toLowerCase())) close();
  };

  screen.querySelector('[data-overlay-back]')!.addEventListener('click', close);
  // Tapping outside the column closes, matching the modal backdrops. `e.target
  // === screen` keeps a tap on the panel itself from closing it.
  screen.addEventListener('click', e => {
    if (e.target === screen) close();
  });
  window.addEventListener('keydown', onKeyDown, true);
}
