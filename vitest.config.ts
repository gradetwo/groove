import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    /**
     * Absolute on purpose.
     *
     * A relative `'./src/test/setup.ts'` is resolved by Vitest against its own notion of the
     * project root, which is *not* necessarily this config's directory when the suite is started
     * from a directory nested inside another checkout (unpacking the slow-track source package
     * inside an existing clone does exactly that). A v2.0.18 run on another machine then failed to
     * load this file at all — `Failed to load url …/src/test/setup.ts`, 120 test files, zero
     * assertions executed. `__dirname` pins it to the file that declares it, so the suite means the
     * same thing wherever it is started from.
     */
    setupFiles: [path.resolve(__dirname, './src/test/setup.ts')],
    // Git worktrees for parallel workstreams live under .worktrees/ INSIDE the repo
    // root (needed for the file sandbox). Without this, `vitest run` would also
    // collect every worktree's copy of the suite and report thousands of tests.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '.worktrees/**', 'release/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**'],
      exclude: [
        'node_modules/',
        'dist/**',
        'scripts/**',
        'src/test/**',
        '**/*.d.ts',
      ],
      // Real gate, not a formality: thresholds sit a few points below the measured
      // baseline so normal churn passes but a genuine regression turns CI red.
      // Measured on this branch (Node 22.22.3, 192 files / 2185 tests): lines 90.58%,
      // statements 90.58%, branches 75.31%, functions 66.08%.
      thresholds: {
        lines: 78,
        statements: 78,
        branches: 60,
        functions: 58,
      },
    },
  },
});
