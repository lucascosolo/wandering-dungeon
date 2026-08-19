import { BossDefeatNotice, GameState, Item, LevelUpNotice } from '../core/state';
import { regionForFloor } from '../core/regions';
import { xpToNextLevel } from '../core/game';
import { isFloorStabilized } from '../core/shift/shiftSystem';
import { declinedArmorUnderfoot } from '../core/engine';
import { describeModifier, modifierLabel } from '../core/armorModifiers';
import { enemySections } from './glyphLegend';
import { DISMISS_HINT } from './modalGate';
import { BUILD_LABEL } from '../buildInfo';
import { openSupportPage, SUPPORT_LABEL } from './support';
import { escapeHtml } from './escapeHtml';
import { currentKeybinds } from './keybinds';

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
  levelSplash: HTMLElement;
  bossSplash: HTMLElement;
  pickupHint: HTMLButtonElement;
  turnLabel: HTMLElement;
  levelLabel: HTMLElement;
  xpLabel: HTMLElement;
  shiftPill: HTMLElement;
  hpFill: HTMLElement;
  hpLabel: HTMLElement;
  shieldFill: HTMLElement;
  potionBtn: HTMLButtonElement;
  potionCount: HTMLElement;
  armorChip: HTMLElement;
  armorName: HTMLElement;
  coinChip: HTMLElement;
  coinCount: HTMLElement;
  armorModal: HTMLElement;
  shopModal: HTMLElement;
  menuModal: HTMLElement;
  menuBtn: HTMLButtonElement;
  legendBtn: HTMLButtonElement;
  logPanel: HTMLElement;
  hotbar: HTMLElement;
  inventorySheet: HTMLElement;
  inventoryList: HTMLElement;
  modal: HTMLElement;
  abilityBtn: HTMLButtonElement;
  abilityLabel: HTMLElement;
  descendBtn: HTMLButtonElement;
}

/**
 * The at-a-glance enemy strip, in region order so it reads shallowest to
 * deepest. `title=` is kept for the desktop hover, but it is no longer the only
 * way to learn a letter — the whole strip is a button onto the glyph key, which
 * is the half a phone was missing entirely.
 */
function enemyLegend(): string {
  return enemySections()
    .flatMap(section => section.entries)
    .map(({ glyph, color, label }) => `<span style="color:${color}" title="${label}">${glyph}</span>`)
    .join('');
}

/**
 * Build the whole game shell once and hand back the nodes the loop updates.
 * `onUseItem` is bound once here, delegated from the hotbar and inventory
 * containers, so redrawing their contents never has to rebind anything.
 */
