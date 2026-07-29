# Task 3 Report: Procedural Floor Map Generation, Pathfinding & Fog of War

## Status
DONE

## Commit
`581587f8e3c608190a7d6ad8092edfb9adb223fd`

## Summary of Changes
1. **Procedural Map Generator (`src/core/map/generator.ts`)**:
   - Implemented `generateFloor(rng, level, width, height)` generating 32x32 grids initialized with wall tiles.
   - Carves non-overlapping rooms (at least 4 per floor, sizes 4x4 to 7x7) assigned unique room shift group IDs (`room_1`, `room_2`, etc.).
   - Connects rooms sequentially with L-shaped corridors assigned corridor shift group IDs (`corridor_1`, `corridor_2`, etc.).
   - Places door tiles (`type: 'door'`) at room-corridor perimeter junctions.
   - Places `entrance` stairs at the center of the first room (`type: 'floor'`) and `exit` stairs at the center of the furthest room (`type: 'stairs_down'`).
   - Initializes 2D boolean arrays `explored` and `visible` with `false`.

2. **A* Pathfinding (`src/core/map/pathfinding.ts`)**:
   - Implemented `findPath(map, start, end, ignoreEntities)` using A* search with Manhattan distance heuristic.
   - Walkable tile types: `floor`, `door`, `stairs_down`. Non-walkable: `wall`, `chasm`.
   - Implemented `hasValidPath(map, start, end)` returning `true` when `findPath` produces a valid non-null path.

3. **Fog of War & Field of View (`src/core/map/fow.ts`)**:
   - Implemented `computeFOV(map, origin, radius)` using Bresenham line casting up to specified `radius` (default 7).
   - Resets `visible[y][x]` to `false` and marks tiles in line of sight as `visible` and `explored`.
   - `wall` tiles block line of sight beyond themselves, but remain visible and explored.
   - Preserves previously explored tiles across multiple FOV computations.

4. **Unit Tests (`tests/map.test.ts`)**:
   - Added unit tests covering map generation, pathfinding solvability, door placement, FOV calculations, wall blocking, and explored state persistence.

## Verification Results
- `npx vitest run tests/map.test.ts`: Passed (7/7 tests passed).
- `npx tsc --noEmit`: Passed (0 errors).
