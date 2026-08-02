import {
  ACTIONS,
  ActionId,
  bindKey,
  clearKey,
  currentKeybinds,
  keyLabel,
  KEYS_PER_ACTION,
  resetKeybinds,
} from './keybinds';
import { COSMETICS, currentCosmetic, selectCosmetic } from '../cosmetics';

/**
 * Mounted on `document.body` like the title screen, for the same reason —
 * `mountUI` owns `#app`'s innerHTML outright.
 */
export function showSettingsScreen(onBack: () => void): void {
  const screen = document.createElement('div');
  screen.className = 'title-screen';
  document.body.appendChild(screen);

  /** Which slot is waiting for a keypress, or null when nothing is listening. */
  let capturing: { action: ActionId; slot: number } | null = null;

  function render(): void {
    const binds = currentKeybinds();
    const skin = currentCosmetic();

    screen.innerHTML = `
      <div class="title-screen__inner settings__inner">
        <h2 class="setup__heading">Settings</h2>
        <p class="settings__hint">
          ${
            capturing
              ? 'Press a key &middot; Esc to cancel'
              : 'Tap a key to rebind &middot; long list scrolls'
          }
        </p>

        <span class="setup__label">Controls</span>
        <div class="keybinds">
          ${ACTIONS.map(
            ({ id, label }) => `
            <div class="keybind">
              <span class="keybind__label">${label}</span>
              <span class="keybind__keys">
                ${Array.from({ length: KEYS_PER_ACTION }, (_, slot) => {
                  const key = binds[id][slot];
                  const active = capturing?.action === id && capturing.slot === slot;
                  return `<button class="key-btn ${active ? 'key-btn--capturing' : ''} ${
                    key ? '' : 'key-btn--empty'
                  }" data-action="${id}" data-slot="${slot}" type="button">${
                    active ? '…' : key ? keyLabel(key) : '+'
                  }</button>`;
                }).join('')}
              </span>
            </div>`
          ).join('')}
        </div>

        <span class="setup__label">Appearance</span>
        <p class="settings__hint settings__hint--left">
          Cosmetic only — the glyph you play as. Nothing here touches the game.
        </p>
        <div class="cosmetics">
          ${COSMETICS.map(
            c => `
            <button class="cosmetic ${c.id === skin.id ? 'cosmetic--on' : ''}"
                    data-cosmetic="${c.id}" type="button">
              <span class="cosmetic__glyph" style="color: ${c.color}">${c.glyph}</span>
              <span class="cosmetic__label">${c.label}</span>
              ${
                c.supporter
                  ? '<span class="cosmetic__tag">supporter cosmetic — free during alpha</span>'
                  : ''
              }
            </button>`
          ).join('')}
        </div>

        <div class="title-screen__menu">
          <button class="title-btn" id="btn-reset-keys" type="button">Reset keys to defaults</button>
          <button class="title-btn title-btn--primary" id="btn-settings-back" type="button">Back</button>
        </div>
      </div>
    `;

    screen.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn =>
      btn.addEventListener('click', () => {
        const action = btn.dataset.action as ActionId;
        const slot = Number(btn.dataset.slot);
        // Tapping the slot already listening cancels it rather than arming twice.
        capturing =
          capturing?.action === action && capturing.slot === slot ? null : { action, slot };
        render();
      })
    );
    screen.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn =>
      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        clearKey(btn.dataset.action as ActionId, Number(btn.dataset.slot));
        capturing = null;
        render();
      })
    );
    screen.querySelectorAll<HTMLButtonElement>('[data-cosmetic]').forEach(btn =>
      btn.addEventListener('click', () => {
        selectCosmetic(btn.dataset.cosmetic!);
        render();
      })
    );
    screen.querySelector('#btn-reset-keys')!.addEventListener('click', () => {
      resetKeybinds();
      capturing = null;
      render();
    });
    screen.querySelector('#btn-settings-back')!.addEventListener('click', close);
  }

  /**
   * Capture phase, and every key is swallowed rather than only the one being
   * bound — the game shell's own keydown listener stays attached for the life of
   * the page, so an unswallowed keypress here would also act on the board behind
   * this screen.
   */
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!capturing) return;

    const key = e.key.toLowerCase();
    if (key !== 'escape') bindKey(capturing.action, capturing.slot, key);
    capturing = null;
    render();
  };

  function close(): void {
    window.removeEventListener('keydown', onKeyDown, true);
    screen.remove();
    onBack();
  }

  window.addEventListener('keydown', onKeyDown, true);
  render();
}
