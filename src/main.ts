import { createNewGame } from './core/game';
import { declinedArmorUnderfoot, declinedWeaponUnderfoot, dispatchAction, GameAction } from './core/engine';
import { FloorMap, GameState, Position, samePosition } from './core/state';
import type { HudElements } from './ui/hud';
import { findPath } from './core/map/pathfinding';
import { computeCamera, renderFrame, TILE_SIZE } from './render/canvasRenderer';
import { ParticleSystem } from './render/particles';
import { attachControls } from './ui/controls';
import { blocksGameInput, dismissTarget, ModalSnapshot } from './ui/modalGate';
import { showTitleScreen } from './ui/titleScreen';
import { installGlobalErrorHandlers, showErrorPanel } from './ui/errorPanel';
import { loadKeybinds } from './ui/keybinds';
import { clearRun, loadRun, saveRun } from './core/save';
import { RunConfig } from './core/runConfig';
import {
  healthPotions,
  hotbarItems,
  mountUI,
  renderHotbar,
  renderInventory,
  renderLog,
  showArmorOffer,
  showBossDefeat,
  showEndModal,
  showLevelUp,
  showRunMenu,
  showShop,
  showWeaponOffer,
  updateHud,
} from './ui/hud';
import { showHowToPlay } from './ui/howToPlay';
import { showGlyphLegend } from './ui/glyphLegend';
import { showOpeningSplash } from './ui/openingSplash';
import { showSettingsScreen } from './ui/settingsScreen';
import { RunRecorder } from './telemetry/runLog';
import { buildRunReport } from './telemetry/runReport';
import { loadCosmetic } from './cosmetics';
import { registerServiceWorker } from './pwa/serviceWorker';
import { showUpdatePrompt } from './ui/updatePrompt';

const particles = new ParticleSystem();

/**
 * Assigned by `bootGameShell` on the first run and reused by every run after.
 * Nothing that reads them can run before a run exists — the title screen is the
 * only thing on screen until then.
 */
let ui!: HudElements;
let ctx!: CanvasRenderingContext2D;
let state!: GameState;
let recorder!: RunRecorder;
/** The config the current run was started with, so New Run can repeat it. */
let runConfig!: RunConfig;
let viewWidth = 0;
let viewHeight = 0;

/**
 * The board only changes when the player acts, so the render loop repaints on
 * demand rather than every frame — it draws once per dirty mark, then keeps
 * drawing only while particles are still moving. A turn-based game holding a
 * phone's GPU at 60fps to redraw an identical grid is pure battery cost.
 */
let dirty = true;

function randomSeed(): string {
  return Math.floor(Math.random() * 1e9).toString(36);
}

/** Seed comes from ?seed= so a run can be shared or replayed exactly. */
function readSeed(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('seed');
  return fromUrl && fromUrl.length > 0 ? fromUrl : randomSeed();
}

function resizeCanvas(): void {
  const rect = ui.canvas.parentElement!.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  viewWidth = rect.width;
  viewHeight = rect.height;

  ui.canvas.width = Math.floor(viewWidth * dpr);
  ui.canvas.height = Math.floor(viewHeight * dpr);
  ui.canvas.style.width = `${viewWidth}px`;
  ui.canvas.style.height = `${viewHeight}px`;
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  dirty = true;
}

/**
 * Turn engine events into screen feedback. `struck` is the tile the player's own
 * blow landed on, so a hit sparks on the thing being hit — every burst used to
 * spawn under the player, which read as taking damage rather than dealing it.
 */
