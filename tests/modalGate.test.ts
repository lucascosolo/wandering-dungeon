import { describe, expect, it } from 'vitest';
import {
  blocksGameInput,
  DISMISS_HINT,
  DISMISS_KEYS,
  dismissTarget,
  isDismissKey,
  ModalSnapshot,
} from '../src/ui/modalGate';
import { ACTIONS, DEFAULT_KEYBINDS } from '../src/ui/keybinds';

const NOTHING_OPEN: ModalSnapshot = {
  armor: false,
  shop: false,
  end: false,
  inventory: false,
  menu: false,
};

describe('Modal gate', () => {
  it('lets input through when nothing is open', () => {
    expect(blocksGameInput(NOTHING_OPEN)).toBe(false);
    expect(dismissTarget(NOTHING_OPEN)).toBeNull();
  });

  it('blocks input for every prompt, the end modal included', () => {
    for (const key of ['armor', 'shop', 'end', 'inventory', 'menu'] as const) {
      expect(blocksGameInput({ ...NOTHING_OPEN, [key]: true })).toBe(true);
    }
  });

  it('never offers to dismiss the end modal', () => {
    expect(dismissTarget({ ...NOTHING_OPEN, end: true })).toBeNull();
  });

  it('names the open prompt as the dismiss target', () => {
    expect(dismissTarget({ ...NOTHING_OPEN, armor: true })).toBe('armor');
    expect(dismissTarget({ ...NOTHING_OPEN, shop: true })).toBe('shop');
    expect(dismissTarget({ ...NOTHING_OPEN, inventory: true })).toBe('inventory');
    expect(dismissTarget({ ...NOTHING_OPEN, menu: true })).toBe('menu');
  });

  // The menu is the one prompt the player opens on purpose, so a dismiss aimed
  // at it must not close something underneath instead.
  it('prefers the in-run menu over anything it was opened over', () => {
    expect(dismissTarget({ ...NOTHING_OPEN, menu: true, inventory: true })).toBe('menu');
    expect(dismissTarget({ ...NOTHING_OPEN, menu: true, armor: true })).toBe('menu');
  });

  it('prefers the armor prompt when it sits over the sheet', () => {
    expect(dismissTarget({ ...NOTHING_OPEN, armor: true, inventory: true })).toBe('armor');
  });

  it('recognises exactly the dismiss keys, lowercased', () => {
    expect(isDismissKey('escape')).toBe(true);
    expect(isDismissKey('x')).toBe(true);
    expect(isDismissKey('enter')).toBe(false);
    expect(isDismissKey('q')).toBe(false);
    expect(isDismissKey('X')).toBe(false);
  });

  // A dismiss key that also drove an action would fire both the moment the
  // gate ever let a keypress through.
  it('takes no key that a game action already owns', () => {
    const bound = new Set(ACTIONS.flatMap(({ id }) => DEFAULT_KEYBINDS[id]));
    for (const key of DISMISS_KEYS) {
      expect(bound.has(key)).toBe(false);
    }
  });

  it('names both keys in the hint the cards print', () => {
    for (const key of DISMISS_KEYS) {
      expect(DISMISS_HINT.toLowerCase()).toContain(key === 'escape' ? 'esc' : key);
    }
  });
});
