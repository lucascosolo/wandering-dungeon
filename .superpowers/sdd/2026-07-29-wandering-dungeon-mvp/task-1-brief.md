# Task 1 Brief: Project Scaffolding & Setup

## Files to Create/Modify
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `public/manifest.json`
- Create: `src/styles/main.css`

## Requirements
1. `package.json`: Configure project named `wandering-dungeon`, type `module`, with scripts `dev` ("vite"), `build` ("tsc && vite build"), `preview` ("vite preview"), and `test` ("vitest run"). Include `vite`, `vitest`, `typescript`, `seedrandom`, `@types/seedrandom`, and `idb-keyval`.
2. `vite.config.ts`: Configure Vite to serve from root and support Vitest environment.
3. `tsconfig.json`: Target ESNext, module ESNext, moduleResolution Bundler, strict true, jsx preserve, skipLibCheck true.
4. `index.html`: Title "The Wandering Dungeon", viewport `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">`, touch prevention styles, link to `manifest.json` and `src/styles/main.css`, root `#app` div, script tag for `src/main.ts`.
5. `public/manifest.json`: Web App Manifest with `name`: "The Wandering Dungeon", `short_name`: "WanderingDungeon", `display`: "standalone", `background_color`: "#0f0f15", `theme_color`: "#0f0f15", `orientation`: "portrait".
6. `src/styles/main.css`: CSS design system with CSS custom properties (`--bg-main`, `--accent-cyan`, `--accent-purple`, `--warning-red`), dark theme, glassmorphism overlays, flex/grid layouts, thumb action bar positioning at bottom, touch-action handling.
7. Run `npm install` and `npx vitest run` (or create a dummy test if needed) to verify scaffolding builds cleanly.
8. Commit changes: `git add . && git commit -m "scaffold: initialize Vite, TypeScript, Vitest, and PWA configuration"`

## Report Contract
Write task report to `.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-1-report.md`. Return status `DONE` with commit hash and test results summary.
