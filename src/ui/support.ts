/**
 * PLACEHOLDER. The platform is not chosen yet (Ko-fi / Patreon / Buy Me a
 * Coffee), so this is the one line to change when it is. Nothing else in the
 * codebase knows the URL.
 *
 * There is no payment processing here and there is not meant to be: this is a
 * static site with no backend, and the link exists so alpha testers can react to
 * the shape and tone of the offer.
 */
export const SUPPORT_URL = 'https://www.patreon.com/trophonix';

export const SUPPORT_LABEL = 'Support the game';

/**
 * `noopener` matters even for a link we control — without it the opened tab gets
 * a handle on this one via `window.opener` and can navigate the game away
 * mid-run.
 */
export function openSupportPage(): void {
  window.open(SUPPORT_URL, '_blank', 'noopener,noreferrer');
}
