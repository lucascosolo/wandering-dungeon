/// <reference types="vitest" />
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { runLogPlugin } from './vite/runLogPlugin';
import pkg from './package.json';

/**
 * Something that tells two builds of the same version apart. During an alpha
 * every build is 0.1.0, so the version alone cannot tie a tester's bug report to
 * the code that produced it.
 *
 * Git is not guaranteed here — a tarball, a CI checkout without history, or a
 * machine with no git at all. Falling back to a build timestamp keeps the stamp
 * present and still distinguishing rather than letting the config throw and take
 * the whole build (and `npm run dev`) with it.
 */
function buildId(): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const dirty =
      execFileSync('git', ['status', '--porcelain'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim().length > 0;
    if (sha) return dirty ? `${sha}+` : sha;
  } catch {
    // fall through to the timestamp
  }
  return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [runLogPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
  server: {
    host: true,
    port: 3000,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
  },
});
