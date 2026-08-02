import { Item, ItemType, ShopOffer, ShopState } from './state';
import { SeededRNG } from './rng';
import { createItem } from './game';
import { REGIONS } from './regions';

/**
 * Base prices in coins, before the region markup. Divided by four when floor
 * piles dropped to 1-3 coins, so a region's clear still buys the same number of
 * potions it did before. 6c prices these against real income from
 * `logs/<run-id>.json`.
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
 * shop free. The markup keeps a purchase costing roughly the same fraction of a
 * region's income wherever it is bought. Left at 0.35 through the coin rescale:
 * `coinsPerKill`'s slope was halved to match, rather than steepening this and
 * putting three-digit prices back on the counter.
 */
export function priceFor(type: ItemType, regionIndex: number): number {
  const base = BASE_PRICES[type] ?? 8;
  return Math.round(base * (1 + regionIndex * 0.35));
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

export function createShop(rng: SeededRNG, regionIndex: number, floor: number): ShopState {
  return {
    regionIndex,
    floor,
    merchant: MERCHANT_NAMES[regionIndex] ?? MERCHANT_NAMES[0],
    stock: rollShopStock(rng, regionIndex),
  };
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
