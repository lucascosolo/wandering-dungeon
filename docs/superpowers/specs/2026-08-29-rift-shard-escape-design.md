# Rift Shard: an escape tool for Pursuer-blocked exits

## Problem

The Pursuer ("Long Patience") has infinite aggro range and always pathfinds
toward the player (`src/core/engine.ts:930-967`); when its path is severed it
phases one tile through rock per turn instead of stopping
(`phaseTowardPlayer`, `src/core/engine.ts:793-817`). It is unkillable
(`isUnkillable`, `src/core/state.ts:32-34`).

The shift/instability system (`src/core/shift/shiftSystem.ts`) guarantees the
player always lands on a safe tile after a shift, and guarantees the exit is
never sealed for more than one cycle in a row (`MAX_EXIT_BLOCKED_STREAK = 1`,
`carveRescuePath`, lines 339-353 and 461-531). It has no equivalent guarantee
about the Pursuer's position relative to the player and the exit.

The result: a shift can leave the only route to the stairs passing through or
beside the Pursuer's tile, or (rarer, bounded to one cycle) sever the exit
entirely while the Pursuer is closing in. Since the Pursuer can't be fought,
walled off, or outrun by geometry trickery, the player has no tool to answer
this — the only counterplay today is luck in how the next shift resolves.

## Goal

Give the player a limited, learnable tool to create separation from the
Pursuer and get back onto a path toward the exit, without weakening the
Pursuer's core identity (unkillable, relentless, ignores geometry). Guarantee
this tool is available in the genuine worst case (exit sealed and the
Pursuer adjacent) so survival there is a matter of the player's decision, not
loot luck.

## Non-goals

- Tile-to-tile floor alignment (fall-through holes, Pursuer's touch punting
  the player back a floor) — deliberately out of scope, deferred to a future
  spec once it's clear the generation rework is worth it.
- Weakening the Pursuer's aggro range, speed, or wall-phasing — the relentless
  identity is intentional and should stay.
- A generic per-class ability framework — out of scope; this ships as an item
  using the existing `USE_ITEM` path.

## Design

### Item: Rift Shard

A new consumable, added alongside `stasis_flask` / `haste_sigil` /
`rewind_scroll` / `health_potion` in `ITEM_TABLE`
(`src/core/game.ts:76-155`) and the `LOOT_POOL` (lines 172-179). Flavor: the
player exploits a fracture in the dungeon's own instability to skip ahead
along a path.

**Effect on use** (new `case` in the `USE_ITEM` switch in
`src/core/items/itemEffects.ts`):

1. Compute the current shortest walkable path from the player to the stairs,
   using the same pathfinding the Pursuer's AI already uses.
2. Teleport the player up to **5 tiles** along that path (fewer if the path
   is shorter). Because this is a teleport, not a step-by-step move, it is
   not blocked by an enemy occupying a tile along the path — it can jump the
   player past a Pursuer camped in a doorway or corridor.
3. **Fallback targeting:** if no path to the exit currently exists (e.g.
   mid-seal), instead teleport to the walkable, safe tile within 5 tiles
   that maximizes distance from the Pursuer, so the item never fizzles with
   no effect.
4. Consumes a turn, like `ABILITY` and other `USE_ITEM` actions already do
   (`consumesTurn`, `src/core/engine.ts:91`).
5. Stacks in inventory like existing consumables.

**Rarity:** normal loot-table drop, weighted rarer than `haste_sigil` — this
is a stronger effect than any existing item since it repositions the player
rather than only affecting world timing.

### Guaranteed fallback grant

To avoid the Pursuer-plus-sealed-exit combination ever being unwinnable by
bad luck, a free charge is silently added to the player's inventory the
moment **all three** of the following are true, checked once per turn
alongside the existing Pursuer-adjacency evaluation in `src/core/engine.ts`:

- The player currently holds 0 Rift Shard charges.
- No walkable path from the player to the exit currently exists.
- The Pursuer is adjacent (distance 1) to the player.

This only fires in the genuine last-resort case — exit sealed and the
Pursuer catching the player in the same moment — not as a general safety net
for every close call. Checking "0 charges currently held" as the gating
condition means it naturally fires only once per cornering; it will not
re-grant on subsequent turns while the player remains cornered but still
holds the granted charge.

**Feedback on grant:** an event-log message in the existing style (e.g. "The
dungeon offers you one way out.") plus a prominent HUD callout on the item —
a highlighted/pulsing prompt showing which control activates it — using the
same visual treatment as the recent bow-toggle-visibility fix, so the player
cannot miss it in the log and die anyway.

## Testing plan

New `tests/riftShard.test.ts`, modeled on the existing `pursuer.test.ts` /
`shift.test.ts` patterns:

- Jump follows the shortest path to the stairs and respects the 5-tile cap
  (and a shorter path than 5 tiles caps at the path length).
- Jump can land past a Pursuer occupying a tile on that path.
- Fallback targeting (jump away from the Pursuer) fires correctly when no
  exit path exists.
- Guaranteed grant fires only when all three conditions hold simultaneously;
  each condition individually false prevents the grant.
- Guaranteed grant does not re-fire on a subsequent turn once one charge has
  been granted and is still held.
- Using the item consumes a turn; charges stack in inventory like existing
  consumables.

## Open implementation details

Left for the implementation plan rather than fixed here: the exact
`ItemCategory` enum value for Rift Shard (may warrant a new category
alongside `stabilization`/`destabilization`, or reuse an existing one), the
precise loot weight number, and where exactly in the HUD the pulsing prompt
renders.
