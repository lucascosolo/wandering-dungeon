# Task 3 Brief: Procedural Floor Map Generation, Pathfinding & Fog of War

## Files to Create/Modify
- Create: `src/core/map/generator.ts`
- Create: `src/core/map/pathfinding.ts`
- Create: `src/core/map/fow.ts`
- Create: `tests/map.test.ts`

## Requirements
1. `src/core/map/generator.ts`:
   - Function: `generateFloor(rng: SeededRNG, level: number, width = 32, height = 32): FloorMap`
   - Create 32x32 grid initialized with `wall` tiles.
   - Generate non-overlapping rooms (at least 4 rooms per floor, room dimensions min 4x4, max 7x7).
   - Carve room floor tiles, set `shiftGroupId` to unique room ID (e.g., `room_1`, `room_2`).
   - Connect rooms with corridors (L-shaped or straight). Set corridor floor tile `shiftGroupId` to `corridor_main` or `corridor_N`.
   - Place doors at room-corridor junctions (`type: 'door'`).
   - Place `entrance` stairs at center of first room (`type: 'floor'` position saved in `entrance`).
   - Place `exit` stairs at center of furthest room (`type: 'stairs_down'`).
   - Initialize 2D boolean arrays `explored` and `visible` of size `height` x `width` with all `false`.
2. `src/core/map/pathfinding.ts`:
   - Function `findPath(map: FloorMap, start: Position, end: Position, ignoreEntities = false): Position[] | null` using A* search. Walkable tile types: `floor`, `door`, `stairs_down`. Non-walkable: `wall`, `chasm`.
   - Function `hasValidPath(map: FloorMap, start: Position, end: Position): boolean` returns true if `findPath` returns a non-null path.
3. `src/core/map/fow.ts`:
   - Function `computeFOV(map: FloorMap, origin: Position, radius = 7): void`
   - Resets all `visible[y][x] = false`.
   - Calculates field of view using Bresenham line casting or shadowcasting algorithm up to `radius` distance. `wall` tiles block line of sight, but the wall tile itself remains visible.
   - For every tile where `visible[y][x] === true`, sets `explored[y][x] = true`.
4. `tests/map.test.ts`:
   - Test `generateFloor` returns valid `FloorMap` with at least 4 rooms, `shiftGroups`, entrance, and exit.
   - Test `hasValidPath(map, map.entrance, map.exit)` returns `true`.
   - Test `computeFOV` marks origin and surrounding unblocked tiles as `visible` and `explored`.
5. Run `npx vitest run tests/map.test.ts` and `npx tsc --noEmit` to verify.
6. Commit changes: `git add src/core/map/ tests/map.test.ts && git commit -m "feat: add procedural map generator, A* pathfinder, and fog of war"`

## Report Contract
Write task report to `.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-3-report.md`. Return status `DONE` with commit hash and test results summary.
