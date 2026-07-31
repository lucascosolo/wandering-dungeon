import { del, get, set } from 'idb-keyval';
import { GameState } from './state';

/**
 * Bumped whenever `GameState`'s shape changes in a way an older save cannot
 * satisfy. A save from a different version is discarded rather than restored —
 * a run resumed into a half-missing state is worse than losing it.
 */
export const SAVE_VERSION = 2;

const STORAGE_KEY = 'run-in-progress';

export interface SavedRun {
  version: number;
  state: GameState;
}

export function encodeRun(state: GameState): SavedRun {
  return { version: SAVE_VERSION, state };
}

/**
 * A finished run is refused here rather than only being cleared on death, so a
 * save that outlives its run — a tab killed on the death screen, a clear that
 * never landed — still cannot be resumed.
 */
export function decodeRun(raw: unknown): GameState | null {
  const saved = raw as SavedRun | undefined;
  if (!saved || saved.version !== SAVE_VERSION || !saved.state) return null;
  if (saved.state.isGameOver) return null;
  return saved.state;
}

/**
 * `GameState` is plain data end to end, so idb-keyval's structured clone is the
 * whole serializer. `rngState` rides along with it, which is what keeps a
 * resumed run on the same roll sequence as the one that was saved.
 */
export async function saveRun(state: GameState): Promise<void> {
  await set(STORAGE_KEY, encodeRun(state));
}

export async function loadRun(): Promise<GameState | null> {
  return decodeRun(await get(STORAGE_KEY));
}

export async function clearRun(): Promise<void> {
  await del(STORAGE_KEY);
}

export async function hasSavedRun(): Promise<boolean> {
  return (await loadRun()) !== null;
}
