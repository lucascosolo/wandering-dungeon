import { EnemyType, GameState, Item } from '../core/state';
import { regionForFloor } from '../core/regions';
import { ENEMY_STYLES } from '../render/canvasRenderer';

/** How many quick-use slots the hotbar exposes, bound to keys 1-4. */
export const HOTBAR_SIZE = 4;

/**
 * Healing is too important to hunt for among situational items, so potions get
 * their own always-visible readout and key and are kept out of the hotbar —
 * which also leaves all four slots for the items a player actually has to
 * choose between.
 */
export function healthPotions(state: GameState): Item[] {
  return state.player.inventory.filter(item => item.type === 'health_potion');
}

/**
 * The hotbar's contents. Both the display and the number-key handler read this,
 * because two separate derivations of "what is in slot N" would drift the
 * moment one of them learned about a filter the other did not.
 */
export function hotbarItems(state: GameState): Item[] {
  return state.player.inventory
    .filter(item => item.type !== 'health_potion')
    .slice(0, HOTBAR_SIZE);
}

export interface HudElements {
  canvas: HTMLCanvasElement;
  floorLabel: HTMLElement;
  regionBanner: HTMLElement;
  turnLabel: HTMLElement;
  shiftPill: HTMLElement;
  hpFill: HTMLElement;
  hpLabel: HTMLElement;
  shieldFill: HTMLElement;
  potionBtn: HTMLButtonElement;
  potionCount: HTMLElement;
  armorChip: HTMLElement;
  armorName: HTMLElement;
  coinCount: HTMLElement;
  armorModal: HTMLElement;
  logPanel: HTMLElement;
  hotbar: HTMLElement;
  inventorySheet: HTMLElement;
  inventoryList: HTMLElement;
  modal: HTMLElement;
  abilityBtn: HTMLButtonElement;
  descendBtn: HTMLButtonElement;
}

/**
 * The enemy key, built from the renderer's own glyph table so the legend cannot
 * drift from what is actually drawn. Listed weakest to deadliest.
 */
function enemyLegend(): string {
  return (Object.keys(ENEMY_STYLES) as EnemyType[])
    .map(type => {
      const { glyph, color, label } = ENEMY_STYLES[type];
      return `<span style="color:${color}" title="${label}">${glyph}</span>`;
    })
    .join('');
}

/**
 * Build the whole game shell once and hand back the nodes the loop updates.
 * `onUseItem` is bound once here, delegated from the hotbar and inventory
 * containers, so redrawing their contents never has to rebind anything.
 */
export function mountUI(root: HTMLElement, onUseItem: (itemId: string) => void): HudElements {
  root.innerHTML = `
    <header class="hud-header">
      <div class="hud-stat"><span class="hud-stat__label">Floor</span><span id="floor-label">1</span></div>
      <div class="shift-pill" id="shift-pill">SHIFT IN —</div>
      <div class="hud-stat"><span class="hud-stat__label">Turn</span><span id="turn-label">0</span></div>
    </header>

    <div class="legend">
      @ you &middot; * item &middot; [ armor &middot; $ coins &middot; + door &middot; &gt; stairs &middot;
      foes <span class="legend__foes">${enemyLegend()}</span>
      <span class="legend__hint">weak&rarr;deadly</span> &middot;
      <span class="legend__warn legend__warn--close">red</span> closing &middot;
      <span class="legend__warn legend__warn--open">violet</span> opening
    </div>

    <div class="vitals">
      <div class="bar bar--hp"><div class="bar__fill" id="hp-fill"></div><span class="bar__label" id="hp-label"></span></div>
      <div class="bar bar--shield"><div class="bar__fill" id="shield-fill"></div></div>
    </div>

    <div class="game-viewport">
      <div class="region-banner" id="region-banner" role="status" aria-live="polite" aria-atomic="true"></div>
      <canvas id="game-canvas"></canvas>
    </div>

    <div class="log-panel" id="log-panel"></div>

    <div class="quick-row">
      <button class="potion" id="potion-btn" type="button">
        <span class="potion__glyph">!</span>
        <span class="potion__name">Health Potions</span>
        <span class="potion__count" id="potion-count">0</span>
        <small class="potion__key">h</small>
      </button>

      <div class="armor-chip" id="armor-chip">
        <span class="armor-chip__glyph">[</span>
        <span class="armor-chip__name" id="armor-name">Unarmoured</span>
      </div>

      <div class="coin-chip" id="coin-chip">
        <span class="coin-chip__glyph">$</span>
        <span class="coin-chip__count" id="coin-count">0</span>
      </div>
    </div>

    <div class="hotbar" id="hotbar"></div>

    <div class="thumb-action-bar">
      <button class="action-btn" id="btn-wait" type="button">Wait<small>space</small></button>
      <button class="action-btn" id="btn-ability" type="button">Shield<small>q</small></button>
      <button class="action-btn" id="btn-inventory" type="button">Items<small>i</small></button>
      <button class="action-btn action-btn--warning" id="btn-descend" type="button">Descend<small>&gt;</small></button>
    </div>

    <div class="sheet hidden" id="inventory-sheet">
      <div class="sheet__header"><h2>Inventory</h2><button class="sheet__close" id="btn-close-inventory" type="button">✕</button></div>
      <div class="sheet__list" id="inventory-list"></div>
    </div>

    <div class="modal hidden" id="armor-modal"></div>
    <div class="modal hidden" id="modal"></div>
  `;

  const byId = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!;

  const delegateItemUse = (container: HTMLElement): void => {
    container.addEventListener('click', e => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-item-id]');
      if (slot?.dataset.itemId) onUseItem(slot.dataset.itemId);
    });
  };
  delegateItemUse(byId('hotbar'));
  delegateItemUse(byId('inventory-list'));

  return {
    canvas: byId<HTMLCanvasElement>('game-canvas'),
    floorLabel: byId('floor-label'),
    regionBanner: byId('region-banner'),
    turnLabel: byId('turn-label'),
    shiftPill: byId('shift-pill'),
    hpFill: byId('hp-fill'),
    hpLabel: byId('hp-label'),
    shieldFill: byId('shield-fill'),
    potionBtn: byId<HTMLButtonElement>('potion-btn'),
    potionCount: byId('potion-count'),
    armorChip: byId('armor-chip'),
    armorName: byId('armor-name'),
    coinCount: byId('coin-count'),
    armorModal: byId('armor-modal'),
    logPanel: byId('log-panel'),
    hotbar: byId('hotbar'),
    inventorySheet: byId('inventory-sheet'),
    inventoryList: byId('inventory-list'),
    modal: byId('modal'),
    abilityBtn: byId<HTMLButtonElement>('btn-ability'),
    descendBtn: byId<HTMLButtonElement>('btn-descend'),
  };
}

