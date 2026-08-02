import { RunConfig } from './runConfig';

export interface Position {
  x: number;
  y: number;
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
  | ArmorType;

export type ArmorType = 'padded_vest' | 'scrap_plating' | 'warden_carapace';

export interface Item {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  category: 'stabilization' | 'destabilization' | 'consumable' | 'armor' | 'currency';
  /** Flat damage soaked per hit. Armor only — see damagePlayer. */
  defense?: number;
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
  | 'null_testament';

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
   * no put-back path and re-stepping on the tile simply asks again.
   */
  pendingArmorOffer: Item | null;
  /**
   * A level gained during the turn just dispatched, for the HUD to splash. Written
   * only by `grantXp` and cleared at the top of every dispatch, so it names one
   * turn's gain and never a stale one. Stripped on load rather than saved — a
   * resumed run must not replay a splash it has already seen.
   */
  lastLevelUp: LevelUpNotice | null;
  /** Tiles whose type changed in the last shift — the renderer flashes these. */
  lastShiftChanges: Position[];
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
  eventLog: LogMessage[];
  isGameOver: boolean;
  isVictory: boolean;
}
