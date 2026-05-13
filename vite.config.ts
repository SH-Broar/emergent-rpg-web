import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * 빌드 시 git commit count를 v.NNN으로 주입.
 * 실패 시 'dev'로 폴백 (로컬 dev / git 없는 환경 대응).
 */
function getCommitCount(): string {
  try {
    const out = execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return out || 'dev';
  } catch {
    return 'dev';
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/emergent-rpg-web/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(getCommitCount()),
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