export function updateHud(ui: HudElements, state: GameState): void {
  const { player, floorMap } = state;

  ui.floorLabel.textContent = `${floorMap.level}/${state.config.finalFloor}`;
  ui.turnLabel.textContent = String(state.turnCount);

  const region = regionForFloor(floorMap.level);
  const regionChanged = ui.regionBanner.dataset.region !== String(region.index);
  const regionLabel = state.clearedRegions.includes(region.index)
    ? `${region.name} · CLEARED`
    : region.name;
  if (regionChanged) {
    ui.regionBanner.dataset.region = String(region.index);
    ui.regionBanner.style.setProperty('--region-accent', region.palette.accent);
    ui.regionBanner.classList.remove('region-banner--enter');
    void ui.regionBanner.offsetWidth;
    ui.regionBanner.classList.add('region-banner--enter');
  }
  ui.regionBanner.textContent = regionLabel;

  if (state.isStasisActive) {
    ui.shiftPill.textContent = `STASIS ${state.stasisTurnsRemaining}`;
    ui.shiftPill.className = 'shift-pill shift-pill--stasis';
  } else {
    ui.shiftPill.textContent = `SHIFT IN ${state.shiftCountdown}`;
    ui.shiftPill.className =
      state.shiftCountdown <= 2 ? 'shift-pill shift-pill--danger' : 'shift-pill';
  }

  ui.hpFill.style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
  ui.hpLabel.textContent = `${player.hp} / ${player.maxHp}`;
  ui.shieldFill.style.width = `${Math.min(100, (player.shieldHp / player.maxHp) * 100)}%`;

  ui.coinCount.textContent = String(player.coins);

  const potions = healthPotions(state).length;
  ui.potionCount.textContent = String(potions);
  // Stays visible at zero so the option is known before it is needed, and
  // disabled at full HP so a scarce potion cannot be poured away for nothing.
  ui.potionBtn.disabled = potions === 0 || player.hp >= player.maxHp;

  const { armor } = player;
  ui.armorName.textContent = armor ? `${armor.name} −${armor.defense}` : 'Unarmoured';
  ui.armorChip.classList.toggle('armor-chip--empty', !armor);

  const onStairs = floorMap.tiles[player.position.y][player.position.x].type === 'stairs_down';
  ui.descendBtn.disabled = !onStairs;
  ui.abilityBtn.disabled = state.abilityCooldown > 0 || player.shieldTurnsRemaining > 0;
}

/** Only the last few lines show, older ones fading out — a HUD log, not a scrollback. */
const LOG_VISIBLE_LINES = 4;

