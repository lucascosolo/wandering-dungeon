# Plan — XP, its payoff, and escalating pressure

Delivers roadmap tasks **10a → 10b → 7**, in that order, as three scoped chunks.

## Why this order

The roadmap lists 7 (Escalating unraveling) before 10a (Experience and levels),
but 10a's own entry overrides that: *"This pulls against 7 — pressure rewards
leaving fast, XP rewards staying to fight. That tension is the design, but only
if both are tuned together... Build 10a first and tune 7 against it."*

Building 7 first would mean tuning floor pressure against a game where fighting
has no reward, then re-tuning it once XP lands. 10a leads.

Task 8 (Pursuer) depends on 7 and is deliberately out of scope here — it is the
visible face of pressure and should be built once 7's cadence is settled.

## Chunk 1 — 10a. Experience and levels

Kills grant XP; XP raises a player level that ramps `maxHp` and `attackPower`.
The point is incentive, not power: nothing currently rewards clearing a floor
over walking past it to the stairs.

Done when: kills grant XP, levels raise stats through **one** choke point, and
progress survives save/resume.

Files: `src/core/state.ts`, `src/core/engine.ts`, `src/core/game.ts`.
Verify: `npx tsc --noEmit`, `npm test`, `npm run build`.

## Chunk 2 — 10b. Level-up splash

A brief overlay naming the new level and what it gained. Level-ups are the
payoff that makes 10a legible — a silent stat bump teaches nothing.

Done when: the splash names each stat gained, does not consume a turn, and does
not interrupt a queued tap-to-travel walk mid-step.

Files: `src/ui/hud.ts`, `src/main.ts`, the stylesheet.
Verify: same three commands.

## Chunk 3 — 7. Escalating unraveling

Shift cadence and severity ramp the longer the player lingers on a floor.
Pressure is **per-floor** — `turnCount` never resets per floor, so a run-long
counter would tax floor 1 dawdling for the rest of the run.

Done when: a floor measurably tightens over time, resets on descent, and the
telegraph fidelity guard in `tests/shift.test.ts` stays green.

Files: `src/core/state.ts`, `src/core/engine.ts`, `src/core/shift/shiftSystem.ts`.
Verify: same three commands, with `tests/shift.test.ts` called out explicitly.

## Blocked, not scheduled here

- **6c Shop pricing pass** and **10c XP curve pass** both require pricing/curves
  grounded in real `logs/<run-id>.json` data. Coin telemetry landed in `6840876`;
  XP telemetry should land with chunk 1. Both then need an actual playtest, which
  no agent can produce.
