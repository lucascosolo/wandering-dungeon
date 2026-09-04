import { Enemy, EnemyType, GameState, Position } from '../core/state';
import { regionForFloor } from '../core/regions';
import { isSoldOut } from '../core/shop';
import { ParticleSystem } from './particles';
import { AnimationTimeline } from './animation';
import { currentCosmetic } from '../cosmetics';
import { isFloorStabilized } from '../core/shift/shiftSystem';

export const TILE_SIZE = 30;

const COLOR_ITEM = '#ffd166';
const COLOR_ARMOR = '#8fd9c0';
const COLOR_ARMOR_MODIFIED = '#ffd166';
const COLOR_COIN = '#f7b32b';

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
  fracture_leech: { glyph: 'L', color: '#b56576', label: 'Fracture Leech' },
  riftbound: { glyph: 'R', color: '#7b68ee', label: 'Riftbound' },
  ashlock: { glyph: 'A', color: '#9c6644', label: 'Ashlock' },
  // `Z`, not `C`: the Cinder Gatekeeper owns `C`, and two species drawn as the
  // same letter is unreadable even on a desktop where the legend has hover text.
  // Bosses are drawn uppercased, so a glyph has to be free in *both* cases.
  stasis_scorcher: { glyph: 'Z', color: '#e76f51', label: 'Stasis Scorcher' },
  facet_reaver: { glyph: 'f', color: '#b8c0ff', label: 'Facet Reaver' },
  glass_moth: { glyph: 'm', color: '#80ded9', label: 'Glass Moth' },
  unmaking_hound: { glyph: 'U', color: '#d00000', label: 'Unmaking Hound' },
  null_scribe: { glyph: 'N', color: '#c77dff', label: 'Null Scribe' },
  hinge_sovereign: { glyph: 'Q', color: '#ffd166', label: 'Hinge Sovereign' },
  rift_regent: { glyph: 'M', color: '#9d4edd', label: 'Rift Regent' },
  cinder_gatekeeper: { glyph: 'C', color: '#e09f3e', label: 'Cinder Gatekeeper' },
  prism_refractor: { glyph: 'P', color: '#b8c0ff', label: 'Prism Refractor' },
  null_testament: { glyph: 'T', color: '#c77dff', label: 'Null Testament' },
  // Bone rather than a threat colour, and the one glyph on the board that is not
  // a letter of a name: it is not a species, and it should not read as one more
  // thing to fight.
  pursuer: { glyph: 'X', color: '#dcd6cc', label: 'The Long Patience' },
};
const COLOR_RIFTBOUND_GUARD = '#d9d0ff';
/** Ivory, so the merchant reads as neither loot nor a foe. White is the boss
 *  glyph, but no boss is alive on a floor that has a merchant on it. */
const COLOR_MERCHANT = '#f2e8cf';
const COLOR_MERCHANT_EMPTY = '#6f6a60';
const COLOR_TELEGRAPH = 'rgba(255, 0, 85, 0.35)';
const COLOR_TELEGRAPH_SHIFT = 'rgba(157, 78, 221, 0.3)';
const COLOR_HINGE = 'rgba(255, 183, 77, 0.65)';
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
export function computeCamera(
  state: GameState,
  width: number,
  height: number,
  /** Where the player is being drawn this frame, when that differs from where they stand. */
  focus: Position = state.player.position
): Camera {
  const mapPixelW = state.floorMap.width * TILE_SIZE;
  const mapPixelH = state.floorMap.height * TILE_SIZE;

  const centerX = width / 2 - (focus.x + 0.5) * TILE_SIZE;
  const centerY = height / 2 - (focus.y + 0.5) * TILE_SIZE;

  const offsetX = mapPixelW <= width ? (width - mapPixelW) / 2 : Math.min(0, Math.max(width - mapPixelW, centerX));
  const offsetY = mapPixelH <= height ? (height - mapPixelH) / 2 : Math.min(0, Math.max(height - mapPixelH, centerY));

  return { offsetX, offsetY };
}

/**
 * The Riftbound is the one enemy that paths to the stairs instead of the player,
 * and once it arrives the pathfinder gives it nowhere to go — so a monster doing
 * exactly its job looks like a monster that is broken. On station it gets a
 * brightened glyph and a dashed ring, which is the tell that it is holding the
 * exit. Adjacency counts, not just the exit tile itself: another enemy squatting
 * the stairs parks the Riftbound one step short, still guarding.
 */
export function isGuardingExit(enemy: Enemy, exit: Position): boolean {
  if (enemy.enemyType !== 'riftbound' || enemy.hp <= 0) return false;
  return (
    Math.max(Math.abs(enemy.position.x - exit.x), Math.abs(enemy.position.y - exit.y)) <= 1
  );
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
 * The motion layer and the wall-clock it is being drawn at. Absent in tests
 * and anywhere the board is drawn without a running loop.
 */
export interface Motion {
  anim: AnimationTimeline;
  now: number;
}

/**
 * How hard the floor is leaning on the player right now, 0–1, from the shift
 * clock alone. Drives everything that pulses while the player is thinking: the
 * telegraph tiles, the vignette, the tick. Stasis and a stabilized floor are
 * calm by definition — pressure is a thing the clock does.
 */
export function pressureLevel(state: GameState): number {
  if (isFloorStabilized(state) || state.isStasisActive) return 0;
  const max = Math.max(1, state.nextShiftCountdownMax);
  const remaining = Math.max(0, state.shiftCountdown);
  if (remaining > 3) return 0;
  return Math.min(1, (4 - remaining) / 4 + (1 - remaining / max) * 0.25);
}

/**
 * Whether anything on the board wants to move between turns. The loop draws
 * every frame only while this is true, so a calm floor still costs nothing to
 * hold on screen.
 */
export function wantsIdleFrames(state: GameState): boolean {
  if (state.isGameOver) return false;
  if (pressureLevel(state) > 0) return true;
  if (state.pendingShift) return true;
  return state.entities.some(e => e.hp > 0 && e.enemyType === 'pursuer');
}

/** A slow breath, 0–1, whose rate climbs with `pressure`. */
function breathe(now: number, pressure: number, phase = 0): number {
  const hz = 0.7 + pressure * 2.3;
  return 0.5 + 0.5 * Math.sin(now * 0.001 * hz * Math.PI * 2 + phase);
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
  particles?: ParticleSystem,
  /**
   * Screen shake, in pixels, applied to the camera rather than to the canvas
   * transform — the background fill has to stay put, or a shake would show bare
   * edges where the world slid off.
   */
  shake?: { x: number; y: number },
  motion?: Motion
): void {
  const { floorMap } = state;
  const now = motion?.now ?? 0;
  const drawnPlayer = motion
    ? motion.anim.positionOf(state.player.id, state.player.position)
    : state.player.position;
  const camera = computeCamera(state, width, height, drawnPlayer);
  const offsetX = camera.offsetX + (shake?.x ?? 0);
  const offsetY = camera.offsetY + (shake?.y ?? 0);
  const region = regionForFloor(floorMap.level);
  const hasHingeStress = region.index === 0;
  const pressure = pressureLevel(state);
  // The telegraphs breathe faster as the clock runs down; a still warning is a
  // warning the eye has already filed away.
  const telegraphPulse = motion ? 0.6 + 0.4 * breathe(now, pressure) : 1;

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
      ctx.fillStyle = tile.type === 'stairs_down' ? region.palette.stairs : region.palette[tile.type];
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
        if (hasHingeStress) {
          ctx.strokeStyle = COLOR_HINGE;
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        }
      }

      // Collapse telegraph — only meaningful where the player can see it.
      if (visible && tile.isTelegraphedCollapse) {
        ctx.globalAlpha = telegraphPulse;
        ctx.fillStyle = COLOR_TELEGRAPH;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        ctx.globalAlpha = visible ? 1 : 0.35;
      }

      // Room-slide / corridor-reconnect telegraph — a softer violet warning.
      if (visible && tile.isTelegraphedShift) {
        ctx.globalAlpha = telegraphPulse;
        ctx.fillStyle = COLOR_TELEGRAPH_SHIFT;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#9d4edd';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        ctx.setLineDash([]);
        ctx.globalAlpha = visible ? 1 : 0.35;
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

  // Kill flash — brief red flash where an enemy was felled
  if (state.lastKillPosition && floorMap.visible[state.lastKillPosition.y]?.[state.lastKillPosition.x]) {
    const { x, y } = state.lastKillPosition;
    const px = x * TILE_SIZE + offsetX;
    const py = y * TILE_SIZE + offsetY;
    ctx.fillStyle = 'rgba(255, 60, 60, 0.35)';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }

  // Floating pickup name
  if (state.lastPickupName && state.lastPickupPosition) {
    const { x, y } = state.lastPickupPosition;
    if (floorMap.visible[y]?.[x]) {
      const px = x * TILE_SIZE + offsetX;
      const py = y * TILE_SIZE + offsetY;
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(state.lastPickupName, px + TILE_SIZE / 2, py - 4);
    }
  }

  for (const drop of floorMap.drops ?? []) {
    const { x, y } = drop.position;
    if (!floorMap.visible[y][x]) continue;
    const glyph =
      drop.item.category === 'armor' ? '[' : drop.item.category === 'currency' ? '$' : drop.item.category === 'weapon' ? ')' : '*';
    const color =
      drop.item.category === 'armor'
        ? COLOR_ARMOR
        : drop.item.category === 'currency'
          ? COLOR_COIN
          : drop.item.category === 'weapon'
            ? '#e09f3e'
            : COLOR_ITEM;
    const px = x * TILE_SIZE + offsetX;
    const py = y * TILE_SIZE + offsetY;
    drawGlyph(ctx, glyph, color, px, py);
    // A rolled modifier is persistent state on the piece, so it reads off the map
    // and not only out of the prompt: a ringed `[` is worth the walk, a bare one
    // is only a number. Same idiom as the bought-out stall's ring.
    if (drop.item.modifier) {
      ctx.strokeStyle = COLOR_ARMOR_MODIFIED;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }
  }

  for (const chest of floorMap.chests ?? []) {
    const { x, y } = chest.position;
    if (!floorMap.visible[y][x]) continue;
    const glyph = '=';
    const color = '#4af';
    const px = x * TILE_SIZE + offsetX;
    const py = y * TILE_SIZE + offsetY;
    drawGlyph(ctx, glyph, color, px, py);
    if (!chest.looted) {
      // Ring around an unopened chest so it reads as interactable
      ctx.strokeStyle = '#4af';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }
  }

  const { shop } = state;
  if (shop && floorMap.visible[shop.position.y][shop.position.x]) {
    const px = shop.position.x * TILE_SIZE + offsetX;
    const py = shop.position.y * TILE_SIZE + offsetY;
    // Bought out is a persistent state, so it reads on the map and not only in
    // the log: the stall greys out and takes a dashed ring, the same idiom the
    // Riftbound uses for "standing here on purpose".
    const empty = isSoldOut(shop);
    drawGlyph(ctx, '&', empty ? COLOR_MERCHANT_EMPTY : COLOR_MERCHANT, px, py);
    if (empty) {
      ctx.strokeStyle = COLOR_MERCHANT_EMPTY;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(px + 1.5, py + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
      ctx.setLineDash([]);
    }
  }

  for (const enemy of state.entities) {
    if (enemy.hp <= 0) continue;
    const { x, y } = enemy.position;
    const seen = floorMap.visible[y][x];
    // The Pursuer is drawn through the dark, and it is the only thing that is.
    // Everything else on the board is something you find; this is something that
    // finds you, and a hunter you cannot watch closing is just a sudden death.
    const hunting = enemy.enemyType === 'pursuer';
    if (!seen && !hunting) continue;

    const drawn = motion ? motion.anim.positionOf(enemy.id, enemy.position) : enemy.position;
    const px = drawn.x * TILE_SIZE + offsetX;
    const py = drawn.y * TILE_SIZE + offsetY;
    const style = ENEMY_STYLES[enemy.enemyType];

    if (enemy.bossTarget) {
      ctx.strokeStyle = enemy.enemyType === 'null_testament' ? '#80ded9' : '#ff4d6d';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        enemy.bossTarget.x * TILE_SIZE + offsetX + 2,
        enemy.bossTarget.y * TILE_SIZE + offsetY + 2,
        TILE_SIZE - 4,
        TILE_SIZE - 4
      );
    }

    // Staggered enemies are dimmed rather than lowercased — the glyph's letter
    // now identifies the species, so case is no longer free to carry state.
    // Out of sight it is drawn faded: you are told where it is, not what it is
    // doing. Staggered wins over that — losing a turn is the more useful fact.
    ctx.globalAlpha = enemy.staggeredTurns > 0 ? 0.45 : seen ? 1 : 0.6;
    const guarding = isGuardingExit(enemy, floorMap.exit);
    const glyphColor = enemy.isBoss ? '#ffffff' : guarding ? COLOR_RIFTBOUND_GUARD : style.color;
    drawGlyph(ctx, enemy.isBoss ? style.glyph.toUpperCase() : style.glyph, glyphColor, px, py);

    if (guarding) {
      ctx.strokeStyle = COLOR_RIFTBOUND_GUARD;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(px + 1.5, py + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
      ctx.setLineDash([]);
    }

    if (hunting) {
      // A closed ring instead of a health bar. It has no health to report, and a
      // bar pinned at full for a whole floor reads as a bug rather than a rule.
      // The ring breathes and the glyph flickers: a hunter that never moves
      // between turns reads as a marker, and this is the one thing on the board
      // that is coming for you whether you act or not.
      const beat = motion ? breathe(now, 0.4, 1.3) : 1;
      ctx.globalAlpha *= 0.55 + 0.45 * beat;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE * (0.36 + 0.08 * beat), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // HP pip under the glyph.
      const ratio = enemy.hp / enemy.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(px + 4, py + TILE_SIZE - 5, TILE_SIZE - 8, 3);
      ctx.fillStyle = style.color;
      ctx.fillRect(px + 4, py + TILE_SIZE - 5, (TILE_SIZE - 8) * ratio, 3);
    }
    ctx.globalAlpha = 1;
  }

  const ppx = drawnPlayer.x * TILE_SIZE + offsetX;
  const ppy = drawnPlayer.y * TILE_SIZE + offsetY;
  if (state.player.shieldHp > 0) {
    ctx.strokeStyle = '#9d4edd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ppx + TILE_SIZE / 2, ppy + TILE_SIZE / 2, TILE_SIZE * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Read per frame rather than captured at module load: the settings screen can
  // change it mid-run, and the next frame is expected to show it.
  const skin = currentCosmetic();
  drawGlyph(ctx, skin.glyph, skin.color, ppx, ppy);

  particles?.draw(ctx, TILE_SIZE, offsetX, offsetY);

  if (motion) {
    drawFloaters(ctx, motion.anim, offsetX, offsetY);
    drawPressureVignette(ctx, width, height, pressure, now);
  }
}

/**
 * Damage figures and short verdicts drifting up off the tile they happened on.
 * Drawn last, over everything, with a dark outline so a number is legible on a
 * lit floor and in the dark alike.
 */
function drawFloaters(
  ctx: CanvasRenderingContext2D,
  anim: AnimationTimeline,
  offsetX: number,
  offsetY: number
): void {
  const frames = anim.floaterFrames();
  if (frames.length === 0) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const f of frames) {
    // Pops in slightly large and settles, so the landing has an impact frame.
    const pop = f.progress < 0.12 ? 1.35 - (f.progress / 0.12) * 0.35 : 1;
    const size = Math.round(13 * f.scale * pop);
    ctx.font = `bold ${size}px ui-monospace, monospace`;
    ctx.globalAlpha = Math.max(0, f.alpha);
    const x = (f.x + 0.5) * TILE_SIZE + offsetX;
    const y = (f.y + 0.2 - f.rise) * TILE_SIZE + offsetY;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.strokeText(f.text, x, y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, x, y);
  }
  ctx.globalAlpha = 1;
  ctx.font = GLYPH_FONT;
}

/**
 * The edges of the viewport close in, red, as the shift clock runs out —
 * breathing faster the closer it gets. Pressure that lives only in a number in
 * the corner of the HUD is pressure the player can choose not to look at.
 */
function drawPressureVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pressure: number,
  now: number
): void {
  if (pressure <= 0) return;
  const strength = pressure * (0.35 + 0.65 * breathe(now, pressure));
  const radius = Math.hypot(width, height) / 2;
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    radius * (0.55 - 0.15 * pressure),
    width / 2,
    height / 2,
    radius
  );
  gradient.addColorStop(0, 'rgba(255, 0, 85, 0)');
  gradient.addColorStop(1, `rgba(255, 0, 85, ${(0.18 + 0.32 * pressure) * strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}
