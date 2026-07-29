# Task 2 Report: Seeded PRNG & Core State Data Types

- **Status**: DONE
- **Commit Hash**: `2562c1f415fe04f9abc276ec33f49c1726f3e695`
- **Completed At**: 2026-07-29

## Implemented Files
1. `src/core/rng.ts`:
   - Implemented `SeededRNG` class wrapping `seedrandom`.
   - Tracks `callCount` across invocations.
   - Restores PRNG state when initialized with `initialCallCount` or restored via `SeededRNG.fromSerialized()`.
   - Provides `random()`, `randomRange()`, `randomInt()`, `getSeed()`, `getCallCount()`, `serialize()`, and `static fromSerialized()`.

2. `src/core/state.ts`:
   - Defined complete TypeScript state interfaces and type definitions for the entire game model:
     - `Position`, `TileType`, `GridTile`, `ShiftGroup`, `PreShiftSnapshot`
     - `ItemType`, `Item`, `Entity`, `Player`, `EnemyType`, `Enemy`
     - `LogMessage`, `FloorMap`, `GameState`

3. `tests/rng.test.ts`:
   - Unit tests covering seed determinism, serialization state restoration, floating-point range bounds, and integer inclusive range bounds.

## Verification Results
- **Vitest**: `npx vitest run tests/rng.test.ts` passed 4/4 tests.
- **TypeScript**: `npx tsc --noEmit` passed with 0 errors.
