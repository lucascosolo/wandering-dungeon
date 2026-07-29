5387cad docs: add Task 1 completion report
60528f7 scaffold: initialize Vite, TypeScript, Vitest, and PWA configuration
diff --git a/.gitignore b/.gitignore
new file mode 100644
index 0000000..7ac8ea1
--- /dev/null
+++ b/.gitignore
@@ -0,0 +1,4 @@
+node_modules
+dist
+.DS_Store
+*.log
diff --git a/.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/progress.md b/.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/progress.md
new file mode 100644
index 0000000..29ea45e
--- /dev/null
+++ b/.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/progress.md
@@ -0,0 +1 @@
+# SDD ledger — plan: /home/lucas/workspace/RealityBendingRoguelike/docs/plans/2026-07-29-wandering-dungeon-mvp.md
diff --git a/.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-1-brief.md b/.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-1-brief.md
new file mode 100644
index 0000000..0be41b6
--- /dev/null
+++ b/.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-1-brief.md
@@ -0,0 +1,22 @@
+# Task 1 Brief: Project Scaffolding & Setup
+
+## Files to Create/Modify
+- Create: `package.json`
+- Create: `vite.config.ts`
+- Create: `tsconfig.json`
+- Create: `index.html`
+- Create: `public/manifest.json`
+- Create: `src/styles/main.css`
+
+## Requirements
+1. `package.json`: Configure project named `wandering-dungeon`, type `module`, with scripts `dev` ("vite"), `build` ("tsc && vite build"), `preview` ("vite preview"), and `test` ("vitest run"). Include `vite`, `vitest`, `typescript`, `seedrandom`, `@types/seedrandom`, and `idb-keyval`.
+2. `vite.config.ts`: Configure Vite to serve from root and support Vitest environment.
+3. `tsconfig.json`: Target ESNext, module ESNext, moduleResolution Bundler, strict true, jsx preserve, skipLibCheck true.
+4. `index.html`: Title "The Wandering Dungeon", viewport `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">`, touch prevention styles, link to `manifest.json` and `src/styles/main.css`, root `#app` div, script tag for `src/main.ts`.
+5. `public/manifest.json`: Web App Manifest with `name`: "The Wandering Dungeon", `short_name`: "WanderingDungeon", `display`: "standalone", `background_color`: "#0f0f15", `theme_color`: "#0f0f15", `orientation`: "portrait".
+6. `src/styles/main.css`: CSS design system with CSS custom properties (`--bg-main`, `--accent-cyan`, `--accent-purple`, `--warning-red`), dark theme, glassmorphism overlays, flex/grid layouts, thumb action bar positioning at bottom, touch-action handling.
+7. Run `npm install` and `npx vitest run` (or create a dummy test if needed) to verify scaffolding builds cleanly.
+8. Commit changes: `git add . && git commit -m "scaffold: initialize Vite, TypeScript, Vitest, and PWA configuration"`
+
+## Report Contract
+Write task report to `.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-1-report.md`. Return status `DONE` with commit hash and test results summary.
diff --git a/.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-1-report.md b/.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-1-report.md
new file mode 100644
index 0000000..df159de
--- /dev/null
+++ b/.superpowers/sdd/2026-07-29-wandering-dungeon-mvp/task-1-report.md
@@ -0,0 +1,36 @@
+# Task 1 Report: Project Scaffolding & Setup
+
+## Overview
+- **Status:** DONE
+- **Commit Hash:** `60528f774afc8b781aa61ecacc1cc69a5701567f`
+- **Short Commit Hash:** `60528f7`
+
+## Summary of Changes
+1. **Created `package.json`**:
+   - Project name: `wandering-dungeon`, type `module`.
+   - Configured scripts: `dev`, `build`, `preview`, `test`.
+   - Installed core & development dependencies: `seedrandom`, `@types/seedrandom`, `idb-keyval`, `typescript`, `vite`, `vitest`.
+2. **Created `vite.config.ts`**:
+   - Configured Vite build options and Vitest node test environment.
+3. **Created `tsconfig.json`**:
+   - Configured TypeScript compiler target (`ESNext`), module resolution (`bundler`), strict mode enabled (`true`), `jsx: preserve`, and `skipLibCheck: true`.
+4. **Created `index.html`**:
+   - Configured title "The Wandering Dungeon", viewport with touch-prevention and iOS safe area meta tags, link to `manifest.json`, link to `src/styles/main.css`, `#app` container, and `src/main.ts` module entry point.
+5. **Created `public/manifest.json`**:
+   - Web App Manifest configured for standalone display, dark theme colors (`#0f0f15`), and portrait orientation.
+6. **Created `src/styles/main.css`**:
+   - Core CSS design system with custom properties (`--bg-main`, `--accent-cyan`, `--accent-purple`, `--warning-red`).
+   - Dark theme styling with glassmorphism utility panels (`.glass-panel`).
+   - Touch action handling (`touch-action: none`) for mobile web application reset.
+   - Fixed thumb action bar layout at the bottom (`.thumb-action-bar`) taking iOS safe areas into account.
+7. **Created `src/main.ts` & `tests/scaffold.test.ts`**:
+   - Main entry point rendering initial placeholder HUD/title.
+   - Placeholder unit test verifying initial Vitest setup.
+
+## Verification & Test Results
+- **npm install:** Dependencies installed cleanly (`82 packages`).
+- **vitest run:** `1/1` test passed cleanly (duration ~2.2s).
+- **npm run build (`tsc && vite build`):** TypeScript compilation & Vite bundle build succeeded cleanly producing assets in `dist/`.
+
+## Conclusion
+Task 1 is completely satisfied and verified.
diff --git a/index.html b/index.html
new file mode 100644
index 0000000..a279413
--- /dev/null
+++ b/index.html
@@ -0,0 +1,32 @@
+<!DOCTYPE html>
+<html lang="en">
+  <head>
+    <meta charset="UTF-8" />
+    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
+    <meta name="theme-color" content="#0f0f15" />
+    <meta name="apple-mobile-web-app-capable" content="yes" />
+    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
+    <title>The Wandering Dungeon</title>
+    <link rel="manifest" href="/manifest.json" />
+    <link rel="stylesheet" href="/src/styles/main.css" />
+    <style>
+      /* Touch prevention & fullscreen reset */
+      html, body {
+        touch-action: none;
+        -webkit-touch-callout: none;
+        -webkit-user-select: none;
+        user-select: none;
+        margin: 0;
+        padding: 0;
+        width: 100%;
+        height: 100%;
+        overflow: hidden;
+        background-color: #0f0f15;
+      }
+    </style>
+  </head>
+  <body>
+    <div id="app"></div>
+    <script type="module" src="/src/main.ts"></script>
+  </body>
+</html>
diff --git a/package-lock.json b/package-lock.json
new file mode 100644
index 0000000..2f3963e
--- /dev/null
+++ b/package-lock.json
@@ -0,0 +1,1741 @@
+{
+  "name": "wandering-dungeon",
+  "version": "0.1.0",
+  "lockfileVersion": 3,
+  "requires": true,
+  "packages": {
+    "": {
+      "name": "wandering-dungeon",
+      "version": "0.1.0",
+      "dependencies": {
+        "idb-keyval": "^6.2.1",
+        "seedrandom": "^3.0.5"
+      },
+      "devDependencies": {
+        "@types/node": "^20.11.0",
+        "@types/seedrandom": "^3.0.8",
+        "typescript": "^5.3.3",
+        "vite": "^5.1.0",
+        "vitest": "^1.2.2"
+      }
+    },
+    "node_modules/@esbuild/aix-ppc64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.21.5.tgz",
+      "integrity": "sha512-1SDgH6ZSPTlggy1yI6+Dbkiz8xzpHJEVAlF/AM1tHPLsf5STom9rwtjE4hKAF20FfXXNTFqEYXyJNWh1GiZedQ==",
+      "cpu": [
+        "ppc64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "aix"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/android-arm": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.21.5.tgz",
+      "integrity": "sha512-vCPvzSjpPHEi1siZdlvAlsPxXl7WbOVUBBAowWug4rJHb68Ox8KualB+1ocNvT5fjv6wpkX6o/iEpbDrf68zcg==",
+      "cpu": [
+        "arm"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "android"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/android-arm64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.21.5.tgz",
+      "integrity": "sha512-c0uX9VAUBQ7dTDCjq+wdyGLowMdtR/GoC2U5IYk/7D1H1JYC0qseD7+11iMP2mRLN9RcCMRcjC4YMclCzGwS/A==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "android"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/android-x64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.21.5.tgz",
+      "integrity": "sha512-D7aPRUUNHRBwHxzxRvp856rjUHRFW1SdQATKXH2hqA0kAZb1hKmi02OpYRacl0TxIGz/ZmXWlbZgjwWYaCakTA==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "android"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/darwin-arm64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-0.21.5.tgz",
+      "integrity": "sha512-DwqXqZyuk5AiWWf3UfLiRDJ5EDd49zg6O9wclZ7kUMv2WRFr4HKjXp/5t8JZ11QbQfUS6/cRCKGwYhtNAY88kQ==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "darwin"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/darwin-x64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/darwin-x64/-/darwin-x64-0.21.5.tgz",
+      "integrity": "sha512-se/JjF8NlmKVG4kNIuyWMV/22ZaerB+qaSi5MdrXtd6R08kvs2qCN4C09miupktDitvh8jRFflwGFBQcxZRjbw==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "darwin"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/freebsd-arm64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-arm64/-/freebsd-arm64-0.21.5.tgz",
+      "integrity": "sha512-5JcRxxRDUJLX8JXp/wcBCy3pENnCgBR9bN6JsY4OmhfUtIHe3ZW0mawA7+RDAcMLrMIZaf03NlQiX9DGyB8h4g==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "freebsd"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/freebsd-x64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-x64/-/freebsd-x64-0.21.5.tgz",
+      "integrity": "sha512-J95kNBj1zkbMXtHVH29bBriQygMXqoVQOQYA+ISs0/2l3T9/kj42ow2mpqerRBxDJnmkUDCaQT/dfNXWX/ZZCQ==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "freebsd"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/linux-arm": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm/-/linux-arm-0.21.5.tgz",
+      "integrity": "sha512-bPb5AHZtbeNGjCKVZ9UGqGwo8EUu4cLq68E95A53KlxAPRmUyYv2D6F0uUI65XisGOL1hBP5mTronbgo+0bFcA==",
+      "cpu": [
+        "arm"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/linux-arm64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm64/-/linux-arm64-0.21.5.tgz",
+      "integrity": "sha512-ibKvmyYzKsBeX8d8I7MH/TMfWDXBF3db4qM6sy+7re0YXya+K1cem3on9XgdT2EQGMu4hQyZhan7TeQ8XkGp4Q==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/linux-ia32": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/linux-ia32/-/linux-ia32-0.21.5.tgz",
+      "integrity": "sha512-YvjXDqLRqPDl2dvRODYmmhz4rPeVKYvppfGYKSNGdyZkA01046pLWyRKKI3ax8fbJoK5QbxblURkwK/MWY18Tg==",
+      "cpu": [
+        "ia32"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/linux-loong64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/linux-loong64/-/linux-loong64-0.21.5.tgz",
+      "integrity": "sha512-uHf1BmMG8qEvzdrzAqg2SIG/02+4/DHB6a9Kbya0XDvwDEKCoC8ZRWI5JJvNdUjtciBGFQ5PuBlpEOXQj+JQSg==",
+      "cpu": [
+        "loong64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/linux-mips64el": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/linux-mips64el/-/linux-mips64el-0.21.5.tgz",
+      "integrity": "sha512-IajOmO+KJK23bj52dFSNCMsz1QP1DqM6cwLUv3W1QwyxkyIWecfafnI555fvSGqEKwjMXVLokcV5ygHW5b3Jbg==",
+      "cpu": [
+        "mips64el"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/linux-ppc64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/linux-ppc64/-/linux-ppc64-0.21.5.tgz",
+      "integrity": "sha512-1hHV/Z4OEfMwpLO8rp7CvlhBDnjsC3CttJXIhBi+5Aj5r+MBvy4egg7wCbe//hSsT+RvDAG7s81tAvpL2XAE4w==",
+      "cpu": [
+        "ppc64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/linux-riscv64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/linux-riscv64/-/linux-riscv64-0.21.5.tgz",
+      "integrity": "sha512-2HdXDMd9GMgTGrPWnJzP2ALSokE/0O5HhTUvWIbD3YdjME8JwvSCnNGBnTThKGEB91OZhzrJ4qIIxk/SBmyDDA==",
+      "cpu": [
+        "riscv64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/linux-s390x": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/linux-s390x/-/linux-s390x-0.21.5.tgz",
+      "integrity": "sha512-zus5sxzqBJD3eXxwvjN1yQkRepANgxE9lgOW2qLnmr8ikMTphkjgXu1HR01K4FJg8h1kEEDAqDcZQtbrRnB41A==",
+      "cpu": [
+        "s390x"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/linux-x64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.21.5.tgz",
+      "integrity": "sha512-1rYdTpyv03iycF1+BhzrzQJCdOuAOtaqHTWJZCWvijKD2N5Xu0TtVC8/+1faWqcP9iBCWOmjmhoH94dH82BxPQ==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/netbsd-x64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-x64/-/netbsd-x64-0.21.5.tgz",
+      "integrity": "sha512-Woi2MXzXjMULccIwMnLciyZH4nCIMpWQAs049KEeMvOcNADVxo0UBIQPfSmxB3CWKedngg7sWZdLvLczpe0tLg==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "netbsd"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/openbsd-x64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-x64/-/openbsd-x64-0.21.5.tgz",
+      "integrity": "sha512-HLNNw99xsvx12lFBUwoT8EVCsSvRNDVxNpjZ7bPn947b8gJPzeHWyNVhFsaerc0n3TsbOINvRP2byTZ5LKezow==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "openbsd"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/sunos-x64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/sunos-x64/-/sunos-x64-0.21.5.tgz",
+      "integrity": "sha512-6+gjmFpfy0BHU5Tpptkuh8+uw3mnrvgs+dSPQXQOv3ekbordwnzTVEb4qnIvQcYXq6gzkyTnoZ9dZG+D4garKg==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "sunos"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/win32-arm64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/win32-arm64/-/win32-arm64-0.21.5.tgz",
+      "integrity": "sha512-Z0gOTd75VvXqyq7nsl93zwahcTROgqvuAcYDUr+vOv8uHhNSKROyU961kgtCD1e95IqPKSQKH7tBTslnS3tA8A==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "win32"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/win32-ia32": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/win32-ia32/-/win32-ia32-0.21.5.tgz",
+      "integrity": "sha512-SWXFF1CL2RVNMaVs+BBClwtfZSvDgtL//G/smwAc5oVK/UPu2Gu9tIaRgFmYFFKrmg3SyAjSrElf0TiJ1v8fYA==",
+      "cpu": [
+        "ia32"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "win32"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@esbuild/win32-x64": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.21.5.tgz",
+      "integrity": "sha512-tQd/1efJuzPC6rCFwEvLtci/xNFcTZknmXs98FYDfGE4wP9ClFV98nyKrzJKVPMhdDnjzLhdUyMX4PsQAPjwIw==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "win32"
+      ],
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@jest/schemas": {
+      "version": "29.6.3",
+      "resolved": "https://registry.npmjs.org/@jest/schemas/-/schemas-29.6.3.tgz",
+      "integrity": "sha512-mo5j5X+jIZmJQveBKeS/clAueipV7KgiX1vMgCxam1RNYiqE1w62n0/tJJnHtjW8ZHcQco5gY85jA3mi0L+nSA==",
+      "dev": true,
+      "dependencies": {
+        "@sinclair/typebox": "^0.27.8"
+      },
+      "engines": {
+        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
+      }
+    },
+    "node_modules/@jridgewell/sourcemap-codec": {
+      "version": "1.5.5",
+      "resolved": "https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.5.5.tgz",
+      "integrity": "sha512-cYQ9310grqxueWbl+WuIUIaiUaDcj7WOq5fVhEljNVgRfOUhY9fy2zTvfoqWsnebh8Sl70VScFbICvJnLKB0Og==",
+      "dev": true
+    },
+    "node_modules/@rollup/rollup-android-arm-eabi": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-android-arm-eabi/-/rollup-android-arm-eabi-4.62.3.tgz",
+      "integrity": "sha512-c0wdcekXtQvvn5Tsrk/+op/gUArrbWaFduBnTLP2l1cKLSQs4diMWjJw3m6A0DdzT8dAAX95KpkJ3qynCePbmw==",
+      "cpu": [
+        "arm"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "android"
+      ]
+    },
+    "node_modules/@rollup/rollup-android-arm64": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-android-arm64/-/rollup-android-arm64-4.62.3.tgz",
+      "integrity": "sha512-3YjElDdWN+qXAFbJ/CzPV+0wspLqh54k/I6GfdYtEJRqg7buSgc1yPM3B+93j1M4neobtkATHZTmxK2AMVGfnA==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "android"
+      ]
+    },
+    "node_modules/@rollup/rollup-darwin-arm64": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-darwin-arm64/-/rollup-darwin-arm64-4.62.3.tgz",
+      "integrity": "sha512-Pch2pFNOxxz1hTjypIdPyRTR6riiwRl84+VcN9djS680fw+Co1nAJINrdpqp7KV0NvyuU8ilZXZCjd7ykJl1GQ==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "darwin"
+      ]
+    },
+    "node_modules/@rollup/rollup-darwin-x64": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-darwin-x64/-/rollup-darwin-x64-4.62.3.tgz",
+      "integrity": "sha512-LEuncFUHFiF8t4yZVZvvZA1wk0pjAscRnsrn1EfTEmN4HXotBi2YtcnLRyaK6UbuczW7xZS5ES+81Rdz8Z0T6g==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "darwin"
+      ]
+    },
+    "node_modules/@rollup/rollup-freebsd-arm64": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-freebsd-arm64/-/rollup-freebsd-arm64-4.62.3.tgz",
+      "integrity": "sha512-zvBUvsQUpOWALdDsk6qbS8bXf2VxmPisuudNDrY7x0p0jBdsoZl8HsHczIOgkQiZldmcacMKtBzpoGVNeIe2bQ==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "freebsd"
+      ]
+    },
+    "node_modules/@rollup/rollup-freebsd-x64": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-freebsd-x64/-/rollup-freebsd-x64-4.62.3.tgz",
+      "integrity": "sha512-C2KmNrcSem/AMg984H/dev+si0lieQGdXdR/lYGJnuumXnFb9Y7QdiI62obFdLlxRYLBv4P0eUVIDbD4c1vVvw==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "freebsd"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-arm-gnueabihf": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm-gnueabihf/-/rollup-linux-arm-gnueabihf-4.62.3.tgz",
+      "integrity": "sha512-ggXnsTAEzNQx74XpunRsiZ9aBZDsI7XIa0hm2nzR9f4WzH5/f/d73ZSDaC5ejJ8YLY4NW+V3wr0tjOaeCq8hqA==",
+      "cpu": [
+        "arm"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-arm-musleabihf": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm-musleabihf/-/rollup-linux-arm-musleabihf-4.62.3.tgz",
+      "integrity": "sha512-2vng+FlzNUhKZxtej3IUqJgbZoQk2M/dwQM20+ULV0R/E/8tr9/P6uEf2iiGIk4HL0zMKh5Jry7mUHdUOvyGgA==",
+      "cpu": [
+        "arm"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-arm64-gnu": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm64-gnu/-/rollup-linux-arm64-gnu-4.62.3.tgz",
+      "integrity": "sha512-LLLFZKt4/Nraf9rxDkhiU8QVgLF4WmCkfr0L4fj0fPfIZFBib0DeiFk1hhaYKd03LFAFJcxHslhDFlNJLylf5Q==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-arm64-musl": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm64-musl/-/rollup-linux-arm64-musl-4.62.3.tgz",
+      "integrity": "sha512-WJkdQCvS9sWNOUBJZfQRKpZGFBztRzcowI+nndmflKgU4XY+3a420FgTOSKTsVqJbnzSxeT4vaJalpOaPo2YCQ==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-loong64-gnu": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-loong64-gnu/-/rollup-linux-loong64-gnu-4.62.3.tgz",
+      "integrity": "sha512-PwHXCCS2n64/1Ot6rP1YEYA02MGYBcQlr8CSZZyrUG2O7NH6NklYmvr9v3Jy+5e/eDeNchc/ukmKJi9LuflMIQ==",
+      "cpu": [
+        "loong64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-loong64-musl": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-loong64-musl/-/rollup-linux-loong64-musl-4.62.3.tgz",
+      "integrity": "sha512-vUjxINQu3RC8NZS3ykk1gN65gIz8pAopOq2HXuZhiIxHdx7TFvDG+jgrdSgInu1Eza4/Rfi2VzZgyIgEH4WOaw==",
+      "cpu": [
+        "loong64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-ppc64-gnu": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-ppc64-gnu/-/rollup-linux-ppc64-gnu-4.62.3.tgz",
+      "integrity": "sha512-wzko4aJ13+0G3kGnviCg5gnXFKd40izKsrf2uOw12US4XqprkDrmwOpeW14aSNa37V8bfPcz5Fkob6LZ3BAPmA==",
+      "cpu": [
+        "ppc64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-ppc64-musl": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-ppc64-musl/-/rollup-linux-ppc64-musl-4.62.3.tgz",
+      "integrity": "sha512-8120ue0JUMSwy11stlwnfdX3pPd+WZYGCDBwEHWtIHi6pOpZmsEF5QKB7a/UN+XFdqvobxz98kv8RTqikyCEBw==",
+      "cpu": [
+        "ppc64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-riscv64-gnu": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-riscv64-gnu/-/rollup-linux-riscv64-gnu-4.62.3.tgz",
+      "integrity": "sha512-XLFHnR3tXMjbOCh2vtVJHmxt+995uJsTERQyseFDRA0xxMxyTZPLa3OIUlyFaO4mF/Lu0FjmWHCuPXJT1n/IOg==",
+      "cpu": [
+        "riscv64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-riscv64-musl": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-riscv64-musl/-/rollup-linux-riscv64-musl-4.62.3.tgz",
+      "integrity": "sha512-se6yXvNGMIl0f+RQzyh7XAmia8/9kplQx424wnG2w0C1oi6XgO6Y8otKhdXFHbHs88Ihavzmvh1NWjuovE76BQ==",
+      "cpu": [
+        "riscv64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-s390x-gnu": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-s390x-gnu/-/rollup-linux-s390x-gnu-4.62.3.tgz",
+      "integrity": "sha512-gNoxRefktVIiGflpONuxWWXZAzIQG++z9qHO3xKwk4WdDMuQja3JHGfE1u0i3PfPDyvhypdk+WrgIJqLhGG7sg==",
+      "cpu": [
+        "s390x"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-x64-gnu": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-gnu/-/rollup-linux-x64-gnu-4.62.3.tgz",
+      "integrity": "sha512-V4KtWtQfAFMU7+9/A/VDps/VI8CHd3cYz0L8sgJzz8qK7eY7wI4ruFD82UYIYvW9Z4DtlTfhQcsl4XyPHW5uSg==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-x64-musl": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-musl/-/rollup-linux-x64-musl-4.62.3.tgz",
+      "integrity": "sha512-LBx9LYXvj2CBkMkjLdNAWLwH0MLMin7do2VcVo9kVPibGLkY0BQQut2fv7NVqkXqZ/CrAu9LqDHVV1xHCMpCPw==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-openbsd-x64": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-openbsd-x64/-/rollup-openbsd-x64-4.62.3.tgz",
+      "integrity": "sha512-ABVf3Q0RCu7NcyCCOZQI0pJ3GuSdfSl8EXcy88QtdceIMIoCUdfhsJChZ64L9zVM2aJHjde1Bhn5uqSRcX9ySA==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "openbsd"
+      ]
+    },
+    "node_modules/@rollup/rollup-openharmony-arm64": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-openharmony-arm64/-/rollup-openharmony-arm64-4.62.3.tgz",
+      "integrity": "sha512-+2Cy/ldweGBLlPIKsQLF8U5N44a0KDdbrk1rAjHOM9M2K+kGdIVjHLmmrZIcx+9Ny3ke/1JomCsDI1ocb11+sg==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "openharmony"
+      ]
+    },
+    "node_modules/@rollup/rollup-win32-arm64-msvc": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-arm64-msvc/-/rollup-win32-arm64-msvc-4.62.3.tgz",
+      "integrity": "sha512-dtZvzc8BedpSaFNy75x6uiWwAGTH+aZHDtdrqP6qk+WcLJrfti6sGje1ZJ9UxyzDLF23d/mV+PaMwuC0hL7UVA==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "win32"
+      ]
+    },
+    "node_modules/@rollup/rollup-win32-ia32-msvc": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-ia32-msvc/-/rollup-win32-ia32-msvc-4.62.3.tgz",
+      "integrity": "sha512-Rj8Ra4noo+aYy7sKBggCx0407mws34kAb1ySyWuq5DAtFBQdkSwnsjCgPrhPe9cvgBKZIukpE+CVHvORCS93kQ==",
+      "cpu": [
+        "ia32"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "win32"
+      ]
+    },
+    "node_modules/@rollup/rollup-win32-x64-gnu": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-gnu/-/rollup-win32-x64-gnu-4.62.3.tgz",
+      "integrity": "sha512-vp7N084ew/odXn2gi/mzm9mUkQu9l6AiN6dt4IeUM2Uvm9o+cVmP+YkqbMOteLbiGgqBBlJZjIMYVCfOOIVbVQ==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "win32"
+      ]
+    },
+    "node_modules/@rollup/rollup-win32-x64-msvc": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-msvc/-/rollup-win32-x64-msvc-4.62.3.tgz",
+      "integrity": "sha512-MOG/3gTOn4Fwf574RVOaY61I5o6P90legkFADiTyn1hyjNydT+cerU2rLUwPdZkKKyJ+iT+K9p7WXK4LM1Ka6g==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "optional": true,
+      "os": [
+        "win32"
+      ]
+    },
+    "node_modules/@sinclair/typebox": {
+      "version": "0.27.12",
+      "resolved": "https://registry.npmjs.org/@sinclair/typebox/-/typebox-0.27.12.tgz",
+      "integrity": "sha512-hhyNJ+nbR6ZR7pToHvllEFun9TL0sbL+tk/ON75lo+Xas054uez98qRbsuNt7MBCyZKK4+8Yli/OAGZhmfBZ/g==",
+      "dev": true
+    },
+    "node_modules/@types/estree": {
+      "version": "1.0.9",
+      "resolved": "https://registry.npmjs.org/@types/estree/-/estree-1.0.9.tgz",
+      "integrity": "sha512-GhdPgy1el4/ImP05X05Uw4cw2/M93BCUmnEvWZNStlCzEKME4Fkk+YpoA5OiHNQmoS7Cafb8Xa3Pya8m1Qrzeg==",
+      "dev": true
+    },
+    "node_modules/@types/node": {
+      "version": "20.19.43",
+      "resolved": "https://registry.npmjs.org/@types/node/-/node-20.19.43.tgz",
+      "integrity": "sha512-6oYBAi5ikg4Pl+kGsoYtawUMBT2zZMCvPNF7pVLnHZfd1zf38DRiWn/gT01RYCdUqkv7Fhr+C9ot4/tb+2sVvA==",
+      "dev": true,
+      "dependencies": {
+        "undici-types": "~6.21.0"
+      }
+    },
+    "node_modules/@types/seedrandom": {
+      "version": "3.0.8",
+      "resolved": "https://registry.npmjs.org/@types/seedrandom/-/seedrandom-3.0.8.tgz",
+      "integrity": "sha512-TY1eezMU2zH2ozQoAFAQFOPpvP15g+ZgSfTZt31AUUH/Rxtnz3H+A/Sv1Snw2/amp//omibc+AEkTaA8KUeOLQ==",
+      "dev": true
+    },
+    "node_modules/@vitest/expect": {
+      "version": "1.6.1",
+      "resolved": "https://registry.npmjs.org/@vitest/expect/-/expect-1.6.1.tgz",
+      "integrity": "sha512-jXL+9+ZNIJKruofqXuuTClf44eSpcHlgj3CiuNihUF3Ioujtmc0zIa3UJOW5RjDK1YLBJZnWBlPuqhYycLioog==",
+      "dev": true,
+      "dependencies": {
+        "@vitest/spy": "1.6.1",
+        "@vitest/utils": "1.6.1",
+        "chai": "^4.3.10"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/runner": {
+      "version": "1.6.1",
+      "resolved": "https://registry.npmjs.org/@vitest/runner/-/runner-1.6.1.tgz",
+      "integrity": "sha512-3nSnYXkVkf3mXFfE7vVyPmi3Sazhb/2cfZGGs0JRzFsPFvAMBEcrweV1V1GsrstdXeKCTXlJbvnQwGWgEIHmOA==",
+      "dev": true,
+      "dependencies": {
+        "@vitest/utils": "1.6.1",
+        "p-limit": "^5.0.0",
+        "pathe": "^1.1.1"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/snapshot": {
+      "version": "1.6.1",
+      "resolved": "https://registry.npmjs.org/@vitest/snapshot/-/snapshot-1.6.1.tgz",
+      "integrity": "sha512-WvidQuWAzU2p95u8GAKlRMqMyN1yOJkGHnx3M1PL9Raf7AQ1kwLKg04ADlCa3+OXUZE7BceOhVZiuWAbzCKcUQ==",
+      "dev": true,
+      "dependencies": {
+        "magic-string": "^0.30.5",
+        "pathe": "^1.1.1",
+        "pretty-format": "^29.7.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/spy": {
+      "version": "1.6.1",
+      "resolved": "https://registry.npmjs.org/@vitest/spy/-/spy-1.6.1.tgz",
+      "integrity": "sha512-MGcMmpGkZebsMZhbQKkAf9CX5zGvjkBTqf8Zx3ApYWXr3wG+QvEu2eXWfnIIWYSJExIp4V9FCKDEeygzkYrXMw==",
+      "dev": true,
+      "dependencies": {
+        "tinyspy": "^2.2.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/utils": {
+      "version": "1.6.1",
+      "resolved": "https://registry.npmjs.org/@vitest/utils/-/utils-1.6.1.tgz",
+      "integrity": "sha512-jOrrUvXM4Av9ZWiG1EajNto0u96kWAhJ1LmPmJhXXQx/32MecEKd10pOLYgS2BQx1TgkGhloPU1ArDW2vvaY6g==",
+      "dev": true,
+      "dependencies": {
+        "diff-sequences": "^29.6.3",
+        "estree-walker": "^3.0.3",
+        "loupe": "^2.3.7",
+        "pretty-format": "^29.7.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/acorn": {
+      "version": "8.18.0",
+      "resolved": "https://registry.npmjs.org/acorn/-/acorn-8.18.0.tgz",
+      "integrity": "sha512-lGq+9yr1/GuAWaVYIHRjvvySG5/4VfKIvC8EWxStPdcDh/Ka7FG3twP6v4d5BkravUilhIAsG4Qj83t02LWUPQ==",
+      "dev": true,
+      "bin": {
+        "acorn": "bin/acorn"
+      },
+      "engines": {
+        "node": ">=0.4.0"
+      }
+    },
+    "node_modules/acorn-walk": {
+      "version": "8.3.5",
+      "resolved": "https://registry.npmjs.org/acorn-walk/-/acorn-walk-8.3.5.tgz",
+      "integrity": "sha512-HEHNfbars9v4pgpW6SO1KSPkfoS0xVOM/9UzkJltjlsHZmJasxg8aXkuZa7SMf8vKGIBhpUsPluQSqhJFCqebw==",
+      "dev": true,
+      "dependencies": {
+        "acorn": "^8.11.0"
+      },
+      "engines": {
+        "node": ">=0.4.0"
+      }
+    },
+    "node_modules/ansi-styles": {
+      "version": "5.2.0",
+      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-5.2.0.tgz",
+      "integrity": "sha512-Cxwpt2SfTzTtXcfOlzGEee8O+c+MmUgGrNiBcXnuWxuFJHe6a5Hz7qwhwe5OgaSYI0IJvkLqWX1ASG+cJOkEiA==",
+      "dev": true,
+      "engines": {
+        "node": ">=10"
+      },
+      "funding": {
+        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
+      }
+    },
+    "node_modules/assertion-error": {
+      "version": "1.1.0",
+      "resolved": "https://registry.npmjs.org/assertion-error/-/assertion-error-1.1.0.tgz",
+      "integrity": "sha512-jgsaNduz+ndvGyFt3uSuWqvy4lCnIJiovtouQN5JZHOKCS2QuhEdbcQHFhVksz2N2U9hXJo8odG7ETyWlEeuDw==",
+      "dev": true,
+      "engines": {
+        "node": "*"
+      }
+    },
+    "node_modules/cac": {
+      "version": "6.7.14",
+      "resolved": "https://registry.npmjs.org/cac/-/cac-6.7.14.tgz",
+      "integrity": "sha512-b6Ilus+c3RrdDk+JhLKUAQfzzgLEPy6wcXqS7f/xe1EETvsDP6GORG7SFuOs6cID5YkqchW/LXZbX5bc8j7ZcQ==",
+      "dev": true,
+      "engines": {
+        "node": ">=8"
+      }
+    },
+    "node_modules/chai": {
+      "version": "4.5.0",
+      "resolved": "https://registry.npmjs.org/chai/-/chai-4.5.0.tgz",
+      "integrity": "sha512-RITGBfijLkBddZvnn8jdqoTypxvqbOLYQkGGxXzeFjVHvudaPw0HNFD9x928/eUwYWd2dPCugVqspGALTZZQKw==",
+      "dev": true,
+      "dependencies": {
+        "assertion-error": "^1.1.0",
+        "check-error": "^1.0.3",
+        "deep-eql": "^4.1.3",
+        "get-func-name": "^2.0.2",
+        "loupe": "^2.3.6",
+        "pathval": "^1.1.1",
+        "type-detect": "^4.1.0"
+      },
+      "engines": {
+        "node": ">=4"
+      }
+    },
+    "node_modules/check-error": {
+      "version": "1.0.3",
+      "resolved": "https://registry.npmjs.org/check-error/-/check-error-1.0.3.tgz",
+      "integrity": "sha512-iKEoDYaRmd1mxM90a2OEfWhjsjPpYPuQ+lMYsoxB126+t8fw7ySEO48nmDg5COTjxDI65/Y2OWpeEHk3ZOe8zg==",
+      "dev": true,
+      "dependencies": {
+        "get-func-name": "^2.0.2"
+      },
+      "engines": {
+        "node": "*"
+      }
+    },
+    "node_modules/confbox": {
+      "version": "0.1.8",
+      "resolved": "https://registry.npmjs.org/confbox/-/confbox-0.1.8.tgz",
+      "integrity": "sha512-RMtmw0iFkeR4YV+fUOSucriAQNb9g8zFR52MWCtl+cCZOFRNL6zeB395vPzFhEjjn4fMxXudmELnl/KF/WrK6w==",
+      "dev": true
+    },
+    "node_modules/cross-spawn": {
+      "version": "7.0.6",
+      "resolved": "https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz",
+      "integrity": "sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==",
+      "dev": true,
+      "dependencies": {
+        "path-key": "^3.1.0",
+        "shebang-command": "^2.0.0",
+        "which": "^2.0.1"
+      },
+      "engines": {
+        "node": ">= 8"
+      }
+    },
+    "node_modules/debug": {
+      "version": "4.4.3",
+      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
+      "integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
+      "dev": true,
+      "dependencies": {
+        "ms": "^2.1.3"
+      },
+      "engines": {
+        "node": ">=6.0"
+      },
+      "peerDependenciesMeta": {
+        "supports-color": {
+          "optional": true
+        }
+      }
+    },
+    "node_modules/deep-eql": {
+      "version": "4.1.4",
+      "resolved": "https://registry.npmjs.org/deep-eql/-/deep-eql-4.1.4.tgz",
+      "integrity": "sha512-SUwdGfqdKOwxCPeVYjwSyRpJ7Z+fhpwIAtmCUdZIWZ/YP5R9WAsyuSgpLVDi9bjWoN2LXHNss/dk3urXtdQxGg==",
+      "dev": true,
+      "dependencies": {
+        "type-detect": "^4.0.0"
+      },
+      "engines": {
+        "node": ">=6"
+      }
+    },
+    "node_modules/diff-sequences": {
+      "version": "29.6.3",
+      "resolved": "https://registry.npmjs.org/diff-sequences/-/diff-sequences-29.6.3.tgz",
+      "integrity": "sha512-EjePK1srD3P08o2j4f0ExnylqRs5B9tJjcp9t1krH2qRi8CCdsYfwe9JgSLurFBWwq4uOlipzfk5fHNvwFKr8Q==",
+      "dev": true,
+      "engines": {
+        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
+      }
+    },
+    "node_modules/esbuild": {
+      "version": "0.21.5",
+      "resolved": "https://registry.npmjs.org/esbuild/-/esbuild-0.21.5.tgz",
+      "integrity": "sha512-mg3OPMV4hXywwpoDxu3Qda5xCKQi+vCTZq8S9J/EpkhB2HzKXq4SNFZE3+NK93JYxc8VMSep+lOUSC/RVKaBqw==",
+      "dev": true,
+      "hasInstallScript": true,
+      "bin": {
+        "esbuild": "bin/esbuild"
+      },
+      "engines": {
+        "node": ">=12"
+      },
+      "optionalDependencies": {
+        "@esbuild/aix-ppc64": "0.21.5",
+        "@esbuild/android-arm": "0.21.5",
+        "@esbuild/android-arm64": "0.21.5",
+        "@esbuild/android-x64": "0.21.5",
+        "@esbuild/darwin-arm64": "0.21.5",
+        "@esbuild/darwin-x64": "0.21.5",
+        "@esbuild/freebsd-arm64": "0.21.5",
+        "@esbuild/freebsd-x64": "0.21.5",
+        "@esbuild/linux-arm": "0.21.5",
+        "@esbuild/linux-arm64": "0.21.5",
+        "@esbuild/linux-ia32": "0.21.5",
+        "@esbuild/linux-loong64": "0.21.5",
+        "@esbuild/linux-mips64el": "0.21.5",
+        "@esbuild/linux-ppc64": "0.21.5",
+        "@esbuild/linux-riscv64": "0.21.5",
+        "@esbuild/linux-s390x": "0.21.5",
+        "@esbuild/linux-x64": "0.21.5",
+        "@esbuild/netbsd-x64": "0.21.5",
+        "@esbuild/openbsd-x64": "0.21.5",
+        "@esbuild/sunos-x64": "0.21.5",
+        "@esbuild/win32-arm64": "0.21.5",
+        "@esbuild/win32-ia32": "0.21.5",
+        "@esbuild/win32-x64": "0.21.5"
+      }
+    },
+    "node_modules/estree-walker": {
+      "version": "3.0.3",
+      "resolved": "https://registry.npmjs.org/estree-walker/-/estree-walker-3.0.3.tgz",
+      "integrity": "sha512-7RUKfXgSMMkzt6ZuXmqapOurLGPPfgj6l9uRZ7lRGolvk0y2yocc35LdcxKC5PQZdn2DMqioAQ2NoWcrTKmm6g==",
+      "dev": true,
+      "dependencies": {
+        "@types/estree": "^1.0.0"
+      }
+    },
+    "node_modules/execa": {
+      "version": "8.0.1",
+      "resolved": "https://registry.npmjs.org/execa/-/execa-8.0.1.tgz",
+      "integrity": "sha512-VyhnebXciFV2DESc+p6B+y0LjSm0krU4OgJN44qFAhBY0TJ+1V61tYD2+wHusZ6F9n5K+vl8k0sTy7PEfV4qpg==",
+      "dev": true,
+      "dependencies": {
+        "cross-spawn": "^7.0.3",
+        "get-stream": "^8.0.1",
+        "human-signals": "^5.0.0",
+        "is-stream": "^3.0.0",
+        "merge-stream": "^2.0.0",
+        "npm-run-path": "^5.1.0",
+        "onetime": "^6.0.0",
+        "signal-exit": "^4.1.0",
+        "strip-final-newline": "^3.0.0"
+      },
+      "engines": {
+        "node": ">=16.17"
+      },
+      "funding": {
+        "url": "https://github.com/sindresorhus/execa?sponsor=1"
+      }
+    },
+    "node_modules/fsevents": {
+      "version": "2.3.3",
+      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
+      "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
+      "dev": true,
+      "hasInstallScript": true,
+      "optional": true,
+      "os": [
+        "darwin"
+      ],
+      "engines": {
+        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
+      }
+    },
+    "node_modules/get-func-name": {
+      "version": "2.0.2",
+      "resolved": "https://registry.npmjs.org/get-func-name/-/get-func-name-2.0.2.tgz",
+      "integrity": "sha512-8vXOvuE167CtIc3OyItco7N/dpRtBbYOsPsXCz7X/PMnlGjYjSGuZJgM1Y7mmew7BKf9BqvLX2tnOVy1BBUsxQ==",
+      "dev": true,
+      "engines": {
+        "node": "*"
+      }
+    },
+    "node_modules/get-stream": {
+      "version": "8.0.1",
+      "resolved": "https://registry.npmjs.org/get-stream/-/get-stream-8.0.1.tgz",
+      "integrity": "sha512-VaUJspBffn/LMCJVoMvSAdmscJyS1auj5Zulnn5UoYcY531UWmdwhRWkcGKnGU93m5HSXP9LP2usOryrBtQowA==",
+      "dev": true,
+      "engines": {
+        "node": ">=16"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/human-signals": {
+      "version": "5.0.0",
+      "resolved": "https://registry.npmjs.org/human-signals/-/human-signals-5.0.0.tgz",
+      "integrity": "sha512-AXcZb6vzzrFAUE61HnN4mpLqd/cSIwNQjtNWR0euPm6y0iqx3G4gOXaIDdtdDwZmhwe82LA6+zinmW4UBWVePQ==",
+      "dev": true,
+      "engines": {
+        "node": ">=16.17.0"
+      }
+    },
+    "node_modules/idb-keyval": {
+      "version": "6.3.0",
+      "resolved": "https://registry.npmjs.org/idb-keyval/-/idb-keyval-6.3.0.tgz",
+      "integrity": "sha512-um+2dgAWmYsu615EXpWVwSmapJhON0G43t3Ka/EVaohzPQXSMqKEqeDK/oIW3Ow+BXaF2PvSc+oBTFp793A5Ow=="
+    },
+    "node_modules/is-stream": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/is-stream/-/is-stream-3.0.0.tgz",
+      "integrity": "sha512-LnQR4bZ9IADDRSkvpqMGvt/tEJWclzklNgSw48V5EAaAeDd6qGvN8ei6k5p0tvxSR171VmGyHuTiAOfxAbr8kA==",
+      "dev": true,
+      "engines": {
+        "node": "^12.20.0 || ^14.13.1 || >=16.0.0"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/isexe": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz",
+      "integrity": "sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==",
+      "dev": true
+    },
+    "node_modules/js-tokens": {
+      "version": "9.0.1",
+      "resolved": "https://registry.npmjs.org/js-tokens/-/js-tokens-9.0.1.tgz",
+      "integrity": "sha512-mxa9E9ITFOt0ban3j6L5MpjwegGz6lBQmM1IJkWeBZGcMxto50+eWdjC/52xDbS2vy0k7vIMK0Fe2wfL9OQSpQ==",
+      "dev": true
+    },
+    "node_modules/local-pkg": {
+      "version": "0.5.1",
+      "resolved": "https://registry.npmjs.org/local-pkg/-/local-pkg-0.5.1.tgz",
+      "integrity": "sha512-9rrA30MRRP3gBD3HTGnC6cDFpaE1kVDWxWgqWJUN0RvDNAo+Nz/9GxB+nHOH0ifbVFy0hSA1V6vFDvnx54lTEQ==",
+      "dev": true,
+      "dependencies": {
+        "mlly": "^1.7.3",
+        "pkg-types": "^1.2.1"
+      },
+      "engines": {
+        "node": ">=14"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/antfu"
+      }
+    },
+    "node_modules/loupe": {
+      "version": "2.3.7",
+      "resolved": "https://registry.npmjs.org/loupe/-/loupe-2.3.7.tgz",
+      "integrity": "sha512-zSMINGVYkdpYSOBmLi0D1Uo7JU9nVdQKrHxC8eYlV+9YKK9WePqAlL7lSlorG/U2Fw1w0hTBmaa/jrQ3UbPHtA==",
+      "dev": true,
+      "dependencies": {
+        "get-func-name": "^2.0.1"
+      }
+    },
+    "node_modules/magic-string": {
+      "version": "0.30.21",
+      "resolved": "https://registry.npmjs.org/magic-string/-/magic-string-0.30.21.tgz",
+      "integrity": "sha512-vd2F4YUyEXKGcLHoq+TEyCjxueSeHnFxyyjNp80yg0XV4vUhnDer/lvvlqM/arB5bXQN5K2/3oinyCRyx8T2CQ==",
+      "dev": true,
+      "dependencies": {
+        "@jridgewell/sourcemap-codec": "^1.5.5"
+      }
+    },
+    "node_modules/merge-stream": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/merge-stream/-/merge-stream-2.0.0.tgz",
+      "integrity": "sha512-abv/qOcuPfk3URPfDzmZU1LKmuw8kT+0nIHvKrKgFrwifol/doWcdA4ZqsWQ8ENrFKkd67Mfpo/LovbIUsbt3w==",
+      "dev": true
+    },
+    "node_modules/mimic-fn": {
+      "version": "4.0.0",
+      "resolved": "https://registry.npmjs.org/mimic-fn/-/mimic-fn-4.0.0.tgz",
+      "integrity": "sha512-vqiC06CuhBTUdZH+RYl8sFrL096vA45Ok5ISO6sE/Mr1jRbGH4Csnhi8f3wKVl7x8mO4Au7Ir9D3Oyv1VYMFJw==",
+      "dev": true,
+      "engines": {
+        "node": ">=12"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/mlly": {
+      "version": "1.8.2",
+      "resolved": "https://registry.npmjs.org/mlly/-/mlly-1.8.2.tgz",
+      "integrity": "sha512-d+ObxMQFmbt10sretNDytwt85VrbkhhUA/JBGm1MPaWJ65Cl4wOgLaB1NYvJSZ0Ef03MMEU/0xpPMXUIQ29UfA==",
+      "dev": true,
+      "dependencies": {
+        "acorn": "^8.16.0",
+        "pathe": "^2.0.3",
+        "pkg-types": "^1.3.1",
+        "ufo": "^1.6.3"
+      }
+    },
+    "node_modules/mlly/node_modules/pathe": {
+      "version": "2.0.3",
+      "resolved": "https://registry.npmjs.org/pathe/-/pathe-2.0.3.tgz",
+      "integrity": "sha512-WUjGcAqP1gQacoQe+OBJsFA7Ld4DyXuUIjZ5cc75cLHvJ7dtNsTugphxIADwspS+AraAUePCKrSVtPLFj/F88w==",
+      "dev": true
+    },
+    "node_modules/ms": {
+      "version": "2.1.3",
+      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
+      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
+      "dev": true
+    },
+    "node_modules/nanoid": {
+      "version": "3.3.16",
+      "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.16.tgz",
+      "integrity": "sha512-bzlKTyNJ7+LdGIIwy8ijFpIqEQIvafahV7eYykJ8Cvh42EdJeODoJ6gUJXpQJvej1BddH8OqTXZNE/KfbWAu8Q==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/ai"
+        }
+      ],
+      "bin": {
+        "nanoid": "bin/nanoid.cjs"
+      },
+      "engines": {
+        "node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
+      }
+    },
+    "node_modules/npm-run-path": {
+      "version": "5.3.0",
+      "resolved": "https://registry.npmjs.org/npm-run-path/-/npm-run-path-5.3.0.tgz",
+      "integrity": "sha512-ppwTtiJZq0O/ai0z7yfudtBpWIoxM8yE6nHi1X47eFR2EWORqfbu6CnPlNsjeN683eT0qG6H/Pyf9fCcvjnnnQ==",
+      "dev": true,
+      "dependencies": {
+        "path-key": "^4.0.0"
+      },
+      "engines": {
+        "node": "^12.20.0 || ^14.13.1 || >=16.0.0"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/npm-run-path/node_modules/path-key": {
+      "version": "4.0.0",
+      "resolved": "https://registry.npmjs.org/path-key/-/path-key-4.0.0.tgz",
+      "integrity": "sha512-haREypq7xkM7ErfgIyA0z+Bj4AGKlMSdlQE2jvJo6huWD1EdkKYV+G/T4nq0YEF2vgTT8kqMFKo1uHn950r4SQ==",
+      "dev": true,
+      "engines": {
+        "node": ">=12"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/onetime": {
+      "version": "6.0.0",
+      "resolved": "https://registry.npmjs.org/onetime/-/onetime-6.0.0.tgz",
+      "integrity": "sha512-1FlR+gjXK7X+AsAHso35MnyN5KqGwJRi/31ft6x0M194ht7S+rWAvd7PHss9xSKMzE0asv1pyIHaJYq+BbacAQ==",
+      "dev": true,
+      "dependencies": {
+        "mimic-fn": "^4.0.0"
+      },
+      "engines": {
+        "node": ">=12"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/p-limit": {
+      "version": "5.0.0",
+      "resolved": "https://registry.npmjs.org/p-limit/-/p-limit-5.0.0.tgz",
+      "integrity": "sha512-/Eaoq+QyLSiXQ4lyYV23f14mZRQcXnxfHrN0vCai+ak9G0pp9iEQukIIZq5NccEvwRB8PUnZT0KsOoDCINS1qQ==",
+      "dev": true,
+      "dependencies": {
+        "yocto-queue": "^1.0.0"
+      },
+      "engines": {
+        "node": ">=18"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/path-key": {
+      "version": "3.1.1",
+      "resolved": "https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz",
+      "integrity": "sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==",
+      "dev": true,
+      "engines": {
+        "node": ">=8"
+      }
+    },
+    "node_modules/pathe": {
+      "version": "1.1.2",
+      "resolved": "https://registry.npmjs.org/pathe/-/pathe-1.1.2.tgz",
+      "integrity": "sha512-whLdWMYL2TwI08hn8/ZqAbrVemu0LNaNNJZX73O6qaIdCTfXutsLhMkjdENX0qhsQ9uIimo4/aQOmXkoon2nDQ==",
+      "dev": true
+    },
+    "node_modules/pathval": {
+      "version": "1.1.1",
+      "resolved": "https://registry.npmjs.org/pathval/-/pathval-1.1.1.tgz",
+      "integrity": "sha512-Dp6zGqpTdETdR63lehJYPeIOqpiNBNtc7BpWSLrOje7UaIsE5aY92r/AunQA7rsXvet3lrJ3JnZX29UPTKXyKQ==",
+      "dev": true,
+      "engines": {
+        "node": "*"
+      }
+    },
+    "node_modules/picocolors": {
+      "version": "1.1.1",
+      "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
+      "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
+      "dev": true
+    },
+    "node_modules/pkg-types": {
+      "version": "1.3.1",
+      "resolved": "https://registry.npmjs.org/pkg-types/-/pkg-types-1.3.1.tgz",
+      "integrity": "sha512-/Jm5M4RvtBFVkKWRu2BLUTNP8/M2a+UwuAX+ae4770q1qVGtfjG+WTCupoZixokjmHiry8uI+dlY8KXYV5HVVQ==",
+      "dev": true,
+      "dependencies": {
+        "confbox": "^0.1.8",
+        "mlly": "^1.7.4",
+        "pathe": "^2.0.1"
+      }
+    },
+    "node_modules/pkg-types/node_modules/pathe": {
+      "version": "2.0.3",
+      "resolved": "https://registry.npmjs.org/pathe/-/pathe-2.0.3.tgz",
+      "integrity": "sha512-WUjGcAqP1gQacoQe+OBJsFA7Ld4DyXuUIjZ5cc75cLHvJ7dtNsTugphxIADwspS+AraAUePCKrSVtPLFj/F88w==",
+      "dev": true
+    },
+    "node_modules/postcss": {
+      "version": "8.5.24",
+      "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.24.tgz",
+      "integrity": "sha512-8RyVklq0owXUTa4xlpzu4l9AaVKIdQvAcOHZWaMh98HgySsUtxRVf/chRe3dsSLqb6i40BzGRzEUddRaI+9TSw==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/postcss/"
+        },
+        {
+          "type": "tidelift",
+          "url": "https://tidelift.com/funding/github/npm/postcss"
+        },
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/ai"
+        }
+      ],
+      "dependencies": {
+        "nanoid": "^3.3.16",
+        "picocolors": "^1.1.1",
+        "source-map-js": "^1.2.1"
+      },
+      "engines": {
+        "node": "^10 || ^12 || >=14"
+      }
+    },
+    "node_modules/pretty-format": {
+      "version": "29.7.0",
+      "resolved": "https://registry.npmjs.org/pretty-format/-/pretty-format-29.7.0.tgz",
+      "integrity": "sha512-Pdlw/oPxN+aXdmM9R00JVC9WVFoCLTKJvDVLgmJ+qAffBMxsV85l/Lu7sNx4zSzPyoL2euImuEwHhOXdEgNFZQ==",
+      "dev": true,
+      "dependencies": {
+        "@jest/schemas": "^29.6.3",
+        "ansi-styles": "^5.0.0",
+        "react-is": "^18.0.0"
+      },
+      "engines": {
+        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
+      }
+    },
+    "node_modules/react-is": {
+      "version": "18.3.1",
+      "resolved": "https://registry.npmjs.org/react-is/-/react-is-18.3.1.tgz",
+      "integrity": "sha512-/LLMVyas0ljjAtoYiPqYiL8VWXzUUdThrmU5+n20DZv+a+ClRoevUzw5JxU+Ieh5/c87ytoTBV9G1FiKfNJdmg==",
+      "dev": true
+    },
+    "node_modules/rollup": {
+      "version": "4.62.3",
+      "resolved": "https://registry.npmjs.org/rollup/-/rollup-4.62.3.tgz",
+      "integrity": "sha512-Gu0c0iH9FzgX1L1t7ByIbbS3Vmdz+6KHm/EsqmmC71gUQ82yvZRkTK6XzrFObSka91WUVdynqp6nsfilzr5k6Q==",
+      "dev": true,
+      "dependencies": {
+        "@types/estree": "1.0.9"
+      },
+      "bin": {
+        "rollup": "dist/bin/rollup"
+      },
+      "engines": {
+        "node": ">=18.0.0",
+        "npm": ">=8.0.0"
+      },
+      "optionalDependencies": {
+        "@rollup/rollup-android-arm-eabi": "4.62.3",
+        "@rollup/rollup-android-arm64": "4.62.3",
+        "@rollup/rollup-darwin-arm64": "4.62.3",
+        "@rollup/rollup-darwin-x64": "4.62.3",
+        "@rollup/rollup-freebsd-arm64": "4.62.3",
+        "@rollup/rollup-freebsd-x64": "4.62.3",
+        "@rollup/rollup-linux-arm-gnueabihf": "4.62.3",
+        "@rollup/rollup-linux-arm-musleabihf": "4.62.3",
+        "@rollup/rollup-linux-arm64-gnu": "4.62.3",
+        "@rollup/rollup-linux-arm64-musl": "4.62.3",
+        "@rollup/rollup-linux-loong64-gnu": "4.62.3",
+        "@rollup/rollup-linux-loong64-musl": "4.62.3",
+        "@rollup/rollup-linux-ppc64-gnu": "4.62.3",
+        "@rollup/rollup-linux-ppc64-musl": "4.62.3",
+        "@rollup/rollup-linux-riscv64-gnu": "4.62.3",
+        "@rollup/rollup-linux-riscv64-musl": "4.62.3",
+        "@rollup/rollup-linux-s390x-gnu": "4.62.3",
+        "@rollup/rollup-linux-x64-gnu": "4.62.3",
+        "@rollup/rollup-linux-x64-musl": "4.62.3",
+        "@rollup/rollup-openbsd-x64": "4.62.3",
+        "@rollup/rollup-openharmony-arm64": "4.62.3",
+        "@rollup/rollup-win32-arm64-msvc": "4.62.3",
+        "@rollup/rollup-win32-ia32-msvc": "4.62.3",
+        "@rollup/rollup-win32-x64-gnu": "4.62.3",
+        "@rollup/rollup-win32-x64-msvc": "4.62.3",
+        "fsevents": "~2.3.2"
+      }
+    },
+    "node_modules/seedrandom": {
+      "version": "3.0.5",
+      "resolved": "https://registry.npmjs.org/seedrandom/-/seedrandom-3.0.5.tgz",
+      "integrity": "sha512-8OwmbklUNzwezjGInmZ+2clQmExQPvomqjL7LFqOYqtmuxRgQYqOD3mHaU+MvZn5FLUeVxVfQjwLZW/n/JFuqg=="
+    },
+    "node_modules/shebang-command": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz",
+      "integrity": "sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==",
+      "dev": true,
+      "dependencies": {
+        "shebang-regex": "^3.0.0"
+      },
+      "engines": {
+        "node": ">=8"
+      }
+    },
+    "node_modules/shebang-regex": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz",
+      "integrity": "sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==",
+      "dev": true,
+      "engines": {
+        "node": ">=8"
+      }
+    },
+    "node_modules/siginfo": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/siginfo/-/siginfo-2.0.0.tgz",
+      "integrity": "sha512-ybx0WO1/8bSBLEWXZvEd7gMW3Sn3JFlW3TvX1nREbDLRNQNaeNN8WK0meBwPdAaOI7TtRRRJn/Es1zhrrCHu7g==",
+      "dev": true
+    },
+    "node_modules/signal-exit": {
+      "version": "4.1.0",
+      "resolved": "https://registry.npmjs.org/signal-exit/-/signal-exit-4.1.0.tgz",
+      "integrity": "sha512-bzyZ1e88w9O1iNJbKnOlvYTrWPDl46O1bG0D3XInv+9tkPrxrN8jUUTiFlDkkmKWgn1M6CfIA13SuGqOa9Korw==",
+      "dev": true,
+      "engines": {
+        "node": ">=14"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/isaacs"
+      }
+    },
+    "node_modules/source-map-js": {
+      "version": "1.2.1",
+      "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz",
+      "integrity": "sha512-UXWMKhLOwVKb728IUtQPXxfYU+usdybtUrK/8uGE8CQMvrhOpwvzDBwj0QhSL7MQc7vIsISBG8VQ8+IDQxpfQA==",
+      "dev": true,
+      "engines": {
+        "node": ">=0.10.0"
+      }
+    },
+    "node_modules/stackback": {
+      "version": "0.0.2",
+      "resolved": "https://registry.npmjs.org/stackback/-/stackback-0.0.2.tgz",
+      "integrity": "sha512-1XMJE5fQo1jGH6Y/7ebnwPOBEkIEnT4QF32d5R1+VXdXveM0IBMJt8zfaxX1P3QhVwrYe+576+jkANtSS2mBbw==",
+      "dev": true
+    },
+    "node_modules/std-env": {
+      "version": "3.10.0",
+      "resolved": "https://registry.npmjs.org/std-env/-/std-env-3.10.0.tgz",
+      "integrity": "sha512-5GS12FdOZNliM5mAOxFRg7Ir0pWz8MdpYm6AY6VPkGpbA7ZzmbzNcBJQ0GPvvyWgcY7QAhCgf9Uy89I03faLkg==",
+      "dev": true
+    },
+    "node_modules/strip-final-newline": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/strip-final-newline/-/strip-final-newline-3.0.0.tgz",
+      "integrity": "sha512-dOESqjYr96iWYylGObzd39EuNTa5VJxyvVAEm5Jnh7KGo75V43Hk1odPQkNDyXNmUR6k+gEiDVXnjB8HJ3crXw==",
+      "dev": true,
+      "engines": {
+        "node": ">=12"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/strip-literal": {
+      "version": "2.1.1",
+      "resolved": "https://registry.npmjs.org/strip-literal/-/strip-literal-2.1.1.tgz",
+      "integrity": "sha512-631UJ6O00eNGfMiWG78ck80dfBab8X6IVFB51jZK5Icd7XAs60Z5y7QdSd/wGIklnWvRbUNloVzhOKKmutxQ6Q==",
+      "dev": true,
+      "dependencies": {
+        "js-tokens": "^9.0.1"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/antfu"
+      }
+    },
+    "node_modules/tinybench": {
+      "version": "2.9.0",
+      "resolved": "https://registry.npmjs.org/tinybench/-/tinybench-2.9.0.tgz",
+      "integrity": "sha512-0+DUvqWMValLmha6lr4kD8iAMK1HzV0/aKnCtWb9v9641TnP/MFb7Pc2bxoxQjTXAErryXVgUOfv2YqNllqGeg==",
+      "dev": true
+    },
+    "node_modules/tinypool": {
+      "version": "0.8.4",
+      "resolved": "https://registry.npmjs.org/tinypool/-/tinypool-0.8.4.tgz",
+      "integrity": "sha512-i11VH5gS6IFeLY3gMBQ00/MmLncVP7JLXOw1vlgkytLmJK7QnEr7NXf0LBdxfmNPAeyetukOk0bOYrJrFGjYJQ==",
+      "dev": true,
+      "engines": {
+        "node": ">=14.0.0"
+      }
+    },
+    "node_modules/tinyspy": {
+      "version": "2.2.1",
+      "resolved": "https://registry.npmjs.org/tinyspy/-/tinyspy-2.2.1.tgz",
+      "integrity": "sha512-KYad6Vy5VDWV4GH3fjpseMQ/XU2BhIYP7Vzd0LG44qRWm/Yt2WCOTicFdvmgo6gWaqooMQCawTtILVQJupKu7A==",
+      "dev": true,
+      "engines": {
+        "node": ">=14.0.0"
+      }
+    },
+    "node_modules/type-detect": {
+      "version": "4.1.0",
+      "resolved": "https://registry.npmjs.org/type-detect/-/type-detect-4.1.0.tgz",
+      "integrity": "sha512-Acylog8/luQ8L7il+geoSxhEkazvkslg7PSNKOX59mbB9cOveP5aq9h74Y7YU8yDpJwetzQQrfIwtf4Wp4LKcw==",
+      "dev": true,
+      "engines": {
+        "node": ">=4"
+      }
+    },
+    "node_modules/typescript": {
+      "version": "5.9.3",
+      "resolved": "https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz",
+      "integrity": "sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==",
+      "dev": true,
+      "bin": {
+        "tsc": "bin/tsc",
+        "tsserver": "bin/tsserver"
+      },
+      "engines": {
+        "node": ">=14.17"
+      }
+    },
+    "node_modules/ufo": {
+      "version": "1.6.4",
+      "resolved": "https://registry.npmjs.org/ufo/-/ufo-1.6.4.tgz",
+      "integrity": "sha512-JFNbkD1Svwe0KvGi8GOeLcP4kAWQ609twvCdcHxq1oSL8svv39ZuSvajcD8B+5D0eL4+s1Is2D/O6KN3qcTeRA==",
+      "dev": true
+    },
+    "node_modules/undici-types": {
+      "version": "6.21.0",
+      "resolved": "https://registry.npmjs.org/undici-types/-/undici-types-6.21.0.tgz",
+      "integrity": "sha512-iwDZqg0QAGrg9Rav5H4n0M64c3mkR59cJ6wQp+7C4nI0gsmExaedaYLNO44eT4AtBBwjbTiGPMlt2Md0T9H9JQ==",
+      "dev": true
+    },
+    "node_modules/vite": {
+      "version": "5.4.21",
+      "resolved": "https://registry.npmjs.org/vite/-/vite-5.4.21.tgz",
+      "integrity": "sha512-o5a9xKjbtuhY6Bi5S3+HvbRERmouabWbyUcpXXUA1u+GNUKoROi9byOJ8M0nHbHYHkYICiMlqxkg1KkYmm25Sw==",
+      "dev": true,
+      "dependencies": {
+        "esbuild": "^0.21.3",
+        "postcss": "^8.4.43",
+        "rollup": "^4.20.0"
+      },
+      "bin": {
+        "vite": "bin/vite.js"
+      },
+      "engines": {
+        "node": "^18.0.0 || >=20.0.0"
+      },
+      "funding": {
+        "url": "https://github.com/vitejs/vite?sponsor=1"
+      },
+      "optionalDependencies": {
+        "fsevents": "~2.3.3"
+      },
+      "peerDependencies": {
+        "@types/node": "^18.0.0 || >=20.0.0",
+        "less": "*",
+        "lightningcss": "^1.21.0",
+        "sass": "*",
+        "sass-embedded": "*",
+        "stylus": "*",
+        "sugarss": "*",
+        "terser": "^5.4.0"
+      },
+      "peerDependenciesMeta": {
+        "@types/node": {
+          "optional": true
+        },
+        "less": {
+          "optional": true
+        },
+        "lightningcss": {
+          "optional": true
+        },
+        "sass": {
+          "optional": true
+        },
+        "sass-embedded": {
+          "optional": true
+        },
+        "stylus": {
+          "optional": true
+        },
+        "sugarss": {
+          "optional": true
+        },
+        "terser": {
+          "optional": true
+        }
+      }
+    },
+    "node_modules/vite-node": {
+      "version": "1.6.1",
+      "resolved": "https://registry.npmjs.org/vite-node/-/vite-node-1.6.1.tgz",
+      "integrity": "sha512-YAXkfvGtuTzwWbDSACdJSg4A4DZiAqckWe90Zapc/sEX3XvHcw1NdurM/6od8J207tSDqNbSsgdCacBgvJKFuA==",
+      "dev": true,
+      "dependencies": {
+        "cac": "^6.7.14",
+        "debug": "^4.3.4",
+        "pathe": "^1.1.1",
+        "picocolors": "^1.0.0",
+        "vite": "^5.0.0"
+      },
+      "bin": {
+        "vite-node": "vite-node.mjs"
+      },
+      "engines": {
+        "node": "^18.0.0 || >=20.0.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/vitest": {
+      "version": "1.6.1",
+      "resolved": "https://registry.npmjs.org/vitest/-/vitest-1.6.1.tgz",
+      "integrity": "sha512-Ljb1cnSJSivGN0LqXd/zmDbWEM0RNNg2t1QW/XUhYl/qPqyu7CsqeWtqQXHVaJsecLPuDoak2oJcZN2QoRIOag==",
+      "dev": true,
+      "dependencies": {
+        "@vitest/expect": "1.6.1",
+        "@vitest/runner": "1.6.1",
+        "@vitest/snapshot": "1.6.1",
+        "@vitest/spy": "1.6.1",
+        "@vitest/utils": "1.6.1",
+        "acorn-walk": "^8.3.2",
+        "chai": "^4.3.10",
+        "debug": "^4.3.4",
+        "execa": "^8.0.1",
+        "local-pkg": "^0.5.0",
+        "magic-string": "^0.30.5",
+        "pathe": "^1.1.1",
+        "picocolors": "^1.0.0",
+        "std-env": "^3.5.0",
+        "strip-literal": "^2.0.0",
+        "tinybench": "^2.5.1",
+        "tinypool": "^0.8.3",
+        "vite": "^5.0.0",
+        "vite-node": "1.6.1",
+        "why-is-node-running": "^2.2.2"
+      },
+      "bin": {
+        "vitest": "vitest.mjs"
+      },
+      "engines": {
+        "node": "^18.0.0 || >=20.0.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      },
+      "peerDependencies": {
+        "@edge-runtime/vm": "*",
+        "@types/node": "^18.0.0 || >=20.0.0",
+        "@vitest/browser": "1.6.1",
+        "@vitest/ui": "1.6.1",
+        "happy-dom": "*",
+        "jsdom": "*"
+      },
+      "peerDependenciesMeta": {
+        "@edge-runtime/vm": {
+          "optional": true
+        },
+        "@types/node": {
+          "optional": true
+        },
+        "@vitest/browser": {
+          "optional": true
+        },
+        "@vitest/ui": {
+          "optional": true
+        },
+        "happy-dom": {
+          "optional": true
+        },
+        "jsdom": {
+          "optional": true
+        }
+      }
+    },
+    "node_modules/which": {
+      "version": "2.0.2",
+      "resolved": "https://registry.npmjs.org/which/-/which-2.0.2.tgz",
+      "integrity": "sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==",
+      "dev": true,
+      "dependencies": {
+        "isexe": "^2.0.0"
+      },
+      "bin": {
+        "node-which": "bin/node-which"
+      },
+      "engines": {
+        "node": ">= 8"
+      }
+    },
+    "node_modules/why-is-node-running": {
+      "version": "2.3.0",
+      "resolved": "https://registry.npmjs.org/why-is-node-running/-/why-is-node-running-2.3.0.tgz",
+      "integrity": "sha512-hUrmaWBdVDcxvYqnyh09zunKzROWjbZTiNy8dBEjkS7ehEDQibXJ7XvlmtbwuTclUiIyN+CyXQD4Vmko8fNm8w==",
+      "dev": true,
+      "dependencies": {
+        "siginfo": "^2.0.0",
+        "stackback": "0.0.2"
+      },
+      "bin": {
+        "why-is-node-running": "cli.js"
+      },
+      "engines": {
+        "node": ">=8"
+      }
+    },
+    "node_modules/yocto-queue": {
+      "version": "1.2.2",
+      "resolved": "https://registry.npmjs.org/yocto-queue/-/yocto-queue-1.2.2.tgz",
+      "integrity": "sha512-4LCcse/U2MHZ63HAJVE+v71o7yOdIe4cZ70Wpf8D/IyjDKYQLV5GD46B+hSTjJsvV5PztjvHoU580EftxjDZFQ==",
+      "dev": true,
+      "engines": {
+        "node": ">=12.20"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    }
+  }
+}
diff --git a/package.json b/package.json
new file mode 100644
index 0000000..300d690
--- /dev/null
+++ b/package.json
@@ -0,0 +1,23 @@
+{
+  "name": "wandering-dungeon",
+  "private": true,
+  "version": "0.1.0",
+  "type": "module",
+  "scripts": {
+    "dev": "vite",
+    "build": "tsc && vite build",
+    "preview": "vite preview",
+    "test": "vitest run"
+  },
+  "dependencies": {
+    "idb-keyval": "^6.2.1",
+    "seedrandom": "^3.0.5"
+  },
+  "devDependencies": {
+    "@types/node": "^20.11.0",
+    "@types/seedrandom": "^3.0.8",
+    "typescript": "^5.3.3",
+    "vite": "^5.1.0",
+    "vitest": "^1.2.2"
+  }
+}
diff --git a/public/manifest.json b/public/manifest.json
new file mode 100644
index 0000000..e0bcda1
--- /dev/null
+++ b/public/manifest.json
@@ -0,0 +1,22 @@
+{
+  "name": "The Wandering Dungeon",
+  "short_name": "WanderingDungeon",
+  "description": "A reality-bending turn-based grid roguelite web app",
+  "start_url": "/",
+  "display": "standalone",
+  "background_color": "#0f0f15",
+  "theme_color": "#0f0f15",
+  "orientation": "portrait",
+  "icons": [
+    {
+      "src": "/icon-192.png",
+      "sizes": "192x192",
+      "type": "image/png"
+    },
+    {
+      "src": "/icon-512.png",
+      "sizes": "512x512",
+      "type": "image/png"
+    }
+  ]
+}
diff --git a/src/main.ts b/src/main.ts
new file mode 100644
index 0000000..21f356a
--- /dev/null
+++ b/src/main.ts
@@ -0,0 +1,11 @@
+console.log('The Wandering Dungeon initialized.');
+
+const appContainer = document.getElementById('app');
+if (appContainer) {
+  appContainer.innerHTML = `
+    <div style="display: flex; flex-direction: column; height: 100%; align-items: center; justify-content: center; text-align: center; padding: 20px;">
+      <h1 style="color: var(--accent-cyan); margin-bottom: 12px; text-shadow: 0 0 10px var(--accent-cyan-glow);">The Wandering Dungeon</h1>
+      <p style="color: var(--text-muted); max-width: 400px; line-height: 1.5;">Reality is shifting... Prepare to descend into the unstable depths.</p>
+    </div>
+  `;
+}
diff --git a/src/styles/main.css b/src/styles/main.css
new file mode 100644
index 0000000..a70f368
--- /dev/null
+++ b/src/styles/main.css
@@ -0,0 +1,171 @@
+:root {
+  /* Core Color Tokens */
+  --bg-main: #0f0f15;
+  --bg-secondary: #161622;
+  --bg-glass: rgba(22, 22, 34, 0.75);
+  --bg-glass-card: rgba(30, 30, 46, 0.65);
+
+  --accent-cyan: #00f0ff;
+  --accent-cyan-glow: rgba(0, 240, 255, 0.25);
+  --accent-purple: #9d4edd;
+  --accent-purple-glow: rgba(157, 78, 221, 0.25);
+  --warning-red: #ff0055;
+  --warning-red-glow: rgba(255, 0, 85, 0.3);
+
+  --text-main: #f0f3f8;
+  --text-muted: #8b92b0;
+  --text-dim: #5c627d;
+
+  --border-color: rgba(255, 255, 255, 0.1);
+  --border-glow: rgba(0, 240, 255, 0.3);
+
+  /* Typography */
+  --font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
+  --font-mono: 'JetBrains Mono', 'Fira Code', 'Courier New', Courier, monospace;
+
+  /* Touch & Layout Spacing */
+  --safe-area-top: env(safe-area-inset-top, 0px);
+  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
+  --safe-area-left: env(safe-area-inset-left, 0px);
+  --safe-area-right: env(safe-area-inset-right, 0px);
+
+  --thumb-bar-height: 72px;
+}
+
+/* Base Reset & Touch Prevention */
+*, *::before, *::after {
+  box-sizing: border-box;
+  margin: 0;
+  padding: 0;
+  user-select: none;
+  -webkit-user-select: none;
+  -webkit-touch-callout: none;
+  -webkit-tap-highlight-color: transparent;
+}
+
+html, body {
+  width: 100%;
+  height: 100%;
+  overflow: hidden;
+  background-color: var(--bg-main);
+  color: var(--text-main);
+  font-family: var(--font-family);
+  touch-action: none; /* Prevent browser scrolling & pull-to-refresh */
+  -webkit-text-size-adjust: 100%;
+}
+
+#app {
+  width: 100%;
+  height: 100%;
+  display: flex;
+  flex-direction: column;
+  position: relative;
+  overflow: hidden;
+  padding-top: var(--safe-area-top);
+  padding-bottom: var(--safe-area-bottom);
+  padding-left: var(--safe-area-left);
+  padding-right: var(--safe-area-right);
+}
+
+/* Glassmorphic Overlay Utility */
+.glass-panel {
+  background: var(--bg-glass);
+  backdrop-filter: blur(12px);
+  -webkit-backdrop-filter: blur(12px);
+  border: 1px solid var(--border-color);
+  border-radius: 12px;
+  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
+}
+
+/* Header & HUD Layout */
+.hud-header {
+  display: flex;
+  justify-content: space-between;
+  align-items: center;
+  padding: 12px 16px;
+  background: var(--bg-glass-card);
+  backdrop-filter: blur(8px);
+  border-bottom: 1px solid var(--border-color);
+  z-index: 10;
+}
+
+/* Main Gameplay Viewport */
+.game-viewport {
+  flex: 1;
+  position: relative;
+  display: flex;
+  justify-content: center;
+  align-items: center;
+  overflow: hidden;
+}
+
+/* Grid Canvas container */
+.grid-container {
+  display: grid;
+  place-items: center;
+  width: 100%;
+  height: 100%;
+}
+
+/* Thumb Action Bar (Bottom Reachable on Mobile) */
+.thumb-action-bar {
+  position: absolute;
+  bottom: calc(12px + var(--safe-area-bottom));
+  left: 50%;
+  transform: translateX(-50%);
+  width: calc(100% - 32px);
+  max-width: 480px;
+  height: var(--thumb-bar-height);
+  display: flex;
+  align-items: center;
+  justify-content: space-around;
+  padding: 8px;
+  gap: 8px;
+  background: var(--bg-glass);
+  backdrop-filter: blur(16px);
+  -webkit-backdrop-filter: blur(16px);
+  border: 1px solid var(--border-color);
+  border-radius: 20px;
+  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 0 20px var(--accent-cyan-glow);
+  z-index: 20;
+}
+
+/* Interactive Buttons */
+.action-btn {
+  flex: 1;
+  height: 100%;
+  display: flex;
+  flex-direction: column;
+  align-items: center;
+  justify-content: center;
+  background: rgba(255, 255, 255, 0.05);
+  border: 1px solid var(--border-color);
+  border-radius: 12px;
+  color: var(--text-main);
+  font-weight: 600;
+  font-size: 0.85rem;
+  cursor: pointer;
+  transition: all 0.2s ease;
+}
+
+.action-btn:hover, .action-btn:active {
+  background: var(--accent-cyan-glow);
+  border-color: var(--accent-cyan);
+  color: var(--accent-cyan);
+}
+
+.action-btn--warning:hover, .action-btn--warning:active {
+  background: var(--warning-red-glow);
+  border-color: var(--warning-red);
+  color: var(--warning-red);
+}
+
+/* Animations */
+@keyframes pulse-glow {
+  0%, 100% {
+    box-shadow: 0 0 10px var(--accent-cyan-glow);
+  }
+  50% {
+    box-shadow: 0 0 25px var(--accent-cyan-glow), 0 0 15px var(--accent-purple-glow);
+  }
+}
diff --git a/tests/scaffold.test.ts b/tests/scaffold.test.ts
new file mode 100644
index 0000000..428e24d
--- /dev/null
+++ b/tests/scaffold.test.ts
@@ -0,0 +1,7 @@
+import { describe, it, expect } from 'vitest';
+
+describe('Project Scaffold', () => {
+  it('should pass initial sanity check', () => {
+    expect(true).toBe(true);
+  });
+});
diff --git a/tsconfig.json b/tsconfig.json
new file mode 100644
index 0000000..e52bdc7
--- /dev/null
+++ b/tsconfig.json
@@ -0,0 +1,17 @@
+{
+  "compilerOptions": {
+    "target": "ESNext",
+    "module": "ESNext",
+    "moduleResolution": "bundler",
+    "strict": true,
+    "jsx": "preserve",
+    "skipLibCheck": true,
+    "esModuleInterop": true,
+    "allowSyntheticDefaultImports": true,
+    "resolveJsonModule": true,
+    "isolatedModules": true,
+    "noEmit": true,
+    "lib": ["ESNext", "DOM", "DOM.Iterable"]
+  },
+  "include": ["src/**/*", "tests/**/*", "vite.config.ts"]
+}
diff --git a/vite.config.ts b/vite.config.ts
new file mode 100644
index 0000000..35f9d75
--- /dev/null
+++ b/vite.config.ts
@@ -0,0 +1,20 @@
+/// <reference types="vitest" />
+import { defineConfig } from 'vite';
+
+export default defineConfig({
+  root: '.',
+  publicDir: 'public',
+  build: {
+    outDir: 'dist',
+    target: 'esnext',
+  },
+  server: {
+    host: true,
+    port: 3000,
+  },
+  test: {
+    globals: true,
+    environment: 'node',
+    include: ['tests/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
+  },
+});