function reactToEvents(events: string[], struck: { x: number; y: number } | null): void {
  const { x, y } = state.player.position;

  for (const text of events) {
    if (text.startsWith('You hit')) {
      const at = struck ?? { x, y };
      particles.burst(at.x, at.y, '#00f0ff', 8);
    } else if (text.startsWith('You pick up')) {
      // Walking over a `*` used to produce nothing at all — the item simply
      // appeared in the hotbar, which is a place the player is not looking while
      // they walk. The colours are the ones the map drew the glyph in.
      particles.burst(x, y, '#ffd166', 10);
    } else if (text.startsWith('You pocket')) {
      particles.burst(x, y, '#f7b32b', 10);
    } else if (text.includes('damage')) {
      particles.burst(x, y, '#ff0055', 10);
    } else if (text.toLowerCase().includes('shift')) {
      particles.burst(x, y, '#9d4edd', 16);
    }
  }

  // The floor rearranging itself is the loudest thing that happens in this game
  // and read as the quietest. Keyed off the turn the shift executed rather than
  // off the log text, which cannot tell an execution from its telegraph.
  if (state.lastShiftTurn === state.turnCount) {
    shakeMagnitude = SHIFT_SHAKE_PIXELS;
  }

  // A reactive modifier fires on a tile, not in the log, so it sparks there —
  // orange where the armor bit back, green where it threw something clear. The
  // engine reports the tile because the log line cannot: by the time a shove has
  // resolved, the attacker is no longer where the sentence found it.
  for (const reaction of state.armorReactions) {
    particles.burst(
      reaction.x,
      reaction.y,
      reaction.kind === 'thorns' ? '#ff7b00' : '#8fd9c0',
      12
    );
  }
}

function act(action: GameAction): void {
  if (state.isGameOver) return;
  // Any action the player takes themselves abandons the walk they were on.
  if (!isTravelStep) stopTravel();

  const from = { ...state.player.position };

  recorder.beginTurn(state, action);

  let events: string[];
  try {
    events = dispatchAction(state, action).events;
  } catch (error) {
    // The engine mutates one shared `GameState` in place, so a throw part-way
    // through a turn leaves that object half-applied — the enemy may have moved
    // without its damage landing, the shift may be half-executed. There is no
    // rollback to make here, and none is being claimed.
    //
    // What we can guarantee is that the *save* is not corrupted: the autosave at
    // the bottom of this function is skipped, so what is on disk is still the
    // last turn that completed in full, and Reload on the panel resumes from
    // there. Overwriting it with the half-applied object is the one move that
    // would turn a recoverable crash into a lost run.
    stopTravel();
    showErrorPanel('The turn could not be completed. Your last completed turn is still saved.', error);
    return;
  }

  recorder.endTurn(state, events);

  // A MOVE that left the player standing still was a melee swing into that tile.
  const struck =
    action.type === 'MOVE' && samePosition(state.player.position, from)
      ? { x: from.x + action.dx, y: from.y + action.dy }
      : null;
  reactToEvents(events, struck);
  dirty = true;

  updateHud(ui, state);
  renderLog(ui, state);
  renderHotbar(ui, state);
  // Deliberately not gated on `isTravelStep`: a level earned mid-walk is shown
  // where it happened, and the splash neither dispatches nor stops travel.
  if (state.lastLevelUp) showLevelUp(ui, state.lastLevelUp);
  if (state.lastBossDefeat) showBossDefeat(ui, state.lastBossDefeat);
  if (!ui.inventorySheet.classList.contains('hidden')) {
    renderInventory(ui, state);
  }

  if (state.pendingArmorOffer) {
    showArmorOffer(ui, state, resolveArmorOffer);
  }

  if (state.pendingWeaponOffer) {
    showWeaponOffer(ui, state, resolveWeaponOffer);
  }

  // The merchant is a thing on the floor: the only thing that raises his stock is
  // the player walking into him, which the engine reports for this one dispatch.
  if (state.shopOpened) openShop();

  // Autosave every turn. Writes on the same key are serialized by IndexedDB in
  // the order they are issued, so the last turn is what lands — including this
  // clear, which must not be overtaken by a save from the turn before it.
  if (state.isGameOver) void clearRun();
  else void saveRun(state);

  if (state.isGameOver) {
    // Built at the tap rather than here: most deaths never ask for a report, and
    // this runs on the same frame the run ends.
    showEndModal(ui, state, restart, returnToTitle, () => buildRunReport(recorder.snapshot()));
  }
}

/**
 * What is open right now, read from the DOM rather than mirrored in a variable —
 * the elements' `hidden` class is already the truth every other path writes to,
 * and a second copy would go stale the first time one of them was toggled
 * without updating it.
 */
function openModals(): ModalSnapshot {
  return {
    armor: !ui.armorModal.classList.contains('hidden'),
    shop: !ui.shopModal.classList.contains('hidden'),
    end: !ui.modal.classList.contains('hidden'),
    inventory: !ui.inventorySheet.classList.contains('hidden'),
    menu: !ui.menuModal.classList.contains('hidden'),
  };
}

