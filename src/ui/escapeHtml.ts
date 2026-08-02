/**
 * Shared because the HUD is no longer the only place that builds markup out of
 * values the player controls — a rebound key prints into the How to Play panel,
 * and a key bound to `<` would otherwise close the tag it sits in.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}
