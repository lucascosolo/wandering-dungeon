/**
 * Writes public/icon-192.png and public/icon-512.png.
 *
 * Committed as a script rather than as two binary blobs so the mark can be
 * regenerated when the palette moves — and because a PNG in the tree with no
 * recipe beside it is a file nobody dares touch.
 *
 * Everything here is hand-rolled on top of node:zlib. The project has two
 * runtime dependencies and no image toolchain, and an icon is not worth one:
 * a PNG is a signature, three chunks, and a CRC.
 *
 * Run: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Palette tokens, copied from src/styles/main.css. */
const BG = [0x0f, 0x0f, 0x15]; // --bg-main
const CYAN = [0x00, 0xf0, 0xff]; // --accent-cyan
const PURPLE = [0x9d, 0x4e, 0xdd]; // --accent-purple

/**
 * The title screen's mark (src/ui/titleScreen.ts) — a room, the player, a door
 * and the stairs out. The icon says the same thing the game says on open.
 */
const MARK = ['#####', '#@..>', '#.+.#', '#####'];

/** 5x7 cells per glyph, the smallest that keeps `@` and `#` legible. */
const GLYPH_W = 5;
const GLYPH_H = 7;

const GLYPHS = {
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '@': ['.###.', '#...#', '#.#.#', '#.###', '#....', '#...#', '.###.'],
  '.': ['.....', '.....', '.....', '.....', '.....', '..#..', '..#..'],
  '>': ['#....', '.#...', '..#..', '...#.', '..#..', '.#...', '#....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
};

/** One blank column/row between glyphs, so `##` does not fuse into a slab. */
const COLS = MARK[0].length * (GLYPH_W + 1) - 1;
const ROWS = MARK.length * (GLYPH_H + 1) - 1;

/** Fraction of the icon's width the mark spans. The rest is breathing room —
 *  and enough margin that a maskable/rounded crop cannot bite into a glyph. */
const MARK_FRACTION = 0.62;

/** How far the glow reaches past the mark's bounding box, in cells. */
const GLOW_SPILL_CELLS = 3;

/** Cell grid of the mark: 1 where a glyph pixel is lit. */
function buildMask() {
  const mask = new Float32Array(COLS * ROWS);
  MARK.forEach((line, row) => {
    [...line].forEach((char, col) => {
      const glyph = GLYPHS[char];
      if (!glyph) throw new Error(`no glyph for ${JSON.stringify(char)}`);
      const originX = col * (GLYPH_W + 1);
      const originY = row * (GLYPH_H + 1);
      glyph.forEach((glyphRow, y) => {
        [...glyphRow].forEach((cell, x) => {
          if (cell === '#') mask[(originY + y) * COLS + originX + x] = 1;
        });
      });
    });
  });
  return mask;
}

/**
 * Cheap glow: box-blur the cell mask a few times and sample it under the mark.
 * A true per-pixel distance field would be ~235M operations at 512²; blurring
 * at cell resolution (29x31) and upsampling looks the same at icon size.
 */
function blur(source, passes) {
  let current = source;
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float32Array(COLS * ROWS);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const sx = x + dx;
            const sy = y + dy;
            if (sx < 0 || sy < 0 || sx >= COLS || sy >= ROWS) continue;
            sum += current[sy * COLS + sx];
            count++;
          }
        }
        next[y * COLS + x] = sum / count;
      }
    }
    current = next;
  }
  return current;
}

/**
 * Bilinear sample of the blurred field, in cell coordinates. Nearest-neighbour
 * sampling made the glow a visible rectangle with hard edges — the blur is at
 * cell resolution, so the interpolation is what actually makes it a glow.
 */
function sampleGlow(field, cx, cy) {
  const x = Math.min(COLS - 1, Math.max(0, cx));
  const y = Math.min(ROWS - 1, Math.max(0, cy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(COLS - 1, x0 + 1);
  const y1 = Math.min(ROWS - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = field[y0 * COLS + x0] * (1 - fx) + field[y0 * COLS + x1] * fx;
  const bottom = field[y1 * COLS + x0] * (1 - fx) + field[y1 * COLS + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

function mix(base, over, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return [
    Math.round(base[0] + (over[0] - base[0]) * t),
    Math.round(base[1] + (over[1] - base[1]) * t),
    Math.round(base[2] + (over[2] - base[2]) * t),
  ];
}

function renderIcon(size) {
  const mask = buildMask();
  const glow = blur(mask, 3);

  // Integer cell size keeps every glyph pixel crisp — a fractional scale
  // resamples the mark into mush at 192px.
  const scale = Math.max(1, Math.floor((size * MARK_FRACTION) / COLS));
  const markW = COLS * scale;
  const markH = ROWS * scale;
  const offsetX = Math.round((size - markW) / 2);
  const offsetY = Math.round((size - markH) / 2);

  const pixels = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // The title screen's backdrop: a purple radial centred at 50% / 35%.
      const dx = (x - size * 0.5) / size;
      const dy = (y - size * 0.35) / size;
      const radial = Math.max(0, 1 - Math.hypot(dx, dy) / 0.6);
      let rgb = mix(BG, PURPLE, radial * radial * 0.22);

      // Continuous cell coordinates, centred on the cell, so the glow can be
      // interpolated and can spill past the mark's own bounding box.
      const gx = (x - offsetX) / scale - 0.5;
      const gy = (y - offsetY) / scale - 0.5;
      const outside = Math.max(0, -gx, gx - (COLS - 1), -gy, gy - (ROWS - 1));
      if (outside < GLOW_SPILL_CELLS) {
        const fade = 1 - outside / GLOW_SPILL_CELLS;
        rgb = mix(rgb, CYAN, sampleGlow(glow, gx, gy) * 0.5 * fade);
      }

      const cellX = Math.floor((x - offsetX) / scale);
      const cellY = Math.floor((y - offsetY) / scale);
      if (cellX >= 0 && cellY >= 0 && cellX < COLS && cellY < ROWS) {
        if (mask[cellY * COLS + cellX] === 1) rgb = CYAN;
      }

      const at = (y * size + x) * 3;
      pixels[at] = rgb[0];
      pixels[at + 1] = rgb[1];
      pixels[at + 2] = rgb[2];
    }
  }

  return encodePng(size, size, pixels);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** 8-bit truecolour, no interlace, filter 0 on every scanline. */
function encodePng(width, height, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(resolve(ROOT, 'public'), { recursive: true });
for (const size of [192, 512]) {
  const path = resolve(ROOT, 'public', `icon-${size}.png`);
  const png = renderIcon(size);
  writeFileSync(path, png);
  console.log(`wrote public/icon-${size}.png (${png.length} bytes)`);
}