/**
 * Close whatever prompt is up. Declining the armor offer goes through the engine
 * rather than just hiding the card: `pendingArmorOffer` would otherwise stay set
 * and the prompt would reopen on the next dispatch.
 */
function dismissModal(): void {
  switch (dismissTarget(openModals())) {
    case 'armor':
      resolveArmorOffer(false);
      break;
    case 'shop':
      closeShop();
      break;
    case 'inventory':
      closeInventory();
      break;
    case 'menu':
      closeMenu();
      break;
  }
}

function openMenu(): void {
  // Any walk in progress is a queued sequence of turns; pausing has to stop it,
  // or the board would carry on moving behind the panel that froze input.
  stopTravel();
  showRunMenu(ui, state, {
    onHowToPlay: () => showHowToPlay(() => {}),
    onGlyphKey: () => showGlyphLegend(() => {}),
    onSettings: () => showSettingsScreen(() => {}),
    onAbandon: abandonRun,
    onClose: closeMenu,
  });
}

function closeMenu(): void {
  ui.menuModal.classList.add('hidden');
}

/**
 * Give up the run in progress. The save is cleared *before* the title screen
 * re-reads it, not alongside it: Continue offering the run the player just
 * abandoned is the one outcome this has to rule out.
 */
function abandonRun(): void {
  closeMenu();
  // `clearRun` reports storage failure to the console and resolves either way —
  // same posture as every other read and write in `save.ts` — so there is no
  // rejection path to handle here.
  void clearRun().then(returnToTitle);
}

function resolveArmorOffer(equip: boolean): void {
  ui.armorModal.classList.add('hidden');
  act({ type: equip ? 'EQUIP_ARMOR' : 'DECLINE_ARMOR' });
}

function resolveWeaponOffer(equip: boolean): void {
  ui.armorModal.classList.add('hidden');
  act({ type: equip ? 'EQUIP_WEAPON' : 'DECLINE_WEAPON' });
}

/** Re-raise the prompt for a piece the player already turned down. */
function pickUpArmor(): void {
  act({ type: 'PICK_UP_ARMOR' });
}

/** Re-raise the prompt for a weapon the player already turned down. */
function pickUpWeapon(): void {
  act({ type: 'PICK_UP_WEAPON' });
}

/**
 * Enter takes the pickup only where it is free to. On the stairs Descend keeps
 * it, because descending has no other keyboard route the player may have bound
 * away, while the pickup always keeps the hint button.
 */
function weaponPickupWantsEnter(): boolean {
  if (state.floorMap.tiles[state.player.position.y][state.player.position.x].type === 'stairs_down') {
    return false;
  }
  return declinedWeaponUnderfoot(state) !== null;
}

function armorPickupWantsEnter(): boolean {
  if (state.floorMap.tiles[state.player.position.y][state.player.position.x].type === 'stairs_down') {
    return false;
  }
  return declinedArmorUnderfoot(state) !== null;
}

function openShop(): void {
  if (!state.shop) return;
  showShop(ui, state, buyOffer, closeShop);
}

function closeShop(): void {
  ui.shopModal.classList.add('hidden');
}

function buyOffer(offerId: string): void {
  act({ type: 'BUY_ITEM', offerId });
  openShop();
}

function useItem(itemId: string): void {
  closeInventory();
  act({ type: 'USE_ITEM', itemId });
}

/**
 * Tap-to-travel. One engine turn per tick rather than the whole route at once,
 * so the walk is legible and the dungeon still gets to shift underneath it.
 */
const TRAVEL_STEP_MS = 90;
let travelPath: Position[] = [];
let travelTimer: number | null = null;
/** Set only while travel drives the engine, so `act` can tell a step of the
 *  current walk apart from the player interrupting it. */
let isTravelStep = false;

function stopTravel(): void {
  travelPath = [];
  if (travelTimer !== null) {
    clearInterval(travelTimer);
    travelTimer = null;
  }
}

function enemyInSight(): boolean {
  return state.entities.some(
    e => e.hp > 0 && state.floorMap.visible[e.position.y][e.position.x]
  );
}

