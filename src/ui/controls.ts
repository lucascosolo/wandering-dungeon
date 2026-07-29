export interface ControlHandlers {
  move: (dx: number, dy: number) => void;
  wait: () => void;
  ability: () => void;
  descend: () => void;
  toggleInventory: () => void;
  /** Tile coordinates of a tap inside the canvas, in map space. */
  tapTile: (x: number, y: number) => void;
  /** 1-based hotbar slot index, from number keys 1-4. */
  useHotbarSlot: (slot: number) => void;
}

const KEY_MOVES: Record<string, [number, number]> = {
  arrowup: [0, -1],
  w: [0, -1],
  arrowdown: [0, 1],
  s: [0, 1],
  arrowleft: [-1, 0],
  a: [-1, 0],
  arrowright: [1, 0],
  d: [1, 0],
};

const SWIPE_THRESHOLD = 24;

/**
 * Wire keyboard and touch input. Returns a teardown function.
 *
 * Touch: swipe in a cardinal direction to move, tap to act on a tile.
 * Desktop: WASD/arrows to move, space to wait, q for the shield, i for items.
 */
export function attachControls(canvas: HTMLCanvasElement, handlers: ControlHandlers): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();

    const move = KEY_MOVES[key];
    if (move) {
      e.preventDefault();
      handlers.move(move[0], move[1]);
      return;
    }

    if (key === ' ' || key === '.') {
      e.preventDefault();
      handlers.wait();
    } else if (key === 'q') {
      handlers.ability();
    } else if (key === 'i') {
      handlers.toggleInventory();
    } else if (key === '>' || key === 'enter') {
      handlers.descend();
    } else if (key >= '1' && key <= '4') {
      handlers.useHotbarSlot(Number(key));
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

  const onClick = (e: MouseEvent) => emitTap(e.clientX, e.clientY);

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
