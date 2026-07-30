# Roadmap

Requested work not yet scheduled into a commit. Each entry is a candidate for
its own scoped change — take them one at a time, not as a batch.

## Armor as an equipment slot with a comparison prompt

**Reported 2026-07-30.** Armor gets its own UI rather than living in the
inventory. First piece picked up equips automatically; picking up a second
opens a comparison popup asking whether to swap.

Needs an `Item` kind that is equipment rather than consumable, a slot on
`Player`, a damage-reduction hook in `damagePlayer` (`src/core/damage.ts` — now
the single path player HP loss flows through, so this is one edit, not two),
and a modal. Pairs naturally with the deferred weapon types.

Also carries the difficulty entry below: the user expects armor to be most of
that fix, so tune after it lands rather than before, or the two changes will
fight each other.

## Impact effects for shifts and combat

**Reported 2026-07-30.** The world shifting and enemy altercations should feel
like events. Candidates: screen shake on a collapse, brief hit-stop on a kill,
heavier particle bursts, a flash on the struck glyph.

Note the render loop is now on-demand — effects that animate need to keep
marking the frame dirty while they run, the way particles do via
`ParticleSystem.active`.

## Picking up an item should feel like something happened

**Reported 2026-07-30.** Right now you walk over a `*` and keep going — no
pause, no acknowledgement, nothing to mark it. Wants the same treatment as the
impact effects above: some beat that says an item was gained.

Candidates: a burst on the pickup tile, the item's name rising off it, a brief
highlight on the hotbar slot it landed in.

## Show cooldowns

**Reported 2026-07-30.** The shield's cooldown is only legible as a disabled
button — `state.abilityCooldown` is already tracked and already gates
`ui.abilityBtn.disabled` in `updateHud`, so the number exists and just isn't
shown. Same for `stasisTurnsRemaining`, which the shift pill already surfaces.

## Difficulty is too high

**Reported 2026-07-30.** The user expects armor to carry most of this, so treat
it as a follow-up to the armor entry rather than a separate tuning pass — see
the note there. Ground any tuning in `logs/<run-id>.json` (damage by source)
rather than guessing; the knobs are `ENEMY_TABLE` in `src/core/game.ts` and the
combat constants in `src/core/engine.ts`.

## Deferred earlier

- Weapon item types (companion to armor above).
