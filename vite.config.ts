import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/emergent-rpg-web/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
