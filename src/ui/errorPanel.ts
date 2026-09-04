import { clearRun } from '../core/save';
import { clearCosmetic } from '../cosmetics';
import { clearSoundSetting } from '../audio/sfx';
import { clearKeybinds } from './keybinds';

/**
 * The escape hatch of last resort.
 *
 * An alpha tester on a phone cannot open a console, cannot clear IndexedDB and
 * cannot tell a crashed game from a slow one — every one of those failures reads
 * as "the app is just black". This panel is the only thing standing between them
 * and a permanently dead install, so it is built out of nothing but `document`
 * and `body`: no HUD element, no canvas, no run, and no successful boot are
 * required for it to appear.
 */

let panel: HTMLElement | null = null;

function describe(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  if (typeof cause === 'string') return cause;
  try {
    return JSON.stringify(cause) ?? String(cause);
  } catch {
    return String(cause);
  }
}

async function resetSave(): Promise<void> {
  // Every store, because any one of them can be what is wedging the boot. None
  // of these reject — they report through the console — so the reload always runs.
  await clearRun();
  await clearKeybinds();
  await clearCosmetic();
  await clearSoundSetting();
  window.location.reload();
}

/**
 * Show the panel and log the cause. The console line is not redundant with the
 * panel: the panel carries one summary line for the tester, the console carries
 * the stack for whoever reads the bug report.
 */
export function showErrorPanel(headline: string, cause: unknown): void {
  console.error(headline, cause);

  // First failure wins. A broken render loop or a broken turn can raise this
  // several times before it is stopped, and a stack of identical panels would
  // bury the buttons that are the whole point of it.
  if (panel) return;

  const el = document.createElement('div');
  panel = el;
  el.className = 'error-panel';
  el.innerHTML = `
    <div class="error-panel__inner">
      <pre class="error-panel__mark">#####
#@..X
#.!.#
#####</pre>
      <h1 class="error-panel__title">Something broke</h1>
      <p class="error-panel__headline"></p>
      <p class="error-panel__detail"></p>
      <div class="title-screen__menu">
        <button class="title-btn title-btn--primary" id="btn-error-reload" type="button">
          Reload
          <small>keeps your saved run</small>
        </button>
        <button class="title-btn title-btn--danger" id="btn-error-reset" type="button">
          Reset Save
          <small>erases the run and your key bindings, then reloads</small>
        </button>
      </div>
      <p class="error-panel__note">
        If reloading lands you here again, Reset Save should get you back to the
        title screen. Please send the message above with your report.
      </p>
    </div>
  `;
  // textContent, not innerHTML: an error message can contain anything, including
  // markup that would rewrite this panel out from under the buttons.
  el.querySelector('.error-panel__headline')!.textContent = headline;
  el.querySelector('.error-panel__detail')!.textContent = describe(cause);

  el.querySelector('#btn-error-reload')!.addEventListener('click', () => window.location.reload());
  el.querySelector('#btn-error-reset')!.addEventListener('click', () => void resetSave());

  document.body.appendChild(el);
}

/**
 * Catch what escapes everything else. Nothing here calls `preventDefault`, so the
 * browser still logs the error normally — during development the panel is an
 * addition to the console noise, not a replacement for it.
 */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', event => {
    // A failed <img>/<script> load dispatches a plain Event at the element rather
    // than an ErrorEvent at the window. That is a missing asset, not a crash, and
    // it must not put a panel over a game that is running fine.
    if (!(event instanceof ErrorEvent)) return;
    showErrorPanel('The game hit an unexpected error.', event.error ?? event.message);
  });

  window.addEventListener('unhandledrejection', event => {
    showErrorPanel('The game hit an unexpected error.', event.reason);
  });
}
