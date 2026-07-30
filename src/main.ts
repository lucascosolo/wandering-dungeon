import { createNewGame } from './core/game';
import { dispatchAction, GameAction } from './core/engine';
import { GameState } from './core/state';
import { computeCamera, renderFrame, TILE_SIZE } from './render/canvasRenderer';
import { ParticleSystem } from './render/particles';
import { attachControls } from './ui/controls';
import {
  healthPotions,
  hotbarItems,
  mountUI,
  renderHotbar,
  renderInventory,
  renderLog,
  showEndModal,
  updateHud,
} from './ui/hud';
import { RunRecorder } from './telemetry/runLog';

const root = document.getElementById('app');
if (!root) throw new Error('#app container missing');

const ui = mountUI(root, useItem);
const ctx = ui.canvas.getContext('2d');
if (!ctx) throw new Error('2D canvas context unavailable');

const particles = new ParticleSystem();

let state: GameState = createNewGame(readSeed());
let recorder = new RunRecorder(state);
let viewWidth = 0;
let viewHeight = 0;

/**
 * The board only changes when the player acts, so the render loop repaints on
 * demand rather than every frame — it draws once per dirty mark, then keeps
 * drawing only while particles are still moving. A turn-based game holding a
 * phone's GPU at 60fps to redraw an identical grid is pure battery cost.
 */
let dirty = true;

/** Seed comes from ?seed= so a run can be shared or replayed exactly. */
function readSeed(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('seed');
  return fromUrl && fromUrl.length > 0
    ? fromUrl
    : Math.floor(Math.random() * 1e9).toString(36);
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

  if (state.isGameOver) {
    showEndModal(ui, state, restart);
  }
}

function useItem(itemId: string): void {
  closeInventory();
  act({ type: 'USE_ITEM', itemId });
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
  // Close the old run's log before the state it describes is thrown away.
  recorder.flush();
  state = createNewGame(Math.floor(Math.random() * 1e9).toString(36));
  recorder = new RunRecorder(state);
  particles.clear();
  dirty = true;
  ui.modal.classList.add('hidden');
  closeInventory();
  updateHud(ui, state);
  renderLog(ui, state);
  renderHotbar(ui, state);
}

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

    // Only act on cardinally adjacent tiles — matches the melee/move rules.
    if (Math.abs(dx) + Math.abs(dy) === 1) act({ type: 'MOVE', dx, dy });
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

let lastFrame = performance.now();

function loop(now: number): void {
  const dt = Math.min(3, (now - lastFrame) / 16.67);
  lastFrame = now;

  if (particles.active) {
    particles.update(dt);
    dirty = true;
  }

  if (dirty) {
    renderFrame(ctx!, state, viewWidth, viewHeight, particles);
    dirty = false;
  }

  requestAnimationFrame(loop);
}

resizeCanvas();
updateHud(ui, state);
renderLog(ui, state);
renderHotbar(ui, state);
requestAnimationFrame(loop);
