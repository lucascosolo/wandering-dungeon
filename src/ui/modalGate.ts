/**
 * The single answer to "is a modal prompt up?".
 *
 * Both the keyboard handler and the canvas tap handler ask this one predicate
 * rather than each testing `.hidden` on whichever elements they happen to know
 * about — two copies of that list drift, and the half that forgets an element
 * lets the turn advance underneath an open prompt.
 */
export interface ModalSnapshot {
  armor: boolean;
  shop: boolean;
  /** The end-of-run modal. */
  end: boolean;
  inventory: boolean;
  /** The in-run menu: help, glyph key, settings, abandon. */
  menu: boolean;
}

/** Keys that close a dismissable prompt. Neither is in `DEFAULT_KEYBINDS`. */
export const DISMISS_KEYS: readonly string[] = ['escape', 'x'];

/** Printed inside every dismissable card, so the binding is discoverable. */
export const DISMISS_HINT = 'ESC or X to close';

/**
 * While true, no player input may reach the engine — no movement, no item use,
 * no hotbar, no tap-to-travel. The prompt's own buttons dispatch directly and
 * are unaffected.
 */
export function blocksGameInput(open: ModalSnapshot): boolean {
  return open.armor || open.shop || open.end || open.inventory || open.menu;
}

/**
 * Which prompt a dismiss (backdrop tap or dismiss key) should close.
 *
 * The end modal is deliberately absent: a dead run is not a prompt you escape,
 * so it blocks input but cannot be dismissed — the only ways out are its own
 * two buttons.
 *
 * The menu is checked first because it is the one prompt opened deliberately
 * rather than raised by the engine: whatever else is somehow up, a dismiss aimed
 * at a menu the player just opened should close that.
 */
export function dismissTarget(open: ModalSnapshot): 'armor' | 'shop' | 'inventory' | 'menu' | null {
  if (open.menu) return 'menu';
  if (open.armor) return 'armor';
  if (open.shop) return 'shop';
  if (open.inventory) return 'inventory';
  return null;
}

export function isDismissKey(key: string): boolean {
  return DISMISS_KEYS.includes(key);
}