function stepTravel(): void {
  try {
    stepTravelOnce();
  } catch (error) {
    // This runs on a 90ms interval that only `stopTravel` clears. A throw that
    // escaped would re-fire eleven times a second, forever, with the player
    // unable to act — so the walk is abandoned first and the failure reported
    // second. `isTravelStep` is reset with it: left true, every later keypress
    // would look like a step of a walk that no longer exists, and would stop
    // interrupting travel.
    isTravelStep = false;
    stopTravel();
    showErrorPanel('The walk could not continue.', error);
  }
}

function stepTravelOnce(): void {
  const next = travelPath.shift();
  if (!next) {
    stopTravel();
    return;
  }

  const from = { ...state.player.position };
  const hpBefore = state.player.hp;

  isTravelStep = true;
  act({ type: 'MOVE', dx: next.x - from.x, dy: next.y - from.y });
  isTravelStep = false;

  const moved = state.player.position.x !== from.x || state.player.position.y !== from.y;
  // A step that went nowhere means the way closed — a shift, or something now
  // standing in it. Either way the planned route is stale. Walking into the
  // merchant lands here too, and wants exactly this: the step that did not move
  // was the trade, `act` has already raised his stock, and the walk is over.
  if (
    !moved ||
    state.isGameOver ||
    state.pendingArmorOffer ||
    state.player.hp < hpBefore ||
    enemyInSight()
  ) {
    stopTravel();
  }
}

/**
 * The map as the player knows it. Routing over the true geometry would let a
 * single tap solve corridors they have never seen.
 *
 * The merchant is solid, so he is a wall to the router — unless he is the tap's
 * destination, where the route has to reach his tile for the last step to be the
 * bump that opens his stock.
 */
function exploredMap(target: Position): FloorMap {
  const { floorMap, shop } = state;
  const blocked =
    shop && !samePosition(shop.position, target) ? shop.position : null;
  return {
    ...floorMap,
    tiles: floorMap.tiles.map((row, y) =>
      row.map((tile, x) =>
        floorMap.explored[y][x] && !(blocked && blocked.x === x && blocked.y === y)
          ? tile
          : { ...tile, type: 'wall' }
      )
    ),
  };
}

function travelTo(target: Position): void {
  stopTravel();

  const path = findPath(exploredMap(target), state.player.position, target);
  if (!path || path.length < 2) return;

  travelPath = path.slice(1);
  stepTravel();
  if (travelPath.length > 0) travelTimer = window.setInterval(stepTravel, TRAVEL_STEP_MS);
}

function usePotion(): void {
  if (state.player.hp >= state.player.maxHp) return;
  const potion = healthPotions(state)[0];
  if (potion) useItem(potion.id);
}

function openInventory(): void {
  renderInventory(ui, state);
  ui.inventorySheet.classList.remove('hidden');
}

function closeInventory(): void {
  ui.inventorySheet.classList.add('hidden');
}

function toggleInventory(): void {
  if (ui.inventorySheet.classList.contains('hidden')) openInventory();
  else closeInventory();
}

function restart(): void {
  startRun(randomSeed(), runConfig);
}

function returnToTitle(): void {
  // Close the abandoned run's log before its state is left behind.
  recorder.flush();
  stopTravel();
  openTitleScreen();
}

/**
 * The save is re-read every time rather than cached, because the run just played
 * may have cleared it — Continue must not offer a run that is over.
 */
function openTitleScreen(): void {
  loadRun()
    .then(saved => {
      showTitleScreen({
        saved,
        onNewGame: config => startRun(randomSeed(), config),
        onContinue: resumeRun,
      });
    })
    .catch(error => showErrorPanel('The title screen could not be opened.', error));
}

/** Resume a saved run. The state is the save itself, so nothing is re-derived. */
function resumeRun(saved: GameState): void {
  enterRun(saved);
}

function startRun(seed: string, config: RunConfig): void {
  enterRun(createNewGame(seed, config));
  // Save at turn 0 too, so a run abandoned before its first move is still there.
  void saveRun(state);
  // New runs only. A resumed run is one the player is already inside, and
  // re-reading the premise on the way back in would be a lecture, not framing.
  showOpeningSplash(() => {
    dirty = true;
  });
}