export function mountUI(
  root: HTMLElement,
  onUseItem: (itemId: string) => void,
  onPickUpArmor: () => void
): HudElements {
  root.innerHTML = `
    <header class="hud-header">
      <div class="hud-stat"><span class="hud-stat__label">Floor</span><span id="floor-label">1</span></div>
      <div class="shift-pill" id="shift-pill">SHIFT IN —</div>
      <div class="hud-stat"><span class="hud-stat__label">Turn</span><span id="turn-label">0</span></div>
      <div class="hud-stat" title="experience toward the next level">
        <span class="hud-stat__label">Lv</span><span id="level-label">1</span><span class="hud-stat__label" id="xp-label">0/100</span>
      </div>
      <button class="menu-btn" id="btn-menu" type="button" aria-label="Menu" title="Menu">&#9776;</button>
    </header>

    <button class="legend" id="btn-legend" type="button">
      @ you &middot; * item &middot; [ armor &middot; $ coins &middot; + door &middot; &gt; stairs &middot;
      <span style="color:#f2e8cf">&amp;</span> merchant &middot;
      <span class="legend__warn legend__warn--close">red</span> closing &middot;
      <span class="legend__warn legend__warn--open">violet</span> opening &middot;
      foes <span class="legend__foes">${enemyLegend()}</span>
      <span class="legend__hint">&mdash; tap for names</span>
    </button>

    <div class="vitals">
      <div class="bar bar--hp"><div class="bar__fill" id="hp-fill"></div><span class="bar__label" id="hp-label"></span></div>
      <div class="bar bar--shield"><div class="bar__fill" id="shield-fill"></div></div>
    </div>

    <div class="game-viewport">
      <div class="region-banner" id="region-banner" role="status" aria-live="polite" aria-atomic="true"></div>
      <div class="level-splash" id="level-splash" role="status" aria-live="polite" aria-atomic="true"></div>
      <div class="boss-splash" id="boss-splash" role="status" aria-live="polite" aria-atomic="true"></div>
      <button class="pickup-hint hidden" id="pickup-hint" type="button"></button>
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
      <button class="action-btn" id="btn-ability" type="button"><span id="ability-label">Shield</span><small>q</small></button>
      <button class="action-btn" id="btn-inventory" type="button">Items<small>i</small></button>
      <button class="action-btn action-btn--warning" id="btn-descend" type="button">Descend<small>&gt;</small></button>
    </div>

    <div class="sheet hidden" id="inventory-sheet">
      <div class="sheet__header"><h2>Inventory</h2><span class="modal__seed">${DISMISS_HINT}</span><button class="sheet__close" id="btn-close-inventory" type="button">✕</button></div>
      <div class="sheet__list" id="inventory-list"></div>
    </div>

    <div class="modal hidden" id="armor-modal"></div>
    <div class="modal hidden" id="shop-modal"></div>
    <div class="modal hidden" id="menu-modal"></div>
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

  // The hint is the phone's half of the Enter binding — this game is played as an
  // installed PWA, where a keyboard-only affordance is no affordance at all.
  byId('pickup-hint').addEventListener('click', onPickUpArmor);

  return {
    canvas: byId<HTMLCanvasElement>('game-canvas'),
    floorLabel: byId('floor-label'),
    regionBanner: byId('region-banner'),
    levelSplash: byId('level-splash'),
    bossSplash: byId('boss-splash'),
    pickupHint: byId<HTMLButtonElement>('pickup-hint'),
    turnLabel: byId('turn-label'),
    levelLabel: byId('level-label'),
    xpLabel: byId('xp-label'),
    shiftPill: byId('shift-pill'),
    hpFill: byId('hp-fill'),
    hpLabel: byId('hp-label'),
    shieldFill: byId('shield-fill'),
    potionBtn: byId<HTMLButtonElement>('potion-btn'),
    potionCount: byId('potion-count'),
    armorChip: byId('armor-chip'),
    armorName: byId('armor-name'),
    coinChip: byId('coin-chip'),
    coinCount: byId('coin-count'),
    armorModal: byId('armor-modal'),
    shopModal: byId('shop-modal'),
    menuModal: byId('menu-modal'),
    menuBtn: byId<HTMLButtonElement>('btn-menu'),
    legendBtn: byId<HTMLButtonElement>('btn-legend'),
    logPanel: byId('log-panel'),
    hotbar: byId('hotbar'),
    inventorySheet: byId('inventory-sheet'),
    inventoryList: byId('inventory-list'),
    modal: byId('modal'),
    abilityBtn: byId<HTMLButtonElement>('btn-ability'),
    abilityLabel: byId('ability-label'),
    descendBtn: byId<HTMLButtonElement>('btn-descend'),
  };
}

/**
 * What the pickup hint calls itself. The old copy said PRESS [ENTER] on a device
 * with no Enter key, which is most of them — this game is played as an installed
 * PWA. The element is a button in every case, so tapping is the one instruction
 * that is true everywhere; Enter is named only where it is genuinely a second
 * route: a pointer device that hovers, and only while Enter is still bound to
 * Descend, because `controls.ts` diverts the pickup off that exact key.
 */
function pickupHintLabel(onStairs: boolean): string {
  if (onStairs) return 'TAP TO PICK UP';
  const hasKeyboard =
    typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!hasKeyboard || !currentKeybinds().descend.includes('enter')) return 'TAP TO PICK UP';
  return 'TAP OR [ENTER] TO PICK UP';
}

export function updateHud(ui: HudElements, state: GameState): void {
  const { player, floorMap } = state;

  ui.floorLabel.textContent = `${floorMap.level}/${state.config.finalFloor}`;
  ui.turnLabel.textContent = String(state.turnCount);
  ui.levelLabel.textContent = String(player.level);
  ui.xpLabel.textContent = `${player.xp}/${xpToNextLevel(player.level)}`;

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

  if (isFloorStabilized(state)) {
    // The countdown is frozen on a cleared floor, so printing it would read as a
    // stuck HUD rather than as calm.
    ui.shiftPill.textContent = 'STABLE';
    ui.shiftPill.className = 'shift-pill shift-pill--stable';
  } else if (state.isStasisActive) {
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
  // A purse readout only — the stock is reached by walking into the merchant, not
  // from the HUD, so the chip lights up to say there is someone on this floor to
  // spend it on rather than opening the shop itself.
  ui.coinChip.classList.toggle('coin-chip--merchant', state.shop !== null);

  const potions = healthPotions(state).length;
  ui.potionCount.textContent = String(potions);
  // Stays visible at zero so the option is known before it is needed, and
  // disabled at full HP so a scarce potion cannot be poured away for nothing.
  ui.potionBtn.disabled = potions === 0 || player.hp >= player.maxHp;

  const { armor } = player;
  // The chip is the only always-visible readout of what the worn piece rolled, so
  // it names the modifier rather than only the number it soaks — a reactive
  // effect the player has forgotten about is an effect they cannot play around.
  ui.armorName.textContent = armor ? armorSummary(armor) : 'Unarmoured';
  ui.armorChip.title = armor?.modifier ? describeModifier(armor.modifier) : '';
  ui.armorChip.classList.toggle('armor-chip--empty', !armor);
  ui.armorChip.classList.toggle('armor-chip--modified', Boolean(armor?.modifier));

  const onStairs = floorMap.tiles[player.position.y][player.position.x].type === 'stairs_down';
  ui.descendBtn.disabled = !onStairs;

  // A hint, not a prompt: it appears while the player stands on armor they have
  // already refused and goes away the moment they step off, take it, or die —
  // all three of which are just this predicate going false on the next update.
  // On the stairs Enter still descends, so the hint drops the key it does not
  // own rather than printing a binding that would do something else.
  const pickup = declinedArmorUnderfoot(state);
  ui.pickupHint.classList.toggle('hidden', pickup === null);
  if (pickup) {
    ui.pickupHint.innerHTML = `
      <span class="pickup-hint__key">${pickupHintLabel(onStairs)}</span>
      <span class="pickup-hint__name">${escapeHtml(armorSummary(pickup))}</span>
    `;
  }
  // Both of these were already in the state and simply not shown, which left the
  // best decision in the game — bracing into an imminent shift — as something the
  // player had to count in their head. They are both turn counts and they mean
  // opposite things, so the number alone would read as one counter: the colour is
  // what separates "holding for N more" from "N away from ready".
  const holding = player.shieldTurnsRemaining;
  const cooling = state.abilityCooldown;
  ui.abilityLabel.textContent =
    holding > 0 ? `Shield ${holding}` : cooling > 0 ? `Shield ${cooling}` : 'Shield';
  ui.abilityBtn.title =
    holding > 0
      ? `Fallout Shield holds for ${turnsLabel(holding)}.`
      : cooling > 0
        ? `Ready in ${turnsLabel(cooling)}.`
        : 'Fallout Shield ready.';
  ui.abilityBtn.classList.toggle('action-btn--holding', holding > 0);
  ui.abilityBtn.classList.toggle('action-btn--cooling', holding === 0 && cooling > 0);
  ui.abilityBtn.disabled = cooling > 0 || holding > 0;
}

function turnsLabel(turns: number): string {
  return `${turns} turn${turns === 1 ? '' : 's'}`;
}

/**
 * One line naming a piece of armor: what it soaks and what it rolled. Every
 * surface that names armor in passing goes through this, so a piece cannot read
 * as a bare number on one screen and as a trade on another.
 */
export function armorSummary(armor: Item): string {
  const soak = `${armor.name} −${armor.defense ?? 0}`;
  return armor.modifier ? `${soak} · ${modifierLabel(armor.modifier)}` : soak;
}

/**
 * Restart a CSS enter-animation that is already on the element. The class has to
 * come off, the layout has to be read to flush it, and only then does putting it
 * back re-trigger — without the forced reflow the browser coalesces both class
 * changes into no change at all and the animation never plays a second time.
 *
 * `void` on the read is deliberate: it is there for the side effect, and without
 * it a minifier is free to drop the property access and silently break this.
 */
function replayAnimation(el: HTMLElement, enterClass: string, html: string | null): void {
  el.classList.remove(enterClass);
  if (html === null) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = html;
  void el.offsetWidth;
  el.classList.add(enterClass);
}

/**
 * The level-up splash. Notification, not prompt: it is `pointer-events: none` and
 * bound to no handler, so it cannot swallow the tap that continues a walk, and
 * nothing here dispatches an action — showing it costs no turn.
 *
 * `null` clears it, which is how a new run drops the previous one's splash
 * mid-animation. Retriggering the animation needs the class off, a reflow, then
 * on again — same dance as the region banner, for the same reason.
 */
export function showLevelUp(ui: HudElements, notice: LevelUpNotice | null): void {
  replayAnimation(
    ui.levelSplash,
    'level-splash--enter',
    notice &&
      `
    <span class="level-splash__title">Level ${notice.level}</span>
    <span class="level-splash__gains">+${notice.maxHpGained} max HP &middot; +${notice.attackGained} attack</span>
  `
  );
}

/**
 * The boss-defeat splash. Same contract as `showLevelUp` — notification only,
 * `pointer-events: none`, no dispatch, `null` clears it.
 *
 * A boss is worth 60-100 XP, so it very often levels the player on the same turn
 * and both splashes are up at once. They are kept apart by anchor rather than by
 * suppressing one: the banner owns the top of the viewport, the level splash its
 * upper third, and this one is pinned to the bottom, so no viewport height can
 * bring them into contact.
 */
export function showBossDefeat(ui: HudElements, notice: BossDefeatNotice | null): void {
  replayAnimation(
    ui.bossSplash,
    'boss-splash--enter',
    notice &&
      `
    <span class="boss-splash__title">Floor ${notice.floor} Stabilized</span>
    <span class="boss-splash__line">${escapeHtml(notice.bossName)} falls. ${escapeHtml(notice.regionName)} settles into alignment.</span>
    <span class="boss-splash__line boss-splash__line--muted">The decay resumes when you descend.</span>
  `
  );
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
        <span class="item-row__name">${escapeHtml(itemTitle(item))}</span>
        <span class="item-row__desc">${escapeHtml(itemDetail(item))}</span>
      </button>`
          )
          .join('');
}

