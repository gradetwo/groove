import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Port isolation for parallel dev instances / git worktrees (E-06).
// PORT (or VITE_PORT) wins over the default; PREVIEW_PORT for `vite preview`.
// strictPort stays false so a busy port degrades to the next free one instead of
// blocking development, and Vite always prints the port it actually bound.
const resolvePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DEV_PORT = resolvePort(process.env.PORT ?? process.env.VITE_PORT, 3000);
const PREVIEW_PORT = resolvePort(process.env.PREVIEW_PORT, 4173);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: DEV_PORT,
    strictPort: false,
    host: true,
  },
  preview: {
    port: PREVIEW_PORT,
    strictPort: false,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'vendor-three';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (id.includes('node_modules/qrcode')) {
            return 'vendor-qrcode';
          }
          if (id.includes('/src/data/genres/house')) return 'genre-house';
          if (id.includes('/src/data/genres/techno')) return 'genre-techno';
          if (id.includes('/src/data/genres/trance')) return 'genre-trance';
          if (id.includes('/src/data/genres/dubstep')) return 'genre-dubstep';
          if (id.includes('/src/data/genres/dnb')) return 'genre-dnb';
          if (id.includes('/src/data/genres/uk_bass')) return 'genre-ukbass';
          if (id.includes('/src/data/genres/trap_drill')) return 'genre-trap';
          if (id.includes('/src/data/genres/future_downtempo')) return 'genre-future';
          if (id.includes('/src/data/genres/hard_electro')) return 'genre-hard';
          if (id.includes('/src/data/genres/rock_metal')) return 'genre-rock';
          if (id.includes('/src/data/genres/hiphop')) return 'genre-hiphop';
          if (id.includes('/src/data/genres/jazz_blues')) return 'genre-jazz';
          if (id.includes('/src/data/genres/pop_rnb')) return 'genre-pop';
          if (id.includes('/src/data/genres/latin_world')) return 'genre-latin';
        },
      },
    },
  },
});
