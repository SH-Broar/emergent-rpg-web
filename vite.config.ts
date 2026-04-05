import { defineConfig } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';

const commitCount = (() => {
  try { return execSync('git rev-list --count HEAD').toString().trim(); }
  catch { return '0'; }
})();

export default defineConfig({
  base: '/emergent-rpg-web/',
  define: {
    __APP_VERSION__: JSON.stringify(`v1.${commitCount}`),
  },
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
