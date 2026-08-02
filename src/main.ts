import { createNewGame } from './core/game';
import { dispatchAction, GameAction } from './core/engine';
import { FloorMap, GameState, Position } from './core/state';
import type { HudElements } from './ui/hud';
import { findPath } from './core/map/pathfinding';
import { computeCamera, renderFrame, TILE_SIZE } from './render/canvasRenderer';
import { ParticleSystem } from './render/particles';
import { attachControls } from './ui/controls';
import { blocksGameInput, dismissTarget, ModalSnapshot } from './ui/modalGate';
import { showTitleScreen } from './ui/titleScreen';
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
  showShop,
  updateHud,
} from './ui/hud';
import { RunRecorder } from './telemetry/runLog';

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
    } else if (text.includes('damage')) {
      particles.burst(x, y, '#ff0055', 10);
    } else if (text.toLowerCase().includes('shift')) {
      particles.burst(x, y, '#9d4edd', 16);
    }
  }
}

function act(action: GameAction): void {
  if (state.isGameOver) return;
  // Any action the player takes themselves abandons the walk they were on.
  if (!isTravelStep) stopTravel();

  const from = { ...state.player.position };

  recorder.beginTurn(state, action);
  const { events } = dispatchAction(state, action);
  recorder.endTurn(state, events);

  // A MOVE that left the player standing still was a melee swing into that tile.
  const struck =
    action.type === 'MOVE' &&
    state.player.position.x === from.x &&
    state.player.position.y === from.y
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

  // The merchant is a thing on the floor: the only thing that raises his stock is
  // the player walking into him, which the engine reports for this one dispatch.
  if (state.shopOpened) openShop();

  // Autosave every turn. Writes on the same key are serialized by IndexedDB in
  // the order they are issued, so the last turn is what lands — including this
  // clear, which must not be overtaken by a save from the turn before it.
  if (state.isGameOver) void clearRun();
  else void saveRun(state);

  if (state.isGameOver) {
    showEndModal(ui, state, restart, returnToTitle);
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
  }
}

function resolveArmorOffer(equip: boolean): void {
  ui.armorModal.classList.add('hidden');
  act({ type: equip ? 'EQUIP_ARMOR' : 'DECLINE_ARMOR' });
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
    shop && !(shop.position.x === target.x && shop.position.y === target.y) ? shop.position : null;
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
  void loadRun().then(saved => {
    showTitleScreen({
      saved,
      onNewGame: config => startRun(randomSeed(), config),
      onContinue: resumeRun,
    });
  });
}

/** Resume a saved run. The state is the save itself, so nothing is re-derived. */
function resumeRun(saved: GameState): void {
  enterRun(saved);
}

function startRun(seed: string, config: RunConfig): void {
  enterRun(createNewGame(seed, config));
  // Save at turn 0 too, so a run abandoned before its first move is still there.
  void saveRun(state);
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

  ui = mountUI(root, useItem);
  const context = ui.canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  ctx = context;

  attachControls(ui.canvas, {
    move: (dx, dy) => act({ type: 'MOVE', dx, dy }),
    wait: () => act({ type: 'WAIT' }),
    ability: () => act({ type: 'ABILITY' }),
    descend: () => act({ type: 'DESCEND' }),
    toggleInventory,
    usePotion,
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
  root.querySelector('#btn-descend')!.addEventListener('click', () => act({ type: 'DESCEND' }));
  root.querySelector('#btn-inventory')!.addEventListener('click', toggleInventory);
  ui.potionBtn.addEventListener('click', usePotion);
  root.querySelector('#btn-close-inventory')!.addEventListener('click', closeInventory);

  // Tapping the backdrop dismisses. `e.target === el` is what keeps a tap on the
  // card — or on a button inside it — from closing the prompt out from under the
  // press. The backdrop is a sibling of the canvas and covers it, so this never
  // reaches the tap-to-travel handler. The end modal gets no such listener: a
  // dead run is not a prompt you escape.
  for (const backdrop of [ui.armorModal, ui.shopModal]) {
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

function loop(now: number): void {
  const dt = Math.min(3, (now - lastFrame) / 16.67);
  lastFrame = now;

  if (particles.active) {
    particles.update(dt);
    dirty = true;
  }

  if (dirty) {
    renderFrame(ctx, state, viewWidth, viewHeight, particles);
    dirty = false;
  }

  requestAnimationFrame(loop);
}

// Both reads must land before the title opens: the settings screen would
// otherwise show default bindings over a saved set, and Continue would offer
// nothing while a run sat on disk.
void loadKeybinds().then(() =>
  loadRun().then(saved => {
    showTitleScreen({
      saved,
      // ?seed= only applies to a new run started from a cold load; a resumed run
      // carries the seed it was created with.
      onNewGame: config => startRun(readSeed(), config),
      onContinue: resumeRun,
    });
  })
);
