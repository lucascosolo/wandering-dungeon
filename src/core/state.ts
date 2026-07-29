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
  hazard?: 'fire' | 'poison_gas' | null;
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
  shiftGroupPositions: Record<string, Position>;
}

export type ItemType =
  | 'stasis_flask'
  | 'hourglass_shard'
  | 'haste_sigil'
  | 'rewind_scroll'
  | 'health_potion';

export interface Item {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  category: 'stabilization' | 'destabilization' | 'consumable';
}

export interface Entity {
  id: string;
  name: string;
  position: Position;
  hp: number;
  maxHp: number;
  attackPower: number;
  isStaggered?: boolean;
  staggeredTurns?: number;
}

export interface Player extends Entity {
  classType: 'vanguard';
  shieldHp: number;
  shieldTurnsRemaining: number;
  inventory: Item[];
}

export type EnemyType =
  | 'crawler'
  | 'sentinel'
  | 'fracture_beast'
  | 'warp_stalker'
  | 'collapse_behemoth';

export interface Enemy extends Entity {
  enemyType: EnemyType;
}

export interface LogMessage {
  id: string;
  text: string;
  type: 'info' | 'combat' | 'shift' | 'warning';
  timestamp: number;
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
}

export interface GameState {
  seed: string;
  rngState: {
    seed: string;
    callCount: number;
  };
  turnCount: number;
  shiftCountdown: number;
  nextShiftCountdownMax: number;
  isStasisActive: boolean;
  stasisTurnsRemaining: number;
  player: Player;
  entities: Enemy[];
  floorMap: FloorMap;
  preShiftSnapshot: PreShiftSnapshot | null;
  eventLog: LogMessage[];
  isGameOver: boolean;
  isVictory: boolean;
}
