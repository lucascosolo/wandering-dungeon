# The Wandering Dungeon

## Project summary

Build an original, turn-based, grid roguelite for the browser. It should evoke the compact, tactical rhythm of classic dungeon crawlers such as *Pixel Dungeon*, without copying its art, code, world, characters, item names, or exact systems.

The game is designed first as a responsive web app that can be added to an iPhone Home Screen, while remaining comfortable to play in a desktop browser.

## Core fantasy

The player descends into a fragmenting reality on the edge of universal collapse. Rooms, corridors, hazards, enemies, and treasure move when the dungeon **shifts**. The player must explore, fight, and choose when to delay the next shift or let it happen to create an advantage.

The central question of each run is: **How much can I safely take before the dungeon moves again?**

The wider purpose is to recover the means to stabilize the universe before reality completely comes apart.

## Story premise

Reality is failing. Places that should be separate overlap, familiar laws work only intermittently, and each descending dungeon is a wound in the structure of the universe. The player is one of four specialists sent into these unstable regions to recover stabilizing relics, understand the force driving the fractures, and stop the final collapse.

Each successful run advances a light narrative: new fragments of the world are restored, the cause of destabilization becomes clearer, and the party gains access to new preparation options. The story should support the roguelite loop rather than interrupt it with long dialogue scenes.

## Playable classes

The full game has four distinct classes. They should all use the same core shifting system but approach instability differently.

| Class | Role | Relationship to instability |
| --- | --- | --- |
| Vanguard | Warrior equivalent | Absorbs shift fallout, protects space, and turns collapse into close-range combat opportunities. |
| Arcanist | Wizard equivalent | Casts powerful reality-altering spells that can stabilize or deliberately intensify fractures. |
| Shade | Rogue equivalent | Exploits broken connections, hidden routes, isolated enemies, and the confusion after a shift. |
| Wayfinder | Archer equivalent | Controls distance, predicts shifts, and uses precision attacks to manipulate threats across unstable terrain. |

For the MVP, implement only the Vanguard. Add the other classes through later scoped updates after the shared systems are proven fun.

## The shifting system

- The dungeon is made of connected rooms and corridor sections on a tile grid.
- A prominent counter shows how many player turns remain until the next shift.
- When the counter reaches zero, sections slide, separate, reconnect, or collapse according to a readable, deterministic rule.
- Before committing to a move, the player can inspect a simple preview of the next shift.
- A shift can alter routes, isolate enemies, open a shortcut, spread hazards, or cut off treasure.
- The player is never killed by an unavoidable, untelegraphed map change. If a section collapses under the player, resolve it with a clear, survivable emergency rule in the first version, such as moving them to the nearest valid tile and dealing damage.

The floor should begin relatively stable, then shift more frequently as the player spends turns. This creates escalating pressure without real-time gameplay.

## Time-control items and magic

Do not use place-specific anchors. Instead, give the player consumables, equipment effects, and spells that change the **global shift timer**.

Examples:

| Ability | Effect | Purpose |
| --- | --- | --- |
| Stasis Flask | Pause all shifting for 6 turns | Finish a fight or reach a distant item |
| Hourglass Shard | Add 3 turns to the current countdown | Small, flexible safety tool |
| Haste Sigil | Immediately trigger the next shift | Reposition rooms or strand enemies deliberately |
| Rewind Scroll | Undo the most recent shift, once per floor | High-value rescue tool |
| Temporal Ward | For 8 turns, the player takes reduced damage from shift fallout | Lets the player exploit dangerous changes |
| Rhythm Charm | Every enemy defeated adds 1 turn to the shift counter | A build-around passive item |
| Fracture Spell | Reduces the next shift countdown but strengthens the caster | Risk/reward option |

Items should fall into two broad families:

- **Stabilization tools** make the world safer: pause, delay, forecast, mitigate, or repair shift damage.
- **Destabilization tools** create bigger advantages but worsen the global situation: accelerate the next shift, expand the affected area, intensify hazards, strengthen a fracture, or increase later collapse pressure.

Examples of risky destabilization items include a Fracture Bomb that forces an immediate, stronger shift; a Chaotic Lens that multiplies loot in a room before scrambling nearby rooms; and an Overclock Sigil that empowers spells while permanently shortening future shift countdowns on that floor.

These effects should be scarce and tactically meaningful. The system should not let players permanently neutralize the dungeon's pressure, and using destabilization should feel tempting rather than automatically foolish.

## Tactical interactions

