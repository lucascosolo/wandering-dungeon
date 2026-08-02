import { Item, ItemType, Position, ShopOffer, ShopState } from './state';
import { SeededRNG } from './rng';
import { createItem } from './game';
import { REGIONS } from './regions';

/**
 * Base prices in coins, before the region markup. Divided by four when floor
 * piles dropped to 1-3 coins, so a region's clear still buys the same number of
 * potions it did before.
 *
 * These are the region-0 counter, and playtest logs left them alone: a rushed
 * region 0 arrives with ~20 coins and a full clear with ~41, against a ~32-coin
 * stall. That is the intended shape — rushing buys two of the four, clearing
 * buys the stall — so the pricing pass moved the slope above, not these.
 */
const BASE_PRICES: Partial<Record<ItemType, number>> = {
  health_potion: 6,
  hourglass_shard: 8,
  haste_sigil: 7,
  stasis_flask: 9,
  rewind_scroll: 10,
  padded_vest: 15,
  scrap_plating: 20,
  warden_carapace: 30,
};

const STOCK_POOL: ItemType[] = [
  'health_potion',
  'hourglass_shard',
  'haste_sigil',
  'stasis_flask',
  'rewind_scroll',
];

const STOCK_SIZE = 4;

/**
 * Later regions pay more per kill, so the same price list would make the last
 * shop free. The markup exists to keep a purchase costing roughly the same
 * fraction of a region's income wherever it is bought.
 *
 * At 0.35 it did not. A region's income is `enemyCount * 4 floors * coinsPerKill`
 * plus the boss bounty and the pile trickle, and that runs 41 / 70 / 78 / 119 /
 * 131 coins for a full clear — 3.2x from the first region to the last — while a
 * 0.35 slope raised the counter only 2.4x. The stall's share of the purse
 * drifted from 1.28x income in region 0 to 1.86x in region 3, so the deepest
 * shops were the cheapest in real terms and stopped being a choice at all.
 *
 * 0.55 lands the region-4 multiplier on 3.2, matching the income growth, and
 * holds the ratio between 1.16x and 1.43x across all five. The residual wobble
 * is `coinsPerKill`'s step: it pays the same in regions 1 and 2, and again in 3
 * and 4, so income climbs every other region while a linear markup climbs every
 * one. No linear slope removes that, and matching it exactly would mean pricing
 * off the same step function from two places.
 *
 * Region 0 is deliberately untouched — `regionIndex * anything` is zero there,
 * and it is the only region with observed rather than modelled income (two
 * logged runs reached the first shop with 20 and 22 coins against a ~32-coin
 * stall, which is the intended "afford two of the four").
 */
const REGION_MARKUP = 0.55;

export function priceFor(type: ItemType, regionIndex: number): number {
  const base = BASE_PRICES[type] ?? 8;
  return Math.round(base * (1 + regionIndex * REGION_MARKUP));
}

/**
 * Roll a shop's stock. Called once, when the region's boss falls, and stored on
 * the state — re-rolling on open would let a player reroll by closing the modal
 * until the stock suited them.
 *
 * Always leads with a Health Potion: the shop is the run's difficulty valve, and
 * a valve that can roll shut is not a valve.
 */
export function rollShopStock(rng: SeededRNG, regionIndex: number): ShopOffer[] {
  const offers: ShopOffer[] = [
    offer('health_potion', regionIndex, `shop_${regionIndex}_0`),
  ];

  const remaining = STOCK_POOL.filter(type => type !== 'health_potion');
  for (let i = 1; i < STOCK_SIZE && remaining.length > 0; i++) {
    const [type] = remaining.splice(rng.randomInt(0, remaining.length - 1), 1);
    offers.push(offer(type, regionIndex, `shop_${regionIndex}_${i}`));
  }

  return offers;
}

function offer(type: ItemType, regionIndex: number, id: string): ShopOffer {
  return {
    id,
    item: createItem(type, `${id}_item`),
    price: priceFor(type, regionIndex),
    sold: false,
  };
}

export function createShop(
  rng: SeededRNG,
  regionIndex: number,
  floor: number,
  position: Position
): ShopState {
  return {
    regionIndex,
    floor,
    merchant: MERCHANT_NAMES[regionIndex] ?? MERCHANT_NAMES[0],
    position,
    stock: rollShopStock(rng, regionIndex),
  };
}

/** Nothing left to sell. The renderer draws this state, so it reads off the map. */
export function isSoldOut(shop: ShopState): boolean {
  return shop.stock.every(offer => offer.sold);
}

const MERCHANT_NAMES: string[] = REGIONS.map(
  region => `The Pedlar of ${region.name.replace(/^The /, '')}`
);

export interface PurchaseResult {
  ok: boolean;
  message: string;
  item?: Item;
}

/**
 * Resolve a purchase against the stored stock. Returns what happened rather than
 * mutating the player, so the engine keeps the only write path to `GameState`.
 */
export function resolvePurchase(shop: ShopState, offerId: string, coins: number): PurchaseResult {
  const found = shop.stock.find(entry => entry.id === offerId);
  if (!found) return { ok: false, message: 'The merchant has no such thing.' };
  if (found.sold) return { ok: false, message: `The ${found.item.name} is already yours.` };
  if (coins < found.price) {
    return { ok: false, message: `You cannot afford the ${found.item.name}.` };
  }
  return { ok: true, message: `You buy the ${found.item.name}.`, item: found.item };
}
