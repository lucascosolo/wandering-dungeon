import { RunConfig } from './runConfig';

export interface Position {
  x: number;
  y: number;
}

/**
 * Movement is cardinal everywhere in this game, so this is the distance in turns
 * and the only distance worth measuring. Both helpers live beside `Position`
 * rather than in a util module: this file is types only and imports nothing but
 * `RunConfig`, so every subsystem can reach them without risking a cycle.
 */
export function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Refused a health pool rather than given a large one: a pool is a number, and a
 * number is something a player eventually chips down. This one must not be.
 *
 * It lives here beside `Position` for the reason those do — this file is types
 * only — and it has to be reachable from more than one place, because HP is
 * taken in more than one: `damageEnemy` in `engine.ts` and `applyEntityFallout`
 * in `shiftSystem.ts`, which bills the geometry directly. Any third writer must
 * ask here too, or "cannot be killed" becomes "cannot be killed by the player".
 */
export function isUnkillable(enemy: Enemy): boolean {
  return enemy.enemyType === 'pursuer';
}

export type TileType = 'wall' | 'floor' | 'door' | 'stairs_down' | 'chasm';

export interface GridTile {
  x: number;
  y: number;
  type: TileType;
  shiftGroupId: string | null;
  isTelegraphedCollapse?: boolean;
  /** Part of a room that is about to slide. Drawn as a warning outline. */
  isTelegraphedShift?: boolean;
}

export type ShiftType = 'room_slide' | 'corridor_reconnect' | 'localized_collapse';

/** One tile mutation a shift will perform. */
export interface ShiftTileChange {
  x: number;
  y: number;
  to: TileType;
  shiftGroupId: string | null;
}

/** Where a room lands after it slides. */
export interface ShiftGroupMove {
  bounds: { x: number; y: number; width: number; height: number };
  currentOffset: Position;
}

/**
 * A shift that has been rolled *and fully simulated* but not yet executed.
 *
 * `changes` is the authoritative list of what the shift will do: the telegraph
 * draws exactly these tiles and execution replays exactly these tiles, so the
 * warning cannot disagree with the outcome. Re-deriving the outcome at execution
 * time is what used to make the telegraph lie.
 */
export interface PendingShift {
  type: ShiftType;
  targetGroupId: string | null;
  changes: ShiftTileChange[];
  groupMoves: Record<string, ShiftGroupMove>;
  /** True when this shift leaves the exit unreachable — allowed, but not twice running. */
  blocksExit: boolean;
}

export interface ShiftGroup {
  id: string;
  type: 'room' | 'corridor';
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  currentOffset: Position;
}

export interface PreShiftSnapshot {
  floorIndex: number;
  tiles: TileType[][];
  /**
   * Bounds as well as offsets: restoring only the offset used to leave a slid
   * room's tiles back at their old spot while its bounds still described the new
   * one, so the next shift targeted an empty rectangle.
   */
  shiftGroupPlacements: Record<string, ShiftGroupMove>;
}

export type ItemType =
  | 'stasis_flask'
  | 'hourglass_shard'
  | 'haste_sigil'
  | 'rewind_scroll'
  | 'health_potion'
  | 'coin_cache'
  | ArmorType
  | WeaponType;

export type WeaponType = 'short_blade' | 'war_axe' | 'longbow';

export type ArmorType = 'padded_vest' | 'scrap_plating' | 'warden_carapace';

export type ArmorModifierType =
  | 'bulwark'
  | 'thorns'
  | 'bracing'
  | 'ballast'
  | 'prospecting'
  | 'ponderous';

/**
 * The rolled half of a piece of armor: which trade it offers and how much of it.
 * Rolled per piece rather than per tier, so two Warden Carapaces are two
 * different decisions. See `armorModifiers.ts` for what each type does.
 */
export interface ArmorModifier {
  type: ArmorModifierType;
  magnitude: number;
}

export interface Item {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  category: 'stabilization' | 'destabilization' | 'consumable' | 'armor' | 'currency' | 'weapon';
  /** Flat damage soaked per hit. Armor only — see damagePlayer. */
  defense?: number;
  /** Bonus damage on melee attacks. Weapon only. */
  damageBonus?: number;
  /** Attack range in tiles. Weapon only — absent means melee (range 1). */
  range?: number;
  /**
   * Armor only, and optional: a run saved before modifiers existed carries pieces
   * without one, and an unmodified piece is a legal piece rather than a broken
   * one. Absent means "no modifier", which is what those saves were playing.
   */
  modifier?: ArmorModifier;
  /**
   * Coins in the cache. Currency only: it is spent into `player.coins` on pickup
   * and never enters the inventory, so it can never be "used" as a consumable.
   */
  value?: number;
}

export interface ShopOffer {
  id: string;
  item: Item;
  price: number;
  sold: boolean;
}

/**
 * The merchant that arrives when a region's boss falls. Rolled once and stored,
 * so closing and reopening cannot reroll the stock, and it rides the save with
 * the rest of the state.
 */
export interface ShopState {
  regionIndex: number;
  /** The boss floor it belongs to. Descending past it retires the merchant. */
  floor: number;
  merchant: string;
  /**
   * The tile the merchant stands on. He is a physical obstacle: moving into this
   * tile trades instead of stepping onto it, so the shop is somewhere the player
   * walks to rather than a menu they carry.
   */
  position: Position;
  stock: ShopOffer[];
}

export interface Entity {
  id: string;
  name: string;
  position: Position;
  hp: number;
  maxHp: number;
  attackPower: number;
}

export interface Player extends Entity {
  classType: 'vanguard';
  shieldHp: number;
  shieldTurnsRemaining: number;
  /** Worn armor. Kept out of `inventory` so it can never be "used" as a consumable. */
  armor: Item | null;
  /** Worn weapon. Null means fists (attackPower only). */
  weapon: Item | null;
  /**
   * Whether a ranged weapon fires on a direction press. A melee weapon ignores
   * this, but a bow does not: without a sheathe toggle, every step taken toward
   * an enemy while carrying one would loose an arrow instead of walking, which
   * is unplayable on a touch device that moves by tapping a direction.
   */
  weaponActive: boolean;
  inventory: Item[];
  /** Spending money for the post-boss merchant. Carries across floors. */
  coins: number;
  /** Raised by kills. Every stat point it buys is applied by `grantXp`. */
  level: number;
  /** XP banked toward the next level only — `grantXp` spends it down on each level-up. */
  xp: number;
}

/**
 * What a level-up this turn was worth. Gains are totals, so several levels landing
 * on one kill splash once rather than fighting each other for the same corner.
 */
export interface LevelUpNotice {
  level: number;
  maxHpGained: number;
  attackGained: number;
}

/**
 * A region guardian that fell during the turn just dispatched. Same one-turn
 * signal as `LevelUpNotice` and cleared on the same schedule.
 */
export interface BossDefeatNotice {
  floor: number;
  regionName: string;
  bossName: string;
}

/**
 * A reactive armor modifier that fired during the turn just dispatched, and the
 * tile it fired on, so the shell can spark something there. Same one-turn
 * discipline as `LevelUpNotice`: cleared at the top of every dispatch and
 * stripped on load, because a resumed run is not the turn it happened on.
 */
export interface ArmorReaction {
  kind: 'thorns' | 'bulwark';
  x: number;
  y: number;
}

export type EnemyType =
  | 'crawler'
  | 'sentinel'
  | 'fracture_beast'
  | 'warp_stalker'
  | 'collapse_behemoth'
  | 'hinge_warden'
  | 'seam_skitter'
  | 'fracture_leech'
  | 'riftbound'
  | 'ashlock'
  | 'stasis_scorcher'
  | 'facet_reaver'
  | 'glass_moth'
  | 'unmaking_hound'
  | 'null_scribe'
  | 'hinge_sovereign'
  | 'rift_regent'
  | 'cinder_gatekeeper'
  | 'prism_refractor'
  | 'null_testament'
  /**
   * Not a species and not in any region's pool. The Pursuer is spawned by the
   * engine when a floor has been lingered on, one per floor, and cannot be
   * killed — see `wakePursuer` in `engine.ts`.
   */
  | 'pursuer';

export interface Enemy extends Entity {
  enemyType: EnemyType;
  /** Arena guardian marker. Optional so older saved runs and test fixtures decode safely. */
  isBoss?: boolean;
  /** Cooldown for an arena guardian's ranged signature attack. */
  bossCooldown?: number;
  /** Tile marked by a delayed arena attack. */
  bossTarget?: Position;
  /** Turns this enemy will skip. Non-zero is what "staggered" means — there is
   * deliberately no separate boolean to fall out of sync with it. */
  staggeredTurns: number;
}

export interface LogMessage {
  id: string;
  text: string;
  type: 'info' | 'combat' | 'shift' | 'warning';
  timestamp: number;
}

export interface ItemDrop {
  item: Item;
  position: Position;
}

export interface Chest {
  id: string;
  position: Position;
  contents: Item;
  looted: boolean;
}

