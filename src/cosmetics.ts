import { del, get, set } from 'idb-keyval';

/**
 * Player-glyph skins. Purely how the `@` is drawn — no cosmetic touches the
 * engine, the RNG, or anything a seed reproduces, so two runs on one seed play
 * identically whichever is chosen. `src/core/` deliberately does not import this
 * module; only the renderer and the settings screen do.
 *
 * A hue here can echo an enemy's, which normally breaks this project's "every
 * state gets a visible tell" rule. It does not here: the player is the only
 * glyph drawn at the centre of the viewport, and the only one drawn last over
 * everything else.
 */
export interface Cosmetic {
  id: string;
  label: string;
  /** ASCII only — the renderer draws this as text in the map font. */
  glyph: string;
  color: string;
  /**
   * Presented as a supporter cosmetic, and unlocked anyway for the alpha. The
   * point of the flag is to let testers react to the offer's tone; nothing in
   * the code gates on it.
   */
  supporter: boolean;
}

export const COSMETICS: readonly Cosmetic[] = [
  { id: 'wanderer', label: 'Wanderer', glyph: '@', color: '#00f0ff', supporter: false },
  { id: 'ember', label: 'Ember', glyph: '@', color: '#ff6b35', supporter: false },
  { id: 'verdant', label: 'Verdant', glyph: '@', color: '#4ade80', supporter: false },
  { id: 'rift-touched', label: 'Rift-Touched', glyph: '@', color: '#c77dff', supporter: true },
  { id: 'bone', label: 'Bonewalker', glyph: '&', color: '#e8e6df', supporter: true },
];

export const DEFAULT_COSMETIC_ID = 'wanderer';

const STORAGE_KEY = 'cosmetic';

/** Anything unrecognised — an id from a build that had it, junk in the store —
 *  resolves to the default rather than leaving the player unrendered. */
export function cosmeticById(id: unknown): Cosmetic {
  return COSMETICS.find(c => c.id === id) ?? COSMETICS.find(c => c.id === DEFAULT_COSMETIC_ID)!;
}

let selected: Cosmetic = cosmeticById(DEFAULT_COSMETIC_ID);

export function currentCosmetic(): Cosmetic {
  return selected;
}

/** Same storage boundary as `save.ts`: an unreadable store means the default. */
export async function loadCosmetic(): Promise<void> {
  try {
    selected = cosmeticById(await get(STORAGE_KEY));
  } catch (error) {
    console.error('Could not read the saved cosmetic', error);
    selected = cosmeticById(DEFAULT_COSMETIC_ID);
  }
}

export function selectCosmetic(id: string): void {
  selected = cosmeticById(id);
  // Not `void set(...)`: an unhandled rejection would raise the global error
  // panel over a working settings screen, exactly as in `keybinds.ts`.
  set(STORAGE_KEY, selected.id).catch(error =>
    console.error('Could not save the cosmetic', error)
  );
}

/** Part of the error panel's Reset Save, which must work when nothing else does. */
export async function clearCosmetic(): Promise<void> {
  try {
    await del(STORAGE_KEY);
  } catch (error) {
    console.error('Could not clear the cosmetic', error);
  }
  selected = cosmeticById(DEFAULT_COSMETIC_ID);
}
