import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COSMETICS, cosmeticById, DEFAULT_COSMETIC_ID } from '../src/cosmetics';

describe('cosmetics', () => {
  it('resolves an id it does not know to the default rather than nothing', () => {
    expect(cosmeticById('a-skin-from-a-later-build').id).toBe(DEFAULT_COSMETIC_ID);
    expect(cosmeticById(undefined).id).toBe(DEFAULT_COSMETIC_ID);
    expect(cosmeticById(42).id).toBe(DEFAULT_COSMETIC_ID);
  });

  it('has a unique id per entry, so a selection is unambiguous', () => {
    expect(new Set(COSMETICS.map(c => c.id)).size).toBe(COSMETICS.length);
  });

  it('leaves every supporter cosmetic usable — nothing is gated during the alpha', () => {
    const supporter = COSMETICS.filter(c => c.supporter);
    expect(supporter.length).toBeGreaterThan(0);
    for (const c of supporter) expect(cosmeticById(c.id)).toBe(c);
  });

  it('draws with single ASCII glyphs, per the project rendering convention', () => {
    for (const c of COSMETICS) {
      expect(c.glyph).toHaveLength(1);
      expect(c.glyph.charCodeAt(0)).toBeLessThan(128);
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

/**
 * The load-bearing guarantee, checked structurally rather than by playing a run:
 * if nothing under `src/core/` can see the cosmetics module, no cosmetic can
 * reach the engine, the RNG, or anything a seed reproduces. A test that merely
 * played two runs would pass even after someone wired a skin into a roll.
 */
describe('cosmetics cannot touch the engine', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
    });
  }

  it('is imported by no file under src/core', () => {
    const offenders = sources('src/core').filter(path =>
      /from\s+'[^']*cosmetics'/.test(readFileSync(path, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});