/**
 * How an item names itself in a list, and what it says under that name. Armor is
 * the only thing with a rolled half, and every list that can hold it — the
 * inventory, the merchant's stock — reads it through these two so a modifier
 * cannot be visible on one surface and invisible on the next.
 */
function itemTitle(item: Item): string {
  return item.modifier ? `${item.name} · ${modifierLabel(item.modifier)}` : item.name;
}

function itemDetail(item: Item): string {
  return item.modifier ? `${item.description} ${describeModifier(item.modifier)}` : item.description;
}

/**
 * The swap prompt. Worn and offered are shown side by side, each with what it
 * rolled: with modifiers the decision is no longer which number is bigger, so a
 * card that showed only the number would hide the whole choice. What is given up
 * is spelled out under the worn side, because a modifier the player never reads
 * is a modifier that does not exist.
 */
export function showArmorOffer(
  ui: HudElements,
  state: GameState,
  onDecide: (equip: boolean) => void
): void {
  const offered = state.pendingArmorOffer!;
  const worn = state.player.armor;

  const trait = (armor: Item | null, verb: string): string => {
    if (!armor?.modifier) return `<span class="armor-compare__mod armor-compare__mod--none">no modifier</span>`;
    return `
      <span class="armor-compare__mod">${escapeHtml(verb)} ${escapeHtml(modifierLabel(armor.modifier))}</span>
      <span class="armor-compare__mod-desc">${escapeHtml(describeModifier(armor.modifier))}</span>`;
  };

  ui.armorModal.classList.remove('hidden');
  ui.armorModal.innerHTML = `
    <div class="modal__card glass-panel">
      <h2>Replace Armor?</h2>
      <div class="armor-compare">
        <div class="armor-compare__side">
          <span class="armor-compare__label">Worn</span>
          <span class="armor-compare__name">${escapeHtml(worn ? worn.name : 'Nothing')}</span>
          <span class="armor-compare__value">${worn?.defense ?? 0}</span>
          ${worn ? trait(worn, 'lose') : ''}
        </div>
        <div class="armor-compare__side armor-compare__side--new">
          <span class="armor-compare__label">Found</span>
          <span class="armor-compare__name">${escapeHtml(offered.name)}</span>
          <span class="armor-compare__value">${offered.defense}</span>
          ${trait(offered, 'gain')}
        </div>
      </div>
      <p class="modal__stats">damage soaked per hit &middot; the old piece drops at your feet</p>
      <div class="armor-compare__actions">
        <button class="action-btn" id="btn-armor-decline" type="button">Keep Mine</button>
        <button class="action-btn action-btn--warning" id="btn-armor-equip" type="button">Wear It</button>
      </div>
      <p class="modal__seed">${DISMISS_HINT} &middot; keeps what you wear</p>
    </div>
  `;
  ui.armorModal.querySelector('#btn-armor-equip')!.addEventListener('click', () => onDecide(true));
  ui.armorModal.querySelector('#btn-armor-decline')!.addEventListener('click', () => onDecide(false));
}

