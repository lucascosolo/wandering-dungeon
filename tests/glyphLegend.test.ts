import { describe, expect, it } from 'vitest';
import { EnemyType } from '../src/core/state';
import { REGIONS } from '../src/core/regions';
import { ENEMY_STYLES } from '../src/render/canvasRenderer';
import { COSMETICS } from '../src/cosmetics';
import { enemySections, glyphLegendHtml, TERRAIN_LEGEND } from '../src/ui/glyphLegend';

/**
 * The Stasis Scorcher and the Cinder Gatekeeper shipped sharing `C`, which no
 * legend can fix — on the map they were the same letter. These guard the fix
 * rather than the wording of it.
 */
describe('Map glyphs', () => {
  const spawnable = (): EnemyType[] =>
    REGIONS.flatMap(region => [...region.enemyPool, region.boss]);

  const bosses = new Set<EnemyType>(REGIONS.map(region => region.boss));

  /**
   * What the renderer actually puts on the tile. Case carries species, not
   * state — the one exception is that a boss is uppercased, so `s` and `S` may
   * safely be two different monsters while a boss's capital may not.
   */
  const drawnGlyph = (type: EnemyType): string =>
    bosses.has(type) ? ENEMY_STYLES[type].glyph.toUpperCase() : ENEMY_STYLES[type].glyph;

  it('gives every enemy a glyph no other enemy draws', () => {
    const seen = new Map<string, EnemyType>();
    for (const type of Object.keys(ENEMY_STYLES) as EnemyType[]) {
      const drawn = drawnGlyph(type);
      expect(seen.get(drawn), `${type} collides with ${seen.get(drawn)}`).toBeUndefined();
      seen.set(drawn, type);
    }
  });

  it('keeps enemy glyphs clear of terrain, loot and the player', () => {
    const reserved = new Set([
      ...TERRAIN_LEGEND.map(entry => entry.glyph),
      ...COSMETICS.map(c => c.glyph),
    ]);
    for (const type of Object.keys(ENEMY_STYLES) as EnemyType[]) {
      expect(reserved.has(drawnGlyph(type)), type).toBe(false);
    }
  });

  it('names every enemy a run can actually spawn', () => {
    const named = new Set(enemySections().flatMap(s => s.entries.map(e => e.label)));
    for (const type of spawnable()) {
      expect(named.has(ENEMY_STYLES[type].label), type).toBe(true);
    }
  });

  /**
   * The Pursuer is in no region pool, so `enemySections` cannot reach it and the
   * key has to name it by hand. A hunter that cannot be killed is precisely the
   * glyph a player will look up.
   */
  it('names the Pursuer even though no region spawns it', () => {
    expect(REGIONS.flatMap(r => [...r.enemyPool, r.boss])).not.toContain('pursuer');
    expect(glyphLegendHtml()).toContain(ENEMY_STYLES.pursuer.label);
  });

  it('lists one section per region, guardian last', () => {
    const sections = enemySections();
    expect(sections).toHaveLength(REGIONS.length);
    sections.forEach((section, i) => {
      expect(section.title).toBe(REGIONS[i].name);
      expect(section.entries.at(-1)!.label).toBe(ENEMY_STYLES[REGIONS[i].boss].label);
    });
  });
});
