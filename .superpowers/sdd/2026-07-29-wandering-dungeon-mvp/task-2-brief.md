# Task 2 Brief: Seeded PRNG & Core State Data Types

## Files to Create/Modify
- Create: `src/core/rng.ts`
- Create: `src/core/state.ts`
- Create: `tests/rng.test.ts`

## Requirements
1. `src/core/rng.ts`: Implement `SeededRNG` class wrapping `seedrandom`.
   - Constructor: `constructor(seed: string, initialCallCount = 0)`
   - Methods:
     - `random(): number` (returns random number in [0, 1) and increments internal `callCount`)
     - `randomRange(min: number, max: number): number` (returns float in [min, max))
     - `randomInt(min: number, max: number): number` (returns integer in [min, max] inclusive)
     - `getSeed(): string`
     - `getCallCount(): number`
     - `serialize(): { seed: string; callCount: number }`
     - `static fromSerialized(data: { seed: string; callCount: number }): SeededRNG`
2. `src/core/state.ts`: Full TypeScript interface & type definitions:
   - `Position { x: number; y: number }`
   - `TileType = 'wall' | 'floor' | 'door' | 'stairs_down' | 'chasm'`
   - `GridTile`: `{ x: number; y: number; type: TileType; shiftGroupId: string | null; isTelegraphedCollapse?: boolean; hazard?: 'fire' | 'poison_gas' | null; }`
   - `ShiftGroup`: `{ id: string; type: 'room' | 'corridor'; bounds: { x: number; y: number; width: number; height: number }; currentOffset: Position; }`
   - `PreShiftSnapshot`: `{ floorIndex: number; tiles: TileType[][]; shiftGroupPositions: Record<string, Position>; }`
   - `ItemType = 'stasis_flask' | 'hourglass_shard' | 'haste_sigil' | 'rewind_scroll' | 'health_potion'`
   - `Item`: `{ id: string; type: ItemType; name: string; description: string; category: 'stabilization' | 'destabilization' | 'consumable'; }`
   - `Entity`: `{ id: string; name: string; position: Position; hp: number; maxHp: number; attackPower: number; isStaggered?: boolean; staggeredTurns?: number; }`
   - `Player`: Extends Entity: `{ classType: 'vanguard'; shieldHp: number; shieldTurnsRemaining: number; inventory: Item[]; }`
   - `Enemy`: Extends Entity: `{ enemyType: 'crawler' | 'sentinel' | 'fracture_beast' | 'warp_stalker' | 'collapse_behemoth'; }`
   - `LogMessage`: `{ id: string; text: string; type: 'info' | 'combat' | 'shift' | 'warning'; timestamp: number; }`
   - `FloorMap`: `{ level: number; width: number; height: number; tiles: GridTile[][]; shiftGroups: Record<string, ShiftGroup>; entrance: Position; exit: Position; explored: boolean[][]; visible: boolean[][]; }`
   - `GameState`: `{ seed: string; rngState: { seed: string; callCount: number }; turnCount: number; shiftCountdown: number; nextShiftCountdownMax: number; isStasisActive: boolean; stasisTurnsRemaining: number; player: Player; entities: Enemy[]; floorMap: FloorMap; preShiftSnapshot: PreShiftSnapshot | null; eventLog: LogMessage[]; isGameOver: boolean; isVictory: boolean; }`
3. Write `tests/rng.test.ts` verifying:
   - Identical random numbers for same seed.
   - Restoring a `SeededRNG` from `fromSerialized(rng.serialize())` produces exact same subsequent sequence of random numbers.
4. Run `npx vitest run tests/rng.test.ts` to ensure tests pass.
5. Commit changes: `git add src/core/ tests/rng.test.ts && git commit -m "feat: add seeded PRNG wrapper and core game state types"`

## Report Contract
Write task report to `.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-2-report.md`. Return status `DONE` with commit hash and test results summary.
