# The Wandering Dungeon — Do You WANNA Jam?! 2026

## Reality is fragmenting. The dungeon is literally unstable.

This is not a roguelite *about* instability — **the instability IS the gameplay.** In *The Wandering Dungeon*, the very geometry of the dungeon shifts around you on a visible countdown. Rooms slide, corridors reconnect, walls collapse, and the stairs you were walking toward may not exist when you arrive. The dungeon itself is the antagonist, and the jam theme isn't just inspiration — it's the mechanics.

You descend through five unstable regions, each a wound in the fabric of reality:

- **Shifting Halls** — Doors hinge and swing, sealing paths with telegraphed stress
- **Fracture Deeps** — Walls shear apart, potentially clipping the tile you stand on
- **Ashen Warrens** — Corridors vent choking ash before each rearrangement
- **Glass Expanse** — Shifts spray sharp shards from changed tiles
- **The Unmaking** — The final descent demands a toll before reality ends

Five bosses guard the exit of each region. The last one—the Null Testament—marks a refuge from the Unmaking itself.

---

### How the Unstable Dungeon Works

Every floor has a **shift countdown** displayed prominently on the HUD. When it reaches zero, the map reorganizes according to deterministic, readable rules:

- **Room slide** — entire chambers shift position
- **Corridor reconnection** — tunnels link to new rooms
- **Localized collapse** — sections vanish, creating hazards

Before a shift executes, you see a **preview** of the changes. You can act on this information: lure enemies into doomed rooms, pause the shift with a Stasis Flask, or accelerate it to strand foes.

The pressure escalates the longer you linger. An unkillable entity called **The Long Patience** begins hunting you once you spend too many turns on a floor. The only escape is the exit—and the exit itself may shift away.

---

### The Vanguard Class

You play as the Vanguard: a warrior who thrives in the chaos. Your toolkit includes:

- **Shield ability** — absorb shift fallout and enemy blows
- **Armor modifiers** — six types that alter how you interact with instability (reduced fallout damage, slower countdown decay, immunity to region hazards, etc.)
- **Consumables** — Stasis Flask, Hourglass Shard, Haste Sigil, Rewind Scroll, Temporal Ward
- **Coins and shop** — merchants appear on boss floors after defeating the guardian, selling gear seeded once per floor

Level-ups raise max HP and attack power. Combat is turn-based melee on a grid. You can pause shifts, delay them, or trigger them early for tactical advantage.

---

### What Makes This Unique

Most games *mention* instability as flavor. Here, **every mechanic exists because the dungeon shifts**:

- The countdown creates constant, readable tension
- The preview system lets you plan around change
- Shift types determine enemy placement and hazard zones
- Time-control items compete with healing and armor upgrades
- The Pursuer turns lingering into a life-or-death decision

The dungeon isn't static terrain with enemies. **The dungeon is a process**, and you must adapt to its ever-changing geometry.

---

### Controls

**Mobile (touch):**
- Tap adjacent tiles to move or attack
- Tap distant tiles to pathfind
- Swipe for cardinal movement
- Long-press to inspect tiles and items

**Desktop (keyboard):**
- WASD or arrow keys to move
- Click to move or attack
- Space/Enter to wait or confirm
- I for inventory, M for map

---

### Play as a Progressive Web App

- **No install required** — opens in any modern browser
- **Saves to your device** — IndexedDB preserves runs across sessions
- **Offline play** — after the first load, no internet needed
- **Restart-safe** — deterministic seeds mean any run is reproducible

When a new build ships, you’ll see a small “A new version of the dungeon is ready” panel. Tap **Reload** to update, or **Later** to finish your run.

---

### The Premise

Reality is failing. Places that should be separate overlap. The familiar laws of physics work only intermittently. Each dungeon is a wound in the structure of the universe, and you are one of four specialists sent into these unstable regions to recover stabilizing relics.

This is the Vanguard’s story: a warrior who learns that in a fragmenting world, stability is not something you find—it’s something you create, one turn at a time.

---

**Difficulty settings:** Gentle, Standard, Brutal

**Run lengths:** Short (5 floors), Medium (10), Long (20), Extreme (25)

**Platforms:** Web (PWA), works on iPhone, Android, and desktop browsers

---

*The Wandering Dungeon* is built with TypeScript, Vite, and an HTML5 canvas. No frameworks. Deterministic RNG. Seeded runs. Save in progress. One question per run: *How much can I safely take before the dungeon moves again?*
