import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
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
