# SDD ledger — plan: /home/lucas/workspace/RealityBendingRoguelike/docs/plans/2026-07-29-wandering-dungeon-mvp.md

Task 1: complete (commits 084547a..60528f7, review clean)
Task 2: complete (commits 60528f7..2562c1f, review clean)
Task 3: complete (commits 2562c1f..581587f, review clean)
Task 4: complete (commit b3b81ba) — shift engine, safety validation, rewind snapshot.
        Landed outside the SDD loop; no brief/report/review package was produced.
Task 5: complete (commit 0124c9e) — turn engine, Vanguard combat, floor population, items.
Task 7: complete (commit 1370a43) — canvas renderer + particles.
Task 8: complete (commit f5f3ebb) — HUD, controls, main.ts wiring. Playable end to end.

Task 6 (IndexedDB persistence): DEFERRED. Not required to play; picked up after
the loop was verified playable.

Post-MVP fix (commit e82520c) — shift telegraph fidelity. Browser playtest of
08c6d48 showed its telegraph claim did not hold: 7/7 telegraphed collapses
resolved to "reality holds steady". Shifts are now rehearsed on a copy of the
geometry at plan time and replayed verbatim, so telegraph == outcome by
construction (0 mismatches over 205 shifts / 10 seeds).

Requirement change made here: a shift may leave the exit unreachable. The
dungeon oscillates instead, bounded by MAX_EXIT_BLOCKED_STREAK (never sealed
for more than one shift cycle, with a rescue carve as the hard fail-safe).
The old "every shift keeps a path to the exit" invariant is gone — that
requirement is what made collapses unschedulable in the first place.
