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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPosition(value: unknown): boolean {
  return isObject(value) && isNumber(value.x) && isNumber(value.y);
}

/** A rectangular grid of exactly the dimensions the map claims for itself. */
function isGrid(value: unknown, width: number, height: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === height &&
    value.every(row => Array.isArray(row) && row.length === width)
  );
}

/**
 * Every field the shell dereferences before the player can do anything: the HUD
 * and the title screen read the player, the map and the run config on sight, and
 * the renderer indexes the three grids by the map's own width/height.
 *
 * This is deliberately not a schema for `GameState`, and deliberately not a
 * migration ladder. It exists so that a truncated, half-written or foreign value
 * in IndexedDB decodes as "no save" instead of throwing a TypeError deep inside
 * the boot chain, where there is no screen yet to be told about it on.
 */
function looksLikeRun(value: unknown): boolean {
  if (!isObject(value)) return false;

  const { player, floorMap, rngState, config } = value;

  if (
    !isObject(player) ||
    !isNumber(player.hp) ||
    !isNumber(player.maxHp) ||
    !isPosition(player.position) ||
    !Array.isArray(player.inventory)
  ) {
    return false;
  }

  if (!isObject(floorMap) || !isNumber(floorMap.level)) return false;
  const { width, height } = floorMap;
  if (!isNumber(width) || !isNumber(height) || width <= 0 || height <= 0) return false;
  if (!isPosition(floorMap.entrance) || !isPosition(floorMap.exit)) return false;
  if (
    !isGrid(floorMap.tiles, width, height) ||
    !isGrid(floorMap.explored, width, height) ||
    !isGrid(floorMap.visible, width, height)
  ) {
    return false;
  }
  // A right-shaped grid of the wrong stuff still crashes the renderer, so one
  // tile is sampled for the field every tile is read through.
  const sample = (floorMap.tiles as unknown[][])[0]?.[0];
  if (!isObject(sample) || typeof sample.type !== 'string') return false;

  if (!isObject(rngState) || typeof rngState.seed !== 'string' || !isNumber(rngState.callCount)) {
    return false;
  }
  if (!isObject(config) || !isNumber(config.finalFloor)) return false;
  if (!Array.isArray(value.entities) || !isNumber(value.turnCount)) return false;
  // Absent is legal — a run that has not met a merchant yet.
  if (value.shop != null && !isObject(value.shop)) return false;

  return true;
}

/**
 * A finished run is refused here rather than only being cleared on death, so a
 * save that outlives its run — a tab killed on the death screen, a clear that
 * never landed — still cannot be resumed.
 *
 * **This function must never throw.** It runs inside the boot chain, before any
 * screen exists, so an exception here is a black page with no way out of it. A
 * value it cannot make sense of is reported as "no save": the player loses a run
 * that was not resumable anyway, rather than losing the whole game.
 */
export function decodeRun(raw: unknown): GameState | null {
  try {
    return decodeChecked(raw);
  } catch (error) {
    // Belt and braces for whatever the structural check cannot anticipate — a
    // throwing getter, an exotic clone. Loud in the console, harmless on screen.
    console.error('Discarding an unreadable save', error);
    return null;
  }
}

function decodeChecked(raw: unknown): GameState | null {
  if (!isObject(raw) || raw.version !== SAVE_VERSION || !looksLikeRun(raw.state)) return null;

  const saved = raw as unknown as SavedRun;
  if (saved.state.isGameOver) return null;

  // A run saved before levels existed carries no level/xp. Filling them in at the
  // deserialization boundary — rather than bumping SAVE_VERSION and throwing the
  // run away — resumes it at level 1, which is exactly what it was playing at.
  const player = saved.state.player as Player & { level?: number; xp?: number; weaponActive?: boolean };
  player.level ??= 1;
  player.xp ??= 0;

  // A run saved before the bow toggle existed carries no aim/sheathe flag.
  // Same boundary fix as level/xp above: resume aimed, which is what every run
  // before this flag existed was implicitly playing at.
  player.weaponActive ??= true;

  // A run saved before escalating pressure existed carries no per-floor counter.
  // Same boundary fix as level/xp above: resume at zero pressure rather than throw
  // the run away. Reading `turnCount` instead would be wrong — it never resets, so
  // a resumed run would arrive on its current floor already fully unravelled.
  const state = saved.state as GameState & { floorTurns?: number };
  state.floorTurns ??= 0;

  // A run saved before a decline could stick carries no list of refused armor.
  // Same boundary fix again rather than a SAVE_VERSION bump: an empty list means
  // the piece underfoot asks once more, which is what that run was already doing.
  const declines = saved.state as Omit<GameState, 'declinedArmorIds'> & {
    declinedArmorIds?: string[];
  };
  declines.declinedArmorIds ??= [];

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
  // Both a backfill for a run saved before armor had modifiers and the same
  // one-turn strip as the notices above — an empty list is what a resumed run
  // wants either way, so the assignment covers both without a `??=`. The rolled
  // modifier itself rides along on the worn piece: `Item.modifier` is optional,
  // so a save made before it existed decodes as armor with no modifier, which is
  // exactly what that run was playing.
  saved.state.armorReactions = [];

  return saved.state;
}

/**
 * IndexedDB is a true boundary, not an engine guarantee. It is absent outright in
 * Safari Private Browsing and iOS Lockdown Mode, blocked in some embedded
 * webviews, and can reject on quota or a corrupted database. Every entry point
 * below therefore reports failure rather than rejecting: `saveRun` is called as
 * `void saveRun(state)` once per turn, so a rejection would otherwise raise the
 * global error panel eleven times a second during a walk, and `loadRun` sits in
 * the boot chain, where a rejection is a black screen.
 *
 * The cost of swallowing is an unsaved run, which is playable. The cost of not
 * swallowing is a game that will not start.
 */
export async function saveRun(state: GameState): Promise<void> {
  try {
    await set(STORAGE_KEY, encodeRun(state));
  } catch (error) {
    console.error('Could not save the run', error);
  }
}

export async function loadRun(): Promise<GameState | null> {
  try {
    return decodeRun(await get(STORAGE_KEY));
  } catch (error) {
    console.error('Could not read the saved run', error);
    return null;
  }
}

export async function clearRun(): Promise<void> {
  try {
    await del(STORAGE_KEY);
  } catch (error) {
    console.error('Could not clear the saved run', error);
  }
}

export async function hasSavedRun(): Promise<boolean> {
  return (await loadRun()) !== null;
}
