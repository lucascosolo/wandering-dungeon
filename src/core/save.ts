import { del, get, set } from 'idb-keyval';
import { GameState, Player, Position } from './state';

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

  // A run saved before levels existed carries no level/xp. Filling them in at the
  // deserialization boundary — rather than bumping SAVE_VERSION and throwing the
  // run away — resumes it at level 1, which is exactly what it was playing at.
  const player = saved.state.player as Player & { level?: number; xp?: number };
  player.level ??= 1;
  player.xp ??= 0;

  // A run saved before escalating pressure existed carries no per-floor counter.
  // Same boundary fix as level/xp above: resume at zero pressure rather than throw
  // the run away. Reading `turnCount` instead would be wrong — it never resets, so
  // a resumed run would arrive on its current floor already fully unravelled.
  const state = saved.state as GameState & { floorTurns?: number };
  state.floorTurns ??= 0;

  // A run saved before the merchant stood on a tile carries a shop with no
  // position. Backfilled to the floor's entrance — a room tile that is never the
  // stairs, so the merchant cannot resume standing where the player has to walk
  // to descend — rather than discarding the run over a field it can be given.
  const shop = saved.state.shop as (GameState['shop'] & { position?: Position }) | null;
  if (shop) shop.position ??= { ...saved.state.floorMap.entrance };

  // Purely one-turn signals to the HUD. Resuming is not that turn, so a run saved
  // on the turn it levelled — or felled a guardian, or opened the merchant's
  // stock — must not come back with the splash or the modal still pending.
  saved.state.lastLevelUp = null;
  saved.state.lastBossDefeat = null;
  saved.state.shopOpened = false;

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
