/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { runLogPlugin } from './vite/runLogPlugin';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [runLogPlugin()],
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