/**
 * The merchant's stock. Rebuilt from state after every purchase rather than
 * patched in place, so what is on screen is always the stored stock — the same
 * list a save/resume would bring back.
 */
export function showShop(
  ui: HudElements,
  state: GameState,
  onBuy: (offerId: string) => void,
  onClose: () => void
): void {
  const shop = state.shop!;
  const { coins } = state.player;

  const rows = shop.stock
    .map(offer => {
      const affordable = coins >= offer.price;
      const label = offer.sold ? 'Sold' : `$${offer.price}`;
      return `
      <button class="shop-row" type="button" data-offer-id="${offer.id}"
              ${offer.sold || !affordable ? 'disabled' : ''}>
        <span class="shop-row__name">${escapeHtml(itemTitle(offer.item))}</span>
        <span class="shop-row__desc">${escapeHtml(itemDetail(offer.item))}</span>
        <span class="shop-row__price${offer.sold ? ' shop-row__price--sold' : ''}">${label}</span>
      </button>`;
    })
    .join('');

  ui.shopModal.classList.remove('hidden');
  ui.shopModal.innerHTML = `
    <div class="modal__card glass-panel">
      <h2>${escapeHtml(shop.merchant)}</h2>
      <p class="modal__stats">Your purse: <span class="shop-purse">$${coins}</span></p>
      <div class="shop-list">${rows}</div>
      <p class="modal__seed">the merchant stays until you descend &middot; ${DISMISS_HINT}</p>
      <div class="modal__actions">
        <button class="action-btn" id="btn-shop-close" type="button">Leave</button>
      </div>
    </div>
  `;

  ui.shopModal.querySelector('.shop-list')!.addEventListener('click', e => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-offer-id]');
    if (row?.dataset.offerId) onBuy(row.dataset.offerId);
  });
  ui.shopModal.querySelector('#btn-shop-close')!.addEventListener('click', onClose);
}

