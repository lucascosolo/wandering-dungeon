# The Wandering Dungeon — TypeScript Roguelite PWA

## Project
Turn-based ASCII roguelite at https://roguelike.lucascosolo.com.
Theme: instability — the dungeon shifts around you on a countdown.

## Key files
- src/core/state.ts — all types (Enemy, Item, Player, GameState, FloorMap)
- src/core/game.ts — floor generation, item tables, weapon/armor creation
- src/core/engine.ts — dispatchAction, the only state mutation path
- src/render/canvasRenderer.ts — canvas rendering
- src/ui/hud.ts — HUD and overlays
- src/ui/titleScreen.ts — title screen
- tests/ — vitest test suite, run with npx vitest run

## Rules
- Every change must pass: npx tsc --noEmit && npx vitest run && npx vite build
- Use SeededRNG, never Math.random()
- All state mutations go through dispatchAction
- No new npm dependencies
- Follow existing patterns