- Lure enemies into rooms likely to be cut off or damaged by a shift.
- Save a timer-pausing item for a dangerous fight or a long route to the exit.
- Trigger a shift early to change the map in the player's favor.
- Let fire, poison gas, water, or other hazards move into newly connected spaces.
- Make time-control resources compete with other valuable consumables such as healing.
- Make certain enemies interact with the timer: some speed it up, some slow it down, and some predict the next shift.

## Game loop

1. Enter a procedurally generated floor.
2. Explore in turn-based movement, revealing enemies, equipment, consumables, and the exit.
3. Track the impending shift and decide whether to use a time-control resource.
4. Fight, loot, and adapt as the dungeon rearranges.
5. Reach the exit before the late-floor collapse becomes overwhelming.
6. Die, unlock modest persistent options, and begin another run.

## Initial vertical slice

Keep the first build small but complete:

- One playable class: the Vanguard, with a basic melee attack, one defensive response to shift fallout, and one starting time-control item.
- One dungeon theme.
- Four standard enemy types and one miniboss.
- Ten items: healing, weapons/armor, and at least four time-control items.
- One environmental hazard, such as spreading fire or poison gas.
- Procedural floor generation that always produces a valid route to an exit.
- A visible shift preview and countdown.
- Three kinds of shift: room slide, corridor reconnection, and localized collapse.
- One complete win condition after several floors.
- Death, restart, deterministic seeds, and local run history.

Avoid online accounts, multiplayer, elaborate crafting, generative dialogue, and multiple classes until this vertical slice is fun.

## Development approach

Build an MVP first, then work toward the full feature set through small, scoped updates. Every update should have a clear goal, preserve a playable build, and be tested before the next system is added.

Suggested order:

1. **MVP foundation:** turn engine, one class, one floor theme, basic combat, procedural generation, shifting, timer display, one pause item, saving, and a win/loss loop.
2. **Core depth:** more shift patterns, stabilization and destabilization items, hazards, minibosses, better touch controls, and balancing.
3. **Class expansion:** add Arcanist, Shade, and Wayfinder one at a time, with focused playtesting after each.
4. **Campaign layer:** add the universe-stabilization story, relic progression, additional dungeon themes, bosses, and modest persistent unlocks.
5. **Polish and full release:** accessibility, visual/audio identity, expanded content, daily seeds, performance work, and careful mobile-browser QA.

Do not begin a later phase until the current phase is working end-to-end and its intended gameplay is enjoyable.

## Controls and interface

### Mobile

- Design for portrait orientation first.
- Tap an adjacent tile to move or attack.
- Tap a visible distant tile to pathfind there.
- Swipe for one-tile cardinal movement.
- Long-press tiles, enemies, items, and UI icons to inspect them.
- Keep the essential action bar reachable by a thumb at the bottom of the screen.
- Use large touch targets and never require hover.
- Prevent accidental page scrolling, pull-to-refresh, and text selection during play.
- Respect iPhone safe areas for the notch and Home indicator.

### Desktop

- Support WASD, arrow keys, and numpad movement.
- Support mouse click-to-move and hover inspection.
- Support keyboard shortcuts for inventory, map, wait, inspect, and item slots.
- Use extra horizontal space for an event log, inventory, and character panel.

## Technical requirements

- TypeScript web application.
- Installable Progressive Web App with a manifest, icons, standalone display mode, and offline support.
- Entirely playable offline after the initial load.
- Store saves and run history in IndexedDB.
- Save after every meaningful player action so iPhone browser suspension does not erase progress.
- Keep the game engine separate from rendering and input handling.
- Use deterministic seeded random generation so a run can be reproduced and debugged.
- Make desktop and mobile use the same game rules while adapting the interface.
- Use original placeholder visuals that can later be replaced; do not use Pixel Dungeon assets.
- Add automated tests for turn resolution, shifting, path validity, timer-pausing effects, and save/load behavior.

## Design principles

- Shifts must be readable before they happen and understandable after they resolve.
- Every timer manipulation item should create a meaningful decision, not merely delay danger.
- The dungeon itself is an antagonist and a tool.
- Preserve the deliberate pace of a traditional turn-based roguelite; do not introduce real-time pressure.
- Favor short, highly replayable runs of roughly 20 to 30 minutes once the full game is built.

## Definition of success for the first playable build

A player can install the site on an iPhone, start a seeded run offline, move and fight comfortably by touch, understand when and how the next dungeon shift will occur, use a Stasis Flask or Hourglass Shard to alter the timer, reach an exit, and safely resume the run after closing and reopening the browser.