/**
 * Copy `text`, and say so on the button. `navigator.clipboard` is undefined on
 * an insecure origin — which is exactly how a tester reaches a LAN address — and
 * can reject even where it exists, so the failure path is not decorative: it
 * drops the report into a selected textarea the player can copy by hand. A
 * button that silently does nothing is the one outcome worth ruling out.
 */
function copyReport(button: HTMLButtonElement, host: HTMLElement, text: string): void {
  const fallback = (): void => {
    button.textContent = 'Copy failed — select and copy';
    // A second tap on a still-broken clipboard must not stack a second box.
    const existing = host.querySelector<HTMLTextAreaElement>('.report-fallback');
    if (existing) {
      existing.select();
      return;
    }
    const area = document.createElement('textarea');
    area.className = 'report-fallback';
    area.readOnly = true;
    area.value = text;
    host.appendChild(area);
    area.focus();
    area.select();
  };

  if (!navigator.clipboard) {
    fallback();
    return;
  }

  navigator.clipboard.writeText(text).then(
    () => {
      button.textContent = 'Report copied';
    },
    fallback
  );
}

export interface RunMenuHandlers {
  onHowToPlay: () => void;
  onGlyphKey: () => void;
  onSettings: () => void;
  /** Clears the save and returns to the title. Called only after the confirm. */
  onAbandon: () => void;
  onClose: () => void;
}

