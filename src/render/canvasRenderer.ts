import { EnemyType, GameState, TileType } from '../core/state';
import { ParticleSystem } from './particles';

export const TILE_SIZE = 30;

const TILE_COLORS: Record<TileType, string> = {
  wall: '#1b1b28',
  floor: '#262636',
  door: '#3d3054',
  stairs_down: '#1f4d52',
  chasm: '#08080c',
};

const COLOR_PLAYER = '#00f0ff';
const COLOR_ITEM = '#ffd166';
const COLOR_ARMOR = '#8fd9c0';

/**
 * A glyph and colour per enemy kind, so a threat can be read at a glance instead
 * of every enemy being an anonymous red `E`. The colours run cool-to-hot with
 * threat level, and deliberately avoid the hues that already carry meaning:
 * cyan is the player, gold is loot, mint is the stairs, and violet is a door or
 * an opening telegraph.
 */
export const ENEMY_STYLES: Record<EnemyType, { glyph: string; color: string; label: string }> = {
  crawler: { glyph: 'c', color: '#8a8f98', label: 'Crawler' },
  sentinel: { glyph: 'S', color: '#6fa8dc', label: 'Sentinel' },
  fracture_beast: { glyph: 'F', color: '#ff9f43', label: 'Fracture Beast' },
  warp_stalker: { glyph: 'W', color: '#ff5ecb', label: 'Warp Stalker' },
  collapse_behemoth: { glyph: 'B', color: '#ff2d2d', label: 'Collapse Behemoth' },
  hinge_warden: { glyph: 'H', color: '#c9a66b', label: 'Hinge Warden' },
  seam_skitter: { glyph: 's', color: '#e07a5f', label: 'Seam Skitter' },
};
const COLOR_TELEGRAPH = 'rgba(255, 0, 85, 0.35)';
const COLOR_TELEGRAPH_SHIFT = 'rgba(157, 78, 221, 0.3)';
const COLOR_GRID = 'rgba(255, 255, 255, 0.04)';

/** How many of the player's own turns a just-shifted tile keeps flashing for. */
const SHIFT_FLASH_TURNS = 2;

export interface Camera {
  offsetX: number;
  offsetY: number;
}

/**
 * Player-centred camera, clamped so the view never scrolls past the map edges
 * unless the map is smaller than the viewport (then it is centred).
 */
export function computeCamera(state: GameState, width: number, height: number): Camera {
  const mapPixelW = state.floorMap.width * TILE_SIZE;
  const mapPixelH = state.floorMap.height * TILE_SIZE;

  const centerX = width / 2 - (state.player.position.x + 0.5) * TILE_SIZE;
  const centerY = height / 2 - (state.player.position.y + 0.5) * TILE_SIZE;

  const offsetX = mapPixelW <= width ? (width - mapPixelW) / 2 : Math.min(0, Math.max(width - mapPixelW, centerX));
  const offsetY = mapPixelH <= height ? (height - mapPixelH) / 2 : Math.min(0, Math.max(height - mapPixelH, centerY));

  return { offsetX, offsetY };
}

const GLYPH_FONT = `bold ${Math.floor(TILE_SIZE * 0.62)}px ui-monospace, monospace`;

/**
 * Assumes `renderFrame` has already set the font and text alignment for this
 * frame. Assigning `ctx.font` re-parses the string every time, and this runs
 * once per visible glyph — on a weak device that adds up over a full frame.
 */
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: string,
  color: string,
  px: number,
  py: number
): void {
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillText(glyph, px + TILE_SIZE / 2, py + TILE_SIZE / 2 + 1);
  ctx.shadowBlur = 0;
}

