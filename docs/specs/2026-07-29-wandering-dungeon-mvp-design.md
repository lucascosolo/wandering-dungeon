# Design Specification: The Wandering Dungeon (Phase 1 MVP)

**Date:** 2026-07-29  
**Status:** Approved  
**Target:** Responsive Progressive Web Application (PWA) / Desktop & Mobile Browser  

---

## 1. Overview & Core Fantasy
*The Wandering Dungeon* is a turn-based, grid-based roguelite where reality fractures under the player's feet. Rooms, corridors, hazards, and enemies shift positions as a global shift timer counts down.

The core gameplay loop centers on risk management: **How much can I safely loot and explore before the dungeon shifts again, and how can I manipulate time to survive?**

In Phase 1 (MVP), the player controls the **Vanguard** class, exploring procedurally generated shifting dungeon floors, battling enemies with cardinal melee attacks, and using time-manipulation tools (Stasis Flask, Hourglass Shard, Haste Sigil, Rewind Scroll) to manipulate dungeon collapse.

---

## 2. Core Architecture & Technical Stack

- **Language & Runtime:** TypeScript (ESNext), Vite build toolchain.
- **PWA Capabilities:** Web Application Manifest + Service Worker for full offline playability.
- **Persistence:** IndexedDB (`idb-keyval` / native IndexedDB) auto-saving after every turn-consuming action.
- **Determinism:** Seeded PRNG (`seedrandom`). `GameState` serializes both the initial seed and the PRNG's current internal state / invocation count so reloads preserve deterministic random sequences.
- **Display Pipeline:** HTML5 2D Canvas for grid & entity rendering + clean HTML/CSS overlay for thumb-accessible UI overlays.

---

## 3. Turn Resolution & Shift Mechanics

### Turn Classification
- **Turn-Consumable Actions** (decrements `shiftCountdown` by 1 and advances enemy AI):
  - `MOVE`: Step in one of 4 cardinal directions (N, S, E, W).
  - `ATTACK`: Melee strike on adjacent enemy (cardinal only).
  - `WAIT`: Pass turn.
  - `USE_ITEM` / `USE_ABILITY`: Consuming items or triggering Vanguard abilities.
- **Non-Turn Actions** (0 turn cost, clock does NOT advance):
  - Inspecting tiles/entities, opening inventory, reading combat log, opening settings/map view.

### Shifting Rules
- **Shift Countdown:** Floor starts with a shift countdown (e.g. 8 turns).
- **Telegraph Phase:**
  - **Turns 2 and 1 before shift:** Rooms about to slide display a ghost outline preview. Collapsing tiles glow red.
- **Shift Execution (Countdown reaches 0):**
  - **Room Slide:** ShiftGroup rooms slide by calculated grid offsets.
  - **Corridor Reconnection:** Corridors realign with room doorways.
  - **Localized Collapse:** Collapsing tiles turn into chasms.
- **Shift Safety & Solvability Requirement:**
  - Every shift calculation validates that after resolution (and any emergency repositioning), the player **ends on a valid safe tile** and **retains a valid path to the exit**.
  - If a shift would collapse under a player or entity, emergency repositioning moves them to the nearest valid safe tile and inflicts **8% max HP fallout damage** (Vanguard reduces this to 4% via class passive).

---

## 4. Time-Control Consumables & Vanguard Class

### Vanguard Class
- **Role:** Heavy combat specialist built to withstand shift fallout.
- **Attack:** Cardinal melee attack (100% weapon damage).
- **Passive (`Unshakable`):** Reduces shift fallout damage by 50% (down to 4% max HP) and prevents shift stagger/knockback.
- **Active Ability (`Fallout Shield`):** Gain a temporary shield absorbing up to 30 damage for 4 turns (+50% absorption bonus if cast within 2 turns of an impending shift).

### Time-Control Items (MVP Set)
1. **Stasis Flask** *(Stabilization)*: Pauses shift countdown for 6 turns.
2. **Hourglass Shard** *(Stabilization)*: Adds +3 turns to current countdown.
3. **Haste Sigil** *(Destabilization)*:
   - *Tactical Payoff:* Immediately forces the telegraphed shift to execute right now. Enemies standing on newly collapsing tiles take fallout damage and become **Staggered** for 1 turn (skipping their next turn).
   - *Instability Cost:* Permanently reduces the next shift countdown by **2 turns** for that floor.
4. **Rewind Scroll** *(Stabilization/Rescue)*: Restores **only map geometry, doors, and open pathways** from a single `preShiftSnapshot` captured immediately prior to the last shift. Does *not* undo HP, items used, enemy turns, or entity positions.

---

## 5. UI, Controls & Rendering

- **Mobile First (Portrait 9:16):**
  - Reachable thumb action bar at bottom: Wait, Quickslot Items (1-4), Fallout Shield, Inspect Toggle, Inventory.
  - Touch tap/swipe navigation and long-press inspection tooltips.
- **Desktop Adaptation:** WASD / Arrow Keys / Numpad movement, click-to-act, hover tooltips, and side panel event log.
- **Camera:** Centered on player, clamped at map boundaries to avoid showing empty space off-grid.
- **Graphics:** Procedural shape rendering and clean particle effects (colored grid tiles, glow overlays, damage numbers) focusing visual clarity on Fog-of-War and Shift Telegraphing.

---

## 6. Module Structure & Data Schemas

```
RealityBendingRoguelike/
├── docs/specs/2026-07-29-wandering-dungeon-mvp-design.md
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── public/
│   ├── manifest.json
│   └── sw.js
├── src/
│   ├── core/
│   │   ├── state.ts              # GameState & Types
│   │   ├── engine.ts             # Turn Loop & Action Dispatcher
│   │   ├── rng.ts                # Seeded PRNG wrapper (with serialized state)
│   │   ├── map/
│   │   │   ├── generator.ts      # Procedural room/corridor generation
│   │   │   ├── pathfinding.ts    # A* solvability check
│   │   │   └── fow.ts            # Field of view / shadowcasting
│   │   ├── shift/
│   │   │   ├── shiftSystem.ts    # Shift countdown & execution engine
│   │   │   └── snapshot.ts       # preShiftSnapshot geometry manager
│   │   ├── items/
│   │   │   └── itemEffects.ts    # Time-control item logic
│   │   └── save/
│   │       └── saveManager.ts    # IndexedDB auto-save & run history
│   ├── render/
│   │   ├── canvasRenderer.ts     # HTML5 Canvas map & entity renderer
│   │   └── particles.ts          # Procedural particle overlays
│   ├── ui/
│   │   ├── hud.ts                # Mobile action bar & shift pill
│   │   ├── inventory.ts          # Inventory popover
│   │   ├── log.ts                # Combat log
│   │   └── controls.ts           # Unified Touch & Keyboard controller
│   ├── styles/
│   │   └── main.css              # Dark mode styling & layout
│   └── main.ts                   # Application main entry point
└── tests/
    ├── engine.test.ts
    ├── shift.test.ts
    ├── rewind.test.ts
    └── save.test.ts
```

---

## 7. Verification & Success Criteria

The MVP is validated when:
1. A player can launch the PWA offline.
2. Turn clock decrements only on turn-consuming actions.
3. Shift telegraphs 2 turns in advance; shift executes cleanly and guarantees player has a safe tile and valid exit path.
4. Vanguard abilities and all 4 time-control items function as specified.
5. Rewind Scroll restores map geometry snapshot accurately without reverting entity/combat state.
6. Haste Sigil forces shift, staggers enemies on collapsing tiles, and reduces next shift countdown by 2.
7. Game saves after every turn and restores identically including RNG state.