/**
 * The in-run menu — the only pause this game has, and the only route back to the
 * title that does not require dying. It is an ordinary `.modal`, so
 * `blocksGameInput` freezes the board while it is up and Esc/X/backdrop close it
 * through the same path as every other prompt.
 *
 * Abandoning is rendered as a second screen inside the same card rather than a
 * separate prompt: a mistap on a phone must not be able to end a twenty-floor
 * run, and the title screen's own overwrite warning already reads this way.
 */
export function showRunMenu(ui: HudElements, state: GameState, handlers: RunMenuHandlers): void {
  ui.menuModal.classList.remove('hidden');

  const renderMenu = (): void => {
    ui.menuModal.innerHTML = `
      <div class="modal__card glass-panel">
        <h2>Paused</h2>
        <p class="modal__stats">
          Floor ${state.floorMap.level}/${state.config.finalFloor} &middot; turn ${state.turnCount}
        </p>
        <button class="action-btn" id="btn-menu-help" type="button">How to Play</button>
        <button class="action-btn" id="btn-menu-legend" type="button">Glyph Key</button>
        <button class="action-btn" id="btn-menu-settings" type="button">Settings</button>
        <button class="action-btn action-btn--warning" id="btn-menu-abandon" type="button">Abandon Run</button>
        <p class="modal__seed">${DISMISS_HINT}</p>
        <div class="modal__actions">
          <button class="action-btn" id="btn-menu-resume" type="button">Resume</button>
        </div>
      </div>
    `;
    const on = (id: string, fn: () => void): void =>
      ui.menuModal.querySelector(`#${id}`)!.addEventListener('click', fn);
    on('btn-menu-help', handlers.onHowToPlay);
    on('btn-menu-legend', handlers.onGlyphKey);
    on('btn-menu-settings', handlers.onSettings);
    on('btn-menu-abandon', renderAbandonConfirm);
    on('btn-menu-resume', handlers.onClose);
  };

  const renderAbandonConfirm = (): void => {
    ui.menuModal.innerHTML = `
      <div class="modal__card glass-panel">
        <h2>Abandon this run?</h2>
        <p class="modal__stats">
          Floor ${state.floorMap.level}/${state.config.finalFloor}, turn ${state.turnCount}.
          There is one save slot, and this erases it.
        </p>
        <div class="modal__actions">
          <button class="action-btn action-btn--warning" id="btn-abandon-yes" type="button">Erase it</button>
          <button class="action-btn" id="btn-abandon-no" type="button">Keep playing</button>
        </div>
      </div>
    `;
    ui.menuModal.querySelector('#btn-abandon-yes')!.addEventListener('click', handlers.onAbandon);
    ui.menuModal.querySelector('#btn-abandon-no')!.addEventListener('click', renderMenu);
  };

  renderMenu();
}