/**
 * Wipe the shell onto a run, new or resumed. Everything a run owns is replaced
 * here, so a second run cannot inherit a modal, a queued walk, or the previous
 * log. A resumed run does start a fresh run-log — the telemetry is per sitting,
 * not per run.
 */
function enterRun(next: GameState): void {
  if (!booted) bootGameShell();

  stopTravel();
  state = next;
  runConfig = next.config;
  recorder = new RunRecorder(state);
  particles.clear();
  dirty = true;
  ui.modal.classList.add('hidden');
  ui.armorModal.classList.add('hidden');
  showLevelUp(ui, null);
  showBossDefeat(ui, null);
  closeShop();
  closeInventory();
  closeMenu();
  resizeCanvas();
  updateHud(ui, state);
  renderLog(ui, state);
  renderHotbar(ui, state);
}

let booted = false;

/**
 * The DOM, listeners, and render loop a run needs — built once on the first New
 * Game and reused by every run after, since none of it depends on which run is
 * being played.
 */
function bootGameShell(): void {
  booted = true;

  const root = document.getElementById('app');
  if (!root) throw new Error('#app container missing');

  ui = mountUI(root, useItem, pickUpArmor);
  const context = ui.canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  ctx = context;

  attachControls(ui.canvas, {
    move: (dx, dy) => act({ type: 'MOVE', dx, dy }),
    wait: () => act({ type: 'WAIT' }),
    ability: () => act({ type: 'ABILITY' }),
    descend: () => act({ type: 'DESCEND' }),
    pickUpArmor,
    armorPickupWantsEnter,
    toggleInventory,
    usePotion,
    toggleWeapon: () => act({ type: 'TOGGLE_WEAPON' }),
    inputBlocked: () => blocksGameInput(openModals()),
    dismissModal,
    useHotbarSlot: (slot) => {
      const item = hotbarItems(state)[slot - 1];
      if (item) useItem(item.id);
    },
    tapTile: (px, py) => {
      const { offsetX, offsetY } = computeCamera(state, viewWidth, viewHeight);
      const tileX = Math.floor((px - offsetX) / TILE_SIZE);
      const tileY = Math.floor((py - offsetY) / TILE_SIZE);
      const dx = tileX - state.player.position.x;
      const dy = tileY - state.player.position.y;

      // Adjacent is a single MOVE so it also swings at whatever is standing there;
      // anything further is a walk along the shortest known route.
      if (Math.abs(dx) + Math.abs(dy) === 1) act({ type: 'MOVE', dx, dy });
      else travelTo({ x: tileX, y: tileY });
    },
  });

  root.querySelector('#btn-wait')!.addEventListener('click', () => act({ type: 'WAIT' }));
  root.querySelector('#btn-ability')!.addEventListener('click', () => act({ type: 'ABILITY' }));
  root.querySelector('#btn-bow-toggle')!.addEventListener('click', () => act({ type: 'TOGGLE_WEAPON' }));
  root.querySelector('#btn-descend')!.addEventListener('click', () => act({ type: 'DESCEND' }));
  root.querySelector('#btn-inventory')!.addEventListener('click', toggleInventory);
  ui.potionBtn.addEventListener('click', usePotion);
  ui.menuBtn.addEventListener('click', openMenu);
  ui.legendBtn.addEventListener('click', () => showGlyphLegend(() => {}));
  root.querySelector('#btn-close-inventory')!.addEventListener('click', closeInventory);

  // Tapping the backdrop dismisses. `e.target === el` is what keeps a tap on the
  // card — or on a button inside it — from closing the prompt out from under the
  // press. The backdrop is a sibling of the canvas and covers it, so this never
  // reaches the tap-to-travel handler. The end modal gets no such listener: a
  // dead run is not a prompt you escape.
  for (const backdrop of [ui.armorModal, ui.shopModal, ui.menuModal]) {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) dismissModal();
    });
  }

  // The viewport is flex-sized, so its box is only known after layout — observe it
  // rather than measuring once at startup.
  new ResizeObserver(resizeCanvas).observe(ui.canvas.parentElement!);

  // An abandoned run is data too, so push it before the page goes away. pagehide
  // fires on mobile backgrounding where unload does not.
  window.addEventListener('pagehide', () => recorder.flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') recorder.flush(true);
  });

  requestAnimationFrame(loop);
}

