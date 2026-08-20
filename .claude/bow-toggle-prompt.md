Fix the bow blocking movement on mobile in this TypeScript PWA.

## Problem
When holding the Longbow (ranged weapon, range: 6), pressing a direction key or tapping an adjacent tile on mobile fires an arrow instead of walking. In src/core/engine.ts, playerMove() checks for ranged attack (line 378-384) BEFORE regular movement (line 413), so every tap in a direction shoots an arrow instead of moving the player.

## Fix
Add a toggle button to engage/disengage the bow. When disengaged (sheathed/put away), movement works normally without firing arrows.

### Files to change:

1. **src/core/state.ts** — Add weaponActive: boolean (default true) to the Player type definition

2. **src/core/engine.ts** — In playerMove, wrap the ranged attack check behind a condition on state.player.weaponActive. When weaponActive is false, skip the ranged attack and fall through to the normal movement code.

3. **src/ui/hud.ts** — Add a bow toggle button in the thumb-action-bar between the Wait and Shield buttons:
   `<button class="action-btn" id="btn-bow-toggle" type="button"><span id="bow-toggle-label">Aim</span><small>b</small></button>`
   Only show it (visible/hidden) when the player is holding a weapon with a .range property.

4. **src/main.ts** — Wire the button:
   - On click: toggle state.player.weaponActive
   - Update the button label between 'Aim' (weaponActive=true) and 'Sheath' (weaponActive=false)
   - Handle keyboard binding for 'b' key
   - Update button visibility on equip/unequip (check the weapon in the game loop or after dispatch)

5. **src/styles/main.css** — Add .action-btn--active style for the aim mode (cyan glow, same accent color used elsewhere)

### Verification
- npx tsc --noEmit must pass
- npx vitest run must pass
- npx vite build must pass
- Bow + Aim ON -> direction press fires bow (existing behaviour preserved)
- Bow + Sheath ON -> direction press walks normally (new behaviour)
- No bow -> no toggle button visible
- Button appears on bow equip, disappears on unequip

### Constraints
- Follow existing patterns in each file
- All state mutations go through dispatchAction
- No new npm dependencies