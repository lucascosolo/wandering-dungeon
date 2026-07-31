import { createNewGame } from './core/game';
import { dispatchAction, GameAction } from './core/engine';
import { FloorMap, GameState, Position } from './core/state';
import type { HudElements } from './ui/hud';
import { findPath } from './core/map/pathfinding';
import { computeCamera, renderFrame, TILE_SIZE } from './render/canvasRenderer';
import { ParticleSystem } from './render/particles';
import { attachControls } from './ui/controls';
import { showTitleScreen } from './ui/titleScreen';
import { loadKeybinds } from './ui/keybinds';
import { RunConfig } from './core/runConfig';
import {
  healthPotions,
  hotbarItems,
  mountUI,
  renderHotbar,
  renderInventory,
  renderLog,
  showArmorOffer,
  showEndModal,
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
  if (!ui.inventorySheet.classList.contains('hidden')) {
    renderInventory(ui, state);
  }

  if (state.pendingArmorOffer) {
    showArmorOffer(ui, state, resolveArmorOffer);
  }

  if (state.isGameOver) {
    showEndModal(ui, state, restart, returnToTitle);
  }
}

function resolveArmorOffer(equip: boolean): void {
  ui.armorModal.classList.add('hidden');
  act({ type: equip ? 'EQUIP_ARMOR' : 'DECLINE_ARMOR' });
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
  // standing in it. Either way the planned route is stale.
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
 */
function exploredMap(): FloorMap {
  const { floorMap } = state;
  return {
    ...floorMap,
    tiles: floorMap.tiles.map((row, y) =>
      row.map((tile, x) => (floorMap.explored[y][x] ? tile : { ...tile, type: 'wall' }))
    ),
  };
}

function travelTo(target: Position): void {
  stopTravel();

  const path = findPath(exploredMap(), state.player.position, target);
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
  showTitleScreen({ onNewGame: config => startRun(randomSeed(), config) });
}

/**
 * Wipe the shell back to a fresh run. Everything a run owns is replaced here, so
 * a second run cannot inherit a modal, a queued walk, or the previous log.
 */
function startRun(seed: string, config: RunConfig): void {
  if (!booted) bootGameShell();

  stopTravel();
  runConfig = config;
  state = createNewGame(seed, config);
  recorder = new RunRecorder(state);
  particles.clear();
  dirty = true;
  ui.modal.classList.add('hidden');
  ui.armorModal.classList.add('hidden');
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

// Bindings are read per keypress, but the title screen must not open before they
// load or the settings screen would show defaults over a saved set.
loadKeybinds().then(() => {
  showTitleScreen({ onNewGame: config => startRun(readSeed(), config) });
});