let lastFrame = performance.now();

/**
 * How many frames in a row may fail before the loop gives up. A frame that
 * throws almost always throws on the next one too — at 60fps an unbounded retry
 * is a console filling with thousands of identical stacks and a phone burning
 * its battery on it. Small enough to stop fast, above 1 so a genuinely transient
 * failure (a resize landing mid-draw) does not end the run.
 */
const MAX_FRAME_FAILURES = 5;
let frameFailures = 0;
let renderStopped = false;

function loop(now: number): void {
  if (renderStopped) return;
  // Scheduled *before* the work, not after: with the reschedule as the last
  // statement, a single throw in `renderFrame` ended the loop permanently and
  // froze the canvas with no error anywhere the player could see it.
  requestAnimationFrame(loop);

  try {
    renderTick(now);
    frameFailures = 0;
  } catch (error) {
    frameFailures++;
    if (frameFailures >= MAX_FRAME_FAILURES) {
      renderStopped = true;
      showErrorPanel('The game stopped drawing.', error);
    } else {
      console.error('Frame failed to render', error);
    }
  }
}

/**
 * Screen shake, in pixels, decaying per frame. A shift used to land as a violet
 * puff and a line of log text, which is a small acknowledgement for the floor
 * rearranging itself underneath you.
 *
 * Like particles, this has to keep marking the frame dirty for as long as it
 * runs — the render loop only draws when something asks it to. The displacement
 * is two out-of-phase sines rather than a random walk, which is both steadier to
 * look at and one less unseeded roll in a codebase whose whole determinism story
 * is that there are none.
 */
let shakeMagnitude = 0;
const SHIFT_SHAKE_PIXELS = 6;
const SHAKE_DECAY_PER_FRAME = 0.14;

function renderTick(now: number): void {
  const dt = Math.min(3, (now - lastFrame) / 16.67);
  lastFrame = now;

  if (particles.active) {
    particles.update(dt);
    dirty = true;
  }

  let shake: { x: number; y: number } | undefined;
  if (shakeMagnitude > 0.15) {
    shake = {
      x: Math.sin(now * 0.09) * shakeMagnitude,
      y: Math.cos(now * 0.13) * shakeMagnitude,
    };
    shakeMagnitude *= Math.max(0, 1 - SHAKE_DECAY_PER_FRAME * dt);
    dirty = true;
  } else if (shakeMagnitude !== 0) {
    // Settle exactly, so the last frame of a shake puts the world back where the
    // camera says it is rather than a fraction of a pixel off it forever.
    shakeMagnitude = 0;
    dirty = true;
  }

  if (dirty) {
    renderFrame(ctx, state, viewWidth, viewHeight, particles, shake);
    dirty = false;
  }
}

// Installed before anything else runs, so a failure during boot itself still has
// somewhere to land.
installGlobalErrorHandlers();

// Offline support and the update notice. Registration is fire-and-forget and
// cannot reject onto this path — a device without service workers simply plays
// online, and boot below is untouched either way.
registerServiceWorker(activate => showUpdatePrompt(activate));

/**
 * All three reads must land before the title opens: the settings screen would
 * otherwise show default bindings and the default skin over a saved set, and
 * Continue would offer nothing while a run sat on disk.
 *
 * None of them can reject — `save.ts`, `keybinds.ts` and `cosmetics.ts` all
 * report storage failure as
 * "nothing stored" — so a device with no usable IndexedDB (Safari Private
 * Browsing, iOS Lockdown Mode, a locked-down webview) reaches the title screen
 * with Continue greyed out. A run they cannot resume is a bad session; a title
 * screen that never draws is a dead install.
 */
async function boot(): Promise<void> {
  await loadKeybinds();
  await loadCosmetic();
  const saved = await loadRun();

  showTitleScreen({
    saved,
    // ?seed= only applies to a new run started from a cold load; a resumed run
    // carries the seed it was created with.
    onNewGame: config => startRun(readSeed(), config),
    onContinue: resumeRun,
  });
}

boot().catch(error => showErrorPanel('The game could not start.', error));