export function renderLog(ui: HudElements, state: GameState): void {
  const recent = state.eventLog.slice(-LOG_VISIBLE_LINES);
  ui.logPanel.innerHTML = recent
    .map((m, i) => {
      const age = recent.length - 1 - i;
      return `<div class="log-line log-line--${m.type}" style="opacity:${1 - age * 0.22}">${escapeHtml(m.text)}</div>`;
    })
    .join('');
}

/**
 * Quick-use row for the first few situational items, so using a Stasis Flask
 * mid-fight doesn't require opening the full inventory sheet.
 *
 * Skips the rebuild when the slots are unchanged: this is called after every
 * action, and most actions do not touch the inventory at all.
 */
export function renderHotbar(ui: HudElements, state: GameState): void {
  const slots = hotbarItems(state);
  const signature = slots.map(item => item.id).join('|');
  if (ui.hotbar.dataset.slots === signature) return;
  ui.hotbar.dataset.slots = signature;

  ui.hotbar.innerHTML = slots
    .map(
      (item, i) => `
      <button class="hotbar-slot" data-item-id="${item.id}" type="button" title="${escapeHtml(item.description)}">
        <span class="hotbar-slot__key">${i + 1}</span>
        <span class="hotbar-slot__name">${escapeHtml(item.name)}</span>
      </button>`
    )
    .join('');
}

export function renderInventory(ui: HudElements, state: GameState): void {
  const { inventory } = state.player;

  ui.inventoryList.innerHTML =
    inventory.length === 0
      ? '<p class="sheet__empty">Nothing but dust.</p>'
      : inventory
          .map(
            item => `
      <button class="item-row" data-item-id="${item.id}" type="button">
        <span class="item-row__name">${escapeHtml(item.name)}</span>
        <span class="item-row__desc">${escapeHtml(item.description)}</span>
      </button>`
          )
          .join('');
}

/**
 * The swap prompt. Worn and offered are shown side by side because the only
 * thing the player needs to decide is which number is bigger.
 */
export function showArmorOffer(
  ui: HudElements,
  state: GameState,
  onDecide: (equip: boolean) => void
): void {
  const offered = state.pendingArmorOffer!;
  const worn = state.player.armor;

  ui.armorModal.classList.remove('hidden');
  ui.armorModal.innerHTML = `
    <div class="modal__card glass-panel">
      <h2>Replace Armor?</h2>
      <div class="armor-compare">
        <div class="armor-compare__side">
          <span class="armor-compare__label">Worn</span>
          <span class="armor-compare__name">${escapeHtml(worn ? worn.name : 'Nothing')}</span>
          <span class="armor-compare__value">${worn?.defense ?? 0}</span>
        </div>
        <div class="armor-compare__side armor-compare__side--new">
          <span class="armor-compare__label">Found</span>
          <span class="armor-compare__name">${escapeHtml(offered.name)}</span>
          <span class="armor-compare__value">${offered.defense}</span>
        </div>
      </div>
      <p class="modal__stats">damage soaked per hit &middot; the old piece drops at your feet</p>
      <div class="armor-compare__actions">
        <button class="action-btn" id="btn-armor-decline" type="button">Keep Mine</button>
        <button class="action-btn action-btn--warning" id="btn-armor-equip" type="button">Wear It</button>
      </div>
    </div>
  `;
  ui.armorModal.querySelector('#btn-armor-equip')!.addEventListener('click', () => onDecide(true));
  ui.armorModal.querySelector('#btn-armor-decline')!.addEventListener('click', () => onDecide(false));
}

export function showEndModal(
  ui: HudElements,
  state: GameState,
  onRestart: () => void,
  onMainMenu: () => void
): void {
  const won = state.isVictory;
  const cause = state.lastDamageSource;
  const causeLine =
    !won && cause
      ? cause === 'the dungeon' || cause === 'the shift'
        ? `Consumed by ${cause}.`
        : `Killed by a ${cause}.`
      : '';
  ui.modal.classList.remove('hidden');
  ui.modal.innerHTML = `
    <div class="modal__card glass-panel">
      <h2 class="${won ? 'modal__title--win' : 'modal__title--lose'}">${won ? 'You Escaped' : 'You Fell'}</h2>
      ${causeLine ? `<p class="modal__cause">${escapeHtml(causeLine)}</p>` : ''}
      <p class="modal__stats">Floor ${state.floorMap.level} &middot; ${state.turnCount} turns</p>
      <p class="modal__seed">seed: ${escapeHtml(state.seed)}</p>
      <div class="modal__actions">
        <button class="action-btn" id="btn-main-menu" type="button">Main Menu</button>
        <button class="action-btn" id="btn-restart" type="button">New Run</button>
      </div>
    </div>
  `;
  ui.modal.querySelector<HTMLButtonElement>('#btn-restart')!.addEventListener('click', onRestart);
  ui.modal.querySelector<HTMLButtonElement>('#btn-main-menu')!.addEventListener('click', onMainMenu);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}
