import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  actionForKey,
  assignKey,
  DEFAULT_KEYBINDS,
  Keybinds,
  KEYS_PER_ACTION,
  sanitize,
} from '../src/ui/keybinds';

describe('Keybinds', () => {
  it('binds every action by default, within the slot limit', () => {
    for (const { id } of ACTIONS) {
      expect(DEFAULT_KEYBINDS[id].length).toBeGreaterThan(0);
      expect(DEFAULT_KEYBINDS[id].length).toBeLessThanOrEqual(KEYS_PER_ACTION);
    }
  });

  it('gives no key to two actions', () => {
    const seen = new Set<string>();
    for (const { id } of ACTIONS) {
      for (const key of DEFAULT_KEYBINDS[id]) {
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('resolves the keys the game shipped with', () => {
    expect(actionForKey(DEFAULT_KEYBINDS, 'w')).toBe('moveUp');
    expect(actionForKey(DEFAULT_KEYBINDS, 'arrowright')).toBe('moveRight');
    expect(actionForKey(DEFAULT_KEYBINDS, ' ')).toBe('wait');
    expect(actionForKey(DEFAULT_KEYBINDS, '2')).toBe('hotbar2');
    expect(actionForKey(DEFAULT_KEYBINDS, 'z')).toBeNull();
  });

  it('takes a key from its previous owner rather than double-binding it', () => {
    const next = assignKey(DEFAULT_KEYBINDS, 'ability', 0, 'w');

    expect(actionForKey(next, 'w')).toBe('ability');
    expect(next.moveUp).toEqual(['arrowup']);
    expect(next.ability).not.toContain('q');
  });

  it('leaves the original bindings untouched', () => {
    assignKey(DEFAULT_KEYBINDS, 'ability', 0, 'w');
    expect(DEFAULT_KEYBINDS.moveUp).toEqual(['arrowup', 'w']);
  });

  it('fills the first empty slot when binding past the end', () => {
    const next = assignKey(DEFAULT_KEYBINDS, 'ability', 1, 'z');
    expect(next.ability).toEqual(['q', 'z']);
  });

  it('restores a saved set verbatim', () => {
    const saved = assignKey(DEFAULT_KEYBINDS, 'potion', 0, 'p');
    expect(sanitize(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('falls back to defaults for anything a save does not carry', () => {
    const stored = { moveUp: ['t'], ability: 'not-an-array', bogus: ['x'] };
    const result = sanitize(stored);

    expect(result.moveUp).toEqual(['t']);
    expect(result.ability).toEqual(DEFAULT_KEYBINDS.ability);
    expect(Object.keys(result).sort()).toEqual(ACTIONS.map(a => a.id).sort());
  });

  it('survives a missing save', () => {
    expect(sanitize(undefined)).toEqual(DEFAULT_KEYBINDS as Keybinds);
  });
});
