import { createNewGame } from './core/game';
import { dispatchAction, GameAction } from './core/engine';
import { GameState } from './core/state';
import { computeCamera, renderFrame, TILE_SIZE } from './render/canvasRenderer';
import { ParticleSystem } from './render/particles';
import { attachControls } from './ui/controls';
import { mountUI, renderHotbar, renderInventory, renderLog, showEndModal, updateHud } from './ui/hud';

const root = document.getElementById('app');
if (!root) throw new Error('#app container missing');

const ui = mountUI(root);
const ctx = ui.canvas.getContext('2d');
if (!ctx) throw new Error('2D canvas context unavailable');

const particles = new ParticleSystem();

let state: GameState = createNewGame(readSeed());
let viewWidth = 0;
let viewHeight = 0;

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
}

/** Turn engine events into screen feedback. */
function reactToEvents(events: string[]): void {
  for (const text of events) {
    if (text.startsWith('You hit')) {
      particles.burst(state.player.position.x, state.player.position.y, '#00f0ff', 8);
    } else if (text.includes('damage') && !text.startsWith('You hit')) {
      particles.burst(state.player.position.x, state.player.position.y, '#ff0055', 10);
    } else if (text.toLowerCase().includes('shift')) {
      particles.burst(state.player.position.x, state.player.position.y, '#9d4edd', 16);
    }
  }
}

function act(action: GameAction): void {
  if (state.isGameOver) return;

  const { events } = dispatchAction(state, action);
  reactToEvents(events);

  updateHud(ui, state);
  renderLog(ui, state);
  renderHotbar(ui, state, useItem);
  if (!ui.inventorySheet.classList.contains('hidden')) {
    renderInventory(ui, state, useItem);
  }

  if (state.isGameOver) {
    showEndModal(ui, state, restart);
  }
}

function useItem(itemId: string): void {
  closeInventory();
  act({ type: 'USE_ITEM', itemId });
}

function openInventory(): void {
  renderInventory(ui, state, useItem);
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
  state = createNewGame(Math.floor(Math.random() * 1e9).toString(36));
  particles.clear();
  ui.modal.classList.add('hidden');
  closeInventory();
  updateHud(ui, state);
  renderLog(ui, state);
  renderHotbar(ui, state, useItem);
}

attachControls(ui.canvas, {
  move: (dx, dy) => act({ type: 'MOVE', dx, dy }),
  wait: () => act({ type: 'WAIT' }),
  ability: () => act({ type: 'ABILITY' }),
  descend: () => act({ type: 'DESCEND' }),
  toggleInventory,
  useHotbarSlot: (slot) => {
    const item = state.player.inventory[slot - 1];
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
root.querySelector('#btn-close-inventory')!.addEventListener('click', closeInventory);

// The viewport is flex-sized, so its box is only known after layout — observe it
// rather than measuring once at startup.
new ResizeObserver(resizeCanvas).observe(ui.canvas.parentElement!);

let lastFrame = performance.now();
function loop(now: number): void {
  const dt = Math.min(3, (now - lastFrame) / 16.67);
  lastFrame = now;

  particles.update(dt);
  renderFrame(ctx!, state, viewWidth, viewHeight, particles);
  requestAnimationFrame(loop);
}

resizeCanvas();
updateHud(ui, state);
renderLog(ui, state);
renderHotbar(ui, state, useItem);
requestAnimationFrame(loop);
