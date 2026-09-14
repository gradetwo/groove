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
    setupFiles: ['./src/test/setup.ts'],
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
    },
  },
});