export interface FloorMap {
  level: number;
  width: number;
  height: number;
  tiles: GridTile[][];
  shiftGroups: Record<string, ShiftGroup>;
  entrance: Position;
  exit: Position;
  explored: boolean[][];
  visible: boolean[][];
  /** Item pickups lying on the floor. Populated when the floor is built. */
  drops?: ItemDrop[];
  /** Chests placed on this floor. Unopened chests are interactable containers. */
  chests?: Chest[];
}

export interface GameState {
  seed: string;
  /** Length and difficulty chosen at the title screen. Fixed for the run. */
  config: RunConfig;
  rngState: {
    seed: string;
    callCount: number;
  };
  turnCount: number;
  /**
   * Turns spent on the current floor, reset by `buildFloor`. Escalating pressure
   * reads this and never `turnCount`: the run-long counter never resets, so
   * wiring the ramp to it would bill floor-1 dawdling for the rest of the run.
   */
  floorTurns: number;
  shiftCountdown: number;
  nextShiftCountdownMax: number;
  isStasisActive: boolean;
  stasisTurnsRemaining: number;
  /** Turns until the Vanguard's Fallout Shield can be raised again. */
  abilityCooldown: number;
  player: Player;
  entities: Enemy[];
  floorMap: FloorMap;
  preShiftSnapshot: PreShiftSnapshot | null;
  /** The shift that has been rolled and telegraphed, awaiting execution. */
  pendingShift: PendingShift | null;
  /**
   * Armor the player is standing on while already wearing some. The piece stays
   * on the floor until EQUIP_ARMOR resolves the offer, so a declined swap needs
   * no put-back path — the piece is simply still there afterwards.
   */
  pendingArmorOffer: Item | null;
  /**
   * Pieces of armor the player has already said no to, by item id. Keyed on the
   * piece and not the tile: item ids are unique per drop, so a *different* piece
   * landing on the same tile is a fresh decision and still asks, while a declined
   * piece the dungeon shifts somewhere else stays declined — the answer was about
   * the armor, not about the floor under it. Reset by `buildFloor`, since drops do
   * not survive a descent.
   */
  declinedArmorIds: string[];
  /** Weapon the player is standing on while already carrying one. Same pattern as pendingArmorOffer. */
  pendingWeaponOffer: Item | null;
  /** Weapons the player has already declined. Same pattern as declinedArmorIds. */
  declinedWeaponIds: string[];
  /**
   * A level gained during the turn just dispatched, for the HUD to splash. Written
   * only by `grantXp` and cleared at the top of every dispatch, so it names one
   * turn's gain and never a stale one. Stripped on load rather than saved — a
   * resumed run must not replay a splash it has already seen.
   */
  lastLevelUp: LevelUpNotice | null;
  /**
   * The region guardian killed during the turn just dispatched, for the HUD to
   * splash. Same discipline as `lastLevelUp`: written only by `awardBossDefeats`,
   * cleared at the top of every dispatch, and stripped on load.
   */
  lastBossDefeat: BossDefeatNotice | null;
  /**
   * Reactive armor modifiers that fired during the turn just dispatched, for the
   * shell to spark on the map. Same discipline as the two notices above.
   */
  armorReactions: ArmorReaction[];
  /** Tiles whose type changed in the last shift — the renderer flashes these. */
  lastShiftChanges: Position[];
  /** The tile of the last enemy killed on this turn, for a kill flash. Cleared at dispatch top. */
  lastKillPosition: Position | null;
  /** The name of the last item picked up, for a floating label. Cleared at dispatch top. */
  lastPickupName: string | null;
  lastPickupPosition: Position | null;
  /** turnCount when lastShiftChanges was recorded, so the flash can fade out. */
  lastShiftTurn: number;
  /** Which kind of shift last landed, so effects and logs can tell them apart. */
  lastShiftType: ShiftType | null;
  /**
   * How many shifts in a row have left the exit unreachable. The dungeon is
   * allowed to seal the way out and reopen it later, but never twice running —
   * see MAX_EXIT_BLOCKED_STREAK in shiftSystem.
   */
  exitBlockedStreak: number;
  /** Who last hurt the player, so death can name a culprit. */
  lastDamageSource: string | null;
  /** Regions whose boss reward has already been claimed. */
  clearedRegions: number[];
  /** The merchant on this boss floor, or null when there is none to trade with. */
  shop: ShopState | null;
  /**
   * The player bumped the merchant during the turn just dispatched, so the shell
   * should raise his stock. Same one-turn discipline as `lastLevelUp`: cleared at
   * the top of every dispatch and stripped on load, so resuming a run saved on the
   * counter does not reopen a modal the player already closed.
   */
  shopOpened: boolean;
  eventLog: LogMessage[];
  isGameOver: boolean;
  isVictory: boolean;
}
