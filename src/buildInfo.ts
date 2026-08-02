/**
 * The build stamp the UI shows, so a tester's screenshot or pasted report names
 * the exact code that produced it. Both values are substituted by Vite's
 * `define` (see vite.config.ts) rather than imported from package.json, which
 * would drag the whole manifest into the bundle.
 */
declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

/**
 * `typeof` rather than a bare read: any consumer of these modules that is not
 * run through Vite — a plain `tsx`/`node` invocation of a helper script — would
 * otherwise die on a ReferenceError at import time instead of showing "unknown".
 * A missing stamp is a worse report, not a broken game.
 */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown';

/** One-line form for the title screen, the death modal, and the copied report. */
export const BUILD_LABEL = `v${APP_VERSION} · ${BUILD_ID}`;