export function showEndModal(
  ui: HudElements,
  state: GameState,
  onRestart: () => void,
  onMainMenu: () => void,
  /** The pasteable run report, built lazily — most deaths never ask for it. */
  buildReport: () => string
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
      <p class="modal__seed">seed: ${escapeHtml(state.seed)} &middot; ${escapeHtml(BUILD_LABEL)}</p>
      <div class="modal__actions">
        <button class="action-btn" id="btn-main-menu" type="button">Main Menu</button>
        <button class="action-btn" id="btn-restart" type="button">New Run</button>
      </div>
      <button class="action-btn" id="btn-copy-report" type="button">Copy Report</button>
      <button class="action-btn action-btn--quiet" id="btn-support" type="button">
        ${SUPPORT_LABEL}
      </button>
    </div>
  `;
  ui.modal.querySelector<HTMLButtonElement>('#btn-restart')!.addEventListener('click', onRestart);
  ui.modal.querySelector<HTMLButtonElement>('#btn-main-menu')!.addEventListener('click', onMainMenu);
  ui.modal.querySelector<HTMLButtonElement>('#btn-support')!.addEventListener('click', openSupportPage);

  const copyBtn = ui.modal.querySelector<HTMLButtonElement>('#btn-copy-report')!;
  const card = ui.modal.querySelector<HTMLElement>('.modal__card')!;
  copyBtn.addEventListener('click', () => copyReport(copyBtn, card, buildReport()));
}

export function showWeaponOffer(
  ui: HudElements,
  state: GameState,
  onDecide: (equip: boolean) => void
): void {
  const offered = state.pendingWeaponOffer!;
  const worn = state.player.weapon;

  const weaponStat = (w: Item): string => {
    if (w.damageBonus) return `+${w.damageBonus} damage`;
    if (w.range) return `range ${w.range}`;
    return 'standard';
  };

  ui.armorModal.classList.remove('hidden');
  ui.armorModal.innerHTML = `
    <div class="modal__card glass-panel">
      <h2>Replace Weapon?</h2>
      <div class="armor-compare">
        <div class="armor-compare__side">
          <span class="armor-compare__label">Worn</span>
          <span class="armor-compare__name">${escapeHtml(worn ? worn.name : 'Fists')}</span>
          <span class="armor-compare__value">${worn ? weaponStat(worn) : 'standard'}</span>
        </div>
        <div class="armor-compare__side armor-compare__side--new">
          <span class="armor-compare__label">Found</span>
          <span class="armor-compare__name">${escapeHtml(offered.name)}</span>
          <span class="armor-compare__value">${weaponStat(offered)}</span>
          <span class="armor-compare__desc">${escapeHtml(offered.description)}</span>
        </div>
      </div>
      <div class="setup__actions">
        <button class="button" id="armor-equip-btn">Take Weapon</button>
        <button class="button button--secondary" id="armor-decline-btn">Keep Current</button>
      </div>
    </div>`;

  document.getElementById('armor-equip-btn')!.onclick = () => onDecide(true);
  document.getElementById('armor-decline-btn')!.onclick = () => onDecide(false);
}

