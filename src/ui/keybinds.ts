import { del, get, set } from 'idb-keyval';

export type ActionId =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'wait'
  | 'ability'
  | 'descend'
  | 'inventory'
  | 'potion'
  | 'bow'
  | 'hotbar1'
  | 'hotbar2'
  | 'hotbar3'
  | 'hotbar4';

export type Keybinds = Record<ActionId, string[]>;

/** Two slots per action, so the arrow/WASD pairing survives rebinding. */
export const KEYS_PER_ACTION = 2;

export const ACTIONS: { id: ActionId; label: string }[] = [
  { id: 'moveUp', label: 'Move up' },
  { id: 'moveDown', label: 'Move down' },
  { id: 'moveLeft', label: 'Move left' },
  { id: 'moveRight', label: 'Move right' },
  { id: 'wait', label: 'Wait' },
  { id: 'ability', label: 'Fallout Shield' },
  { id: 'descend', label: 'Descend' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'potion', label: 'Drink potion' },
  { id: 'bow', label: 'Aim / sheathe bow' },
  { id: 'hotbar1', label: 'Hotbar 1' },
  { id: 'hotbar2', label: 'Hotbar 2' },
  { id: 'hotbar3', label: 'Hotbar 3' },
  { id: 'hotbar4', label: 'Hotbar 4' },
];

export const DEFAULT_KEYBINDS: Keybinds = {
  moveUp: ['arrowup', 'w'],
  moveDown: ['arrowdown', 's'],
  moveLeft: ['arrowleft', 'a'],
  moveRight: ['arrowright', 'd'],
  wait: [' ', '.'],
  ability: ['q'],
  descend: ['>', 'enter'],
  inventory: ['i'],
  potion: ['h'],
  bow: ['b'],
  hotbar1: ['1'],
  hotbar2: ['2'],
  hotbar3: ['3'],
  hotbar4: ['4'],
};

export const MOVE_DELTAS: Record<string, [number, number]> = {
  moveUp: [0, -1],
  moveDown: [0, 1],
  moveLeft: [-1, 0],
  moveRight: [1, 0],
};

const STORAGE_KEY = 'keybinds';

function clone(binds: Keybinds): Keybinds {
  return Object.fromEntries(
    ACTIONS.map(({ id }) => [id, [...binds[id]]])
  ) as Keybinds;
}

let bindings: Keybinds = clone(DEFAULT_KEYBINDS);

export function currentKeybinds(): Keybinds {
  return bindings;
}

/**
 * Persisted bindings are a true boundary — they were written by whatever version
 * of the game the player last ran, so an action added since then simply is not
 * in there. Anything unrecognised falls back to its default rather than leaving
 * the action unbound.
 */
export function sanitize(stored: unknown): Keybinds {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const result = clone(DEFAULT_KEYBINDS);

  for (const { id } of ACTIONS) {
    const keys = raw[id];
    if (!Array.isArray(keys)) continue;
    const usable = keys.filter((k): k is string => typeof k === 'string' && k.length > 0);
    result[id] = usable.slice(0, KEYS_PER_ACTION);
  }
  return result;
}

export async function loadKeybinds(): Promise<void> {
  // Same storage boundary as `save.ts`: unreadable bindings mean the defaults,
  // never a rejected boot chain. `sanitize` already treats anything it does not
  // recognise as "use the default", so undefined is a value it handles.
  try {
    bindings = sanitize(await get(STORAGE_KEY));
  } catch (error) {
    console.error('Could not read saved keybinds', error);
    bindings = sanitize(undefined);
  }
}

function save(): void {
  // Not `void set(...)`: an unhandled rejection here would surface the global
  // error panel over a working game every time a key is rebound.
  set(STORAGE_KEY, bindings).catch(error => console.error('Could not save keybinds', error));
}

/** Part of the error panel's Reset Save, which must work when nothing else does. */
export async function clearKeybinds(): Promise<void> {
  try {
    await del(STORAGE_KEY);
  } catch (error) {
    console.error('Could not clear keybinds', error);
  }
  bindings = clone(DEFAULT_KEYBINDS);
}

/**
 * Assigning a key that is already in use takes it from its previous owner. Two
 * actions on one key would make one of them unreachable, and silently refusing
 * the bind reads as a broken settings screen.
 */
export function assignKey(binds: Keybinds, action: ActionId, slot: number, key: string): Keybinds {
  const next = clone(binds);

  for (const { id } of ACTIONS) {
    next[id] = next[id].filter(k => k !== key);
  }

  const keys = next[action];
  while (keys.length < slot) keys.push('');
  keys[slot] = key;
  next[action] = keys.filter(k => k !== '').slice(0, KEYS_PER_ACTION);
  return next;
}

export function bindKey(action: ActionId, slot: number, key: string): void {
  bindings = assignKey(bindings, action, slot, key);
  save();
}

export function clearKey(action: ActionId, slot: number): void {
  const next = clone(bindings);
  next[action] = next[action].filter((_, i) => i !== slot);
  bindings = next;
  save();
}

export function resetKeybinds(): void {
  bindings = clone(DEFAULT_KEYBINDS);
  save();
}

export function actionForKey(binds: Keybinds, key: string): ActionId | null {
  for (const { id } of ACTIONS) {
    if (binds[id].includes(key)) return id;
  }
  return null;
}

const KEY_LABELS: Record<string, string> = {
  ' ': 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  enter: 'Enter',
  escape: 'Esc',
  tab: 'Tab',
};

export function keyLabel(key: string): string {
  return KEY_LABELS[key] ?? key.toUpperCase();
}
