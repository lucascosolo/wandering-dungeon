import { EnemyType } from '../core/state';
import { REGIONS } from '../core/regions';
import { ENEMY_STYLES } from '../render/canvasRenderer';
import { currentCosmetic } from '../cosmetics';
import { escapeHtml } from './escapeHtml';
import { showOverlayScreen } from './overlayScreen';

export interface LegendEntry {
  glyph: string;
  color: string;
  label: string;
  /** One line of what it is or does. Empty where the name says it all. */
  note: string;
}

/**
 * Terrain, loot and the merchant. Colours are the ones `canvasRenderer` draws
 * with, copied deliberately rather than imported: they are local constants
 * there, and a legend that silently fell back to a default colour would be worse
 * than one that is checked by eye against the map.
 */
export const TERRAIN_LEGEND: readonly LegendEntry[] = [
  { glyph: '>', color: '#5ef2c4', label: 'Stairs down', note: 'the way on; stand on it and Descend' },
  { glyph: '+', color: '#c99bff', label: 'Door', note: 'a seam between a room and a corridor' },
  { glyph: '*', color: '#ffd166', label: 'Item', note: 'walk over it to take it' },
  { glyph: '[', color: '#8fd9c0', label: 'Armour', note: 'a ringed piece rolled a modifier' },
  { glyph: ')', color: '#e09f3e', label: 'Weapon', note: 'walk over it to equip or swap' },
  { glyph: '$', color: '#f7b32b', label: 'Coins', note: 'for the merchant past the next guardian' },
  { glyph: '=', color: '#4af', label: 'Chest', note: 'bump to open — holds coins, items or armour; ringed to show it is interactable' },
  { glyph: '&', color: '#f2e8cf', label: 'Merchant', note: 'walk into him to trade; greyed and ringed once bought out' },
];

/**
 * The enemies a run can actually put in front of you, region by region, with
 * each region's arena guardian last.
 *
 * Built from `REGIONS` rather than from `ENEMY_STYLES` directly, which is why
 * the five legacy species (Crawler, Sentinel, Fracture Beast, Warp Stalker,
 * Collapse Behemoth) do not appear: they still have glyphs and a table row, but
 * no region pool references them, so nothing spawns them. A key that named them
 * would be teaching a tester letters they will never see.
 */
export function enemySections(): { title: string; entries: LegendEntry[] }[] {
  return REGIONS.map(region => ({
    title: region.name,
    entries: [
      ...region.enemyPool.map(type => entryFor(type, '')),
      entryFor(region.boss, 'guardian — drawn white; the arena is sealed until it falls'),
    ],
  }));
}

function entryFor(type: EnemyType, note: string): LegendEntry {
  const { glyph, color, label } = ENEMY_STYLES[type];
  return {
    glyph,
    color,
    label,
    note: note || SPECIES_NOTES[type] || '',
  };
}

/**
 * Only where the glyph alone leaves a tell unexplained. The Riftbound's is the
 * worked example of the "every state gets a visible tell" rule, and a player who
 * has not read that rule sees a monster standing still.
 */
const SPECIES_NOTES: Partial<Record<EnemyType, string>> = {
  riftbound: 'runs for the stairs, not for you; brightened and ringed once it holds them',
};

function entryRow(entry: LegendEntry): string {
  return `
    <div class="glyph-row">
      <span class="glyph-row__glyph" style="color:${entry.color}">${escapeHtml(entry.glyph)}</span>
      <span class="glyph-row__label">${escapeHtml(entry.label)}</span>
      ${entry.note ? `<span class="glyph-row__note">${escapeHtml(entry.note)}</span>` : ''}
    </div>`;
}

export function glyphLegendHtml(): string {
  const skin = currentCosmetic();

  return `
    <h2 class="setup__heading">Glyph Key</h2>
    <p class="settings__hint">Everything the map can draw, and what it means.</p>

    <section class="panel__section">
      <span class="setup__label">You and the floor</span>
      <div class="glyph-list">
        ${entryRow({ glyph: skin.glyph, color: skin.color, label: 'You', note: 'the glyph the screen is centred on' })}
        ${TERRAIN_LEGEND.map(entryRow).join('')}
        ${entryRow({ glyph: '#', color: '#ff0055', label: 'Red-outlined tile', note: 'closing when the countdown lands' })}
        ${entryRow({ glyph: '#', color: '#c99bff', label: 'Violet-outlined tile', note: 'opening or sliding when the countdown lands' })}
      </div>
    </section>

    <section class="panel__section">
      <span class="setup__label">What follows you down</span>
      <div class="glyph-list">
        ${entryRow(
          entryFor(
            'pursuer',
            'arrives on a floor you have lingered on; ringed, not barred, because it cannot be killed — only outrun, and the stairs lose it'
          )
        )}
      </div>
    </section>

    ${enemySections()
      .map(
        section => `
      <section class="panel__section">
        <span class="setup__label">${escapeHtml(section.title)}</span>
        <div class="glyph-list">${section.entries.map(entryRow).join('')}</div>
      </section>`
      )
      .join('')}

    <p class="settings__hint settings__hint--left">
      A dimmed foe is staggered and loses its next turn. The bar under a glyph is
      its remaining health; the one drawn with a ring instead has none to lose,
      and is the only thing on the map you are shown through the dark. Regions
      appear in the order above; a short run simply stops early.
    </p>
  `;
}

export function showGlyphLegend(onBack: () => void): void {
  showOverlayScreen(glyphLegendHtml(), onBack);
}
