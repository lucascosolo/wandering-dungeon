import { actionForKey, currentKeybinds, MOVE_DELTAS } from './keybinds';

export interface ControlHandlers {
  move: (dx: number, dy: number) => void;
  wait: () => void;
  ability: () => void;
  descend: () => void;
  toggleInventory: () => void;
  /** Drink a Health Potion, bound to its own key rather than a hotbar slot. */
  usePotion: () => void;
  /** Tile coordinates of a tap inside the canvas, in map space. */
  tapTile: (x: number, y: number) => void;
  /** 1-based hotbar slot index, from number keys 1-4. */
  useHotbarSlot: (slot: number) => void;
}

const SWIPE_THRESHOLD = 24;

/**
 * Wire keyboard and touch input. Returns a teardown function.
 *
 * Touch: swipe in a cardinal direction to move, tap to act on a tile.
 * Desktop keys come from `currentKeybinds()`, read per keypress so a rebind in
 * the settings screen applies without re-attaching anything.
 */
export function attachControls(canvas: HTMLCanvasElement, handlers: ControlHandlers): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const action = actionForKey(currentKeybinds(), e.key.toLowerCase());
    if (!action) return;

    const move = MOVE_DELTAS[action];
    if (move) {
      e.preventDefault();
      handlers.move(move[0], move[1]);
      return;
    }

    switch (action) {
      case 'wait':
        e.preventDefault();
        handlers.wait();
        break;
      case 'ability':
        handlers.ability();
        break;
      case 'inventory':
        handlers.toggleInventory();
        break;
      case 'potion':
        handlers.usePotion();
        break;
      case 'descend':
        handlers.descend();
        break;
      default:
        handlers.useHotbarSlot(Number(action.slice(-1)));
    }
  };

  let startX = 0;
  let startY = 0;

  const onTouchStart = (e: TouchEvent) => {
    const touch = e.changedTouches[0];
    startX = touch.clientX;
    startY = touch.clientY;
  };

  const onTouchEnd = (e: TouchEvent) => {
    lastTouchAt = performance.now();
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(dy) > SWIPE_THRESHOLD) {
      if (Math.abs(dx) > Math.abs(dy)) {
        handlers.move(Math.sign(dx), 0);
      } else {
        handlers.move(0, Math.sign(dy));
      }
      return;
    }

    emitTap(touch.clientX, touch.clientY);
  };

  // A touch also emits a synthetic click, which would tap the same tile twice —
  // harmless for a move, but a double swing at whatever is standing there.
  let lastTouchAt = 0;
  const onClick = (e: MouseEvent) => {
    if (performance.now() - lastTouchAt < 700) return;
    emitTap(e.clientX, e.clientY);
  };

  function emitTap(clientX: number, clientY: number): void {
    const rect = canvas.getBoundingClientRect();
    handlers.tapTile(clientX - rect.left, clientY - rect.top);
  }

  window.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchend', onTouchEnd, { passive: true });
  canvas.addEventListener('click', onClick);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('click', onClick);
  };
}
