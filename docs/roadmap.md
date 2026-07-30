# Roadmap

Requested work not yet scheduled into a commit. Each entry is a candidate for
its own scoped change — take them one at a time, not as a batch.

## Health potions need a fixed, always-available slot

**Reported 2026-07-30.** Healing is too important to hunt for in a shifting
hotbar. Two options, decide before building:

- **A.** Reserve slot 1 for health potions whenever one is carried, and let
  other items fill 2-4 around it.
- **B.** Give potions a dedicated key and their own HUD element, separate from
  the hotbar entirely, showing the count carried.

B is probably better — it also frees all four hotbar slots for situational
items, and a count readout is more useful mid-fight than a slot label.
Touches `HOTBAR_SIZE` / `renderHotbar` in `src/ui/hud.ts` and the
`useHotbarSlot` binding in `src/ui/controls.ts`.

## Armor as an equipment slot with a comparison prompt

**Reported 2026-07-30.** Armor gets its own UI rather than living in the
inventory. First piece picked up equips automatically; picking up a second
opens a comparison popup asking whether to swap.

Needs an `Item` kind that is equipment rather than consumable, a slot on
`Player`, a damage-reduction hook in `damagePlayer` (`src/core/damage.ts` — now
the single path player HP loss flows through, so this is one edit, not two),
and a modal. Pairs naturally with the deferred weapon types.

## Impact effects for shifts and combat

**Reported 2026-07-30.** The world shifting and enemy altercations should feel
like events. Candidates: screen shake on a collapse, brief hit-stop on a kill,
heavier particle bursts, a flash on the struck glyph.

Note the render loop is now on-demand — effects that animate need to keep
marking the frame dirty while they run, the way particles do via
`ParticleSystem.active`.

## Deferred earlier

- Weapon item types (companion to armor above).