/**
 * Draw one frame: tiles under fog of war, telegraphed collapse warnings,
 * item drops, enemies, the player, and any live particles.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number,
  particles?: ParticleSystem
): void {
  const { floorMap } = state;
  const { offsetX, offsetY } = computeCamera(state, width, height);

  ctx.fillStyle = '#0f0f15';
  ctx.fillRect(0, 0, width, height);

  ctx.font = GLYPH_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const firstX = Math.max(0, Math.floor(-offsetX / TILE_SIZE));
  const lastX = Math.min(floorMap.width - 1, Math.ceil((width - offsetX) / TILE_SIZE));
  const firstY = Math.max(0, Math.floor(-offsetY / TILE_SIZE));
  const lastY = Math.min(floorMap.height - 1, Math.ceil((height - offsetY) / TILE_SIZE));

  for (let y = firstY; y <= lastY; y++) {
    for (let x = firstX; x <= lastX; x++) {
      const explored = floorMap.explored[y][x];
      if (!explored) continue;

      const visible = floorMap.visible[y][x];
      const tile = floorMap.tiles[y][x];
      const px = x * TILE_SIZE + offsetX;
      const py = y * TILE_SIZE + offsetY;

      ctx.globalAlpha = visible ? 1 : 0.35;
      ctx.fillStyle = TILE_COLORS[tile.type];
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      if (tile.type !== 'wall') {
        ctx.strokeStyle = COLOR_GRID;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      }

      if (tile.type === 'stairs_down') {
        drawGlyph(ctx, '>', '#5ef2c4', px, py);
      } else if (tile.type === 'door') {
        drawGlyph(ctx, '+', '#c99bff', px, py);
      }

      // Collapse telegraph — only meaningful where the player can see it.
      if (visible && tile.isTelegraphedCollapse) {
        ctx.fillStyle = COLOR_TELEGRAPH;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      }

      // Room-slide / corridor-reconnect telegraph — a softer violet warning.
      if (visible && tile.isTelegraphedShift) {
        ctx.fillStyle = COLOR_TELEGRAPH_SHIFT;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#9d4edd';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        ctx.setLineDash([]);
      }

      ctx.globalAlpha = 1;
    }
  }

  // Flash tiles the last shift actually touched, fading out over a couple turns
  // so a change registers even if the player wasn't looking at that spot.
  const turnsSinceShift = state.turnCount - state.lastShiftTurn;
  if (turnsSinceShift >= 0 && turnsSinceShift < SHIFT_FLASH_TURNS) {
    const flashAlpha = 0.5 * (1 - turnsSinceShift / SHIFT_FLASH_TURNS);
    for (const { x, y } of state.lastShiftChanges) {
      if (!floorMap.explored[y]?.[x]) continue;
      const px = x * TILE_SIZE + offsetX;
      const py = y * TILE_SIZE + offsetY;
      ctx.fillStyle = `rgba(157, 78, 221, ${flashAlpha})`;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  }

  for (const drop of floorMap.drops ?? []) {
    const { x, y } = drop.position;
    if (!floorMap.visible[y][x]) continue;
    const isArmor = drop.item.category === 'armor';
    drawGlyph(
      ctx,
      isArmor ? '[' : '*',
      isArmor ? COLOR_ARMOR : COLOR_ITEM,
      x * TILE_SIZE + offsetX,
      y * TILE_SIZE + offsetY
    );
  }

  for (const enemy of state.entities) {
    if (enemy.hp <= 0) continue;
    const { x, y } = enemy.position;
    if (!floorMap.visible[y][x]) continue;

    const px = x * TILE_SIZE + offsetX;
    const py = y * TILE_SIZE + offsetY;
    const style = ENEMY_STYLES[enemy.enemyType];

    // Staggered enemies are dimmed rather than lowercased — the glyph's letter
    // now identifies the species, so case is no longer free to carry state.
    ctx.globalAlpha = enemy.staggeredTurns > 0 ? 0.45 : 1;
    drawGlyph(ctx, style.glyph, style.color, px, py);

    // HP pip under the glyph.
    const ratio = enemy.hp / enemy.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(px + 4, py + TILE_SIZE - 5, TILE_SIZE - 8, 3);
    ctx.fillStyle = style.color;
    ctx.fillRect(px + 4, py + TILE_SIZE - 5, (TILE_SIZE - 8) * ratio, 3);
    ctx.globalAlpha = 1;
  }

  const ppx = state.player.position.x * TILE_SIZE + offsetX;
  const ppy = state.player.position.y * TILE_SIZE + offsetY;
  if (state.player.shieldHp > 0) {
    ctx.strokeStyle = '#9d4edd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ppx + TILE_SIZE / 2, ppy + TILE_SIZE / 2, TILE_SIZE * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawGlyph(ctx, '@', COLOR_PLAYER, ppx, ppy);

  particles?.draw(ctx, TILE_SIZE, offsetX, offsetY);
}
