import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * dev 전용 맵 에디터 저장 엔드포인트.
 * MapView 편집 모드(Ctrl+드래그/클릭)에서 POST /__map-save 로 노드 위치·간선을 보내면
 * public/data/node-maps/act-1-map.txt 의 x/y/neighbors 라인만 교체해 저장한다.
 * apply:'serve' → 프로덕션 빌드에는 포함되지 않음.
 */
function mapEditorSavePlugin(): Plugin {
  const NODE_RE = /\.node\.([a-z0-9-]+)\]\s*$/;
  return {
    name: 'map-editor-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__map-save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body) as {
              file?: string;
              nodes: Record<string, { x: number; y: number; neighbors: string[] }>;
            };
            const rel = payload.file ?? 'public/data/node-maps/act-1-map.txt';
            const file = path.resolve(__dirname, rel);
            const eol = '\n';
            const text = fs.readFileSync(file, 'utf-8');
            let cur: string | null = null;
            const out = text.split(/\r?\n/).map((line) => {
              const t = line.trim();
              if (t.startsWith('[')) { const m = NODE_RE.exec(t); cur = m ? m[1] : null; return line; }
              const nd = cur ? payload.nodes[cur] : undefined;
              if (nd) {
                if (/^x\s*=/.test(t)) return `x = ${nd.x}`;
                if (/^y\s*=/.test(t)) return `y = ${nd.y}`;
                if (/^neighbors\s*=/.test(t)) return `neighbors = ${nd.neighbors.join(', ')}`;
              }
              return line;
            }).join(eol);
            fs.writeFileSync(file, out, 'utf-8');
            // 수동 저장 잠금 — 이 파일이 있으면 자동 레이아웃 스크립트(hex_layout.py)가 돌지 않는다.
            try {
              const lock = path.resolve(__dirname, '_workspace/.map-manual-lock');
              fs.writeFileSync(lock, new Date().toISOString() + '\n' + rel + '\n', 'utf-8');
            } catch { /* 잠금 파일 실패는 저장 자체를 막지 않음 */ }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, count: Object.keys(payload.nodes).length }));
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
        });
      });
    },
  };
}

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
  plugins: [vue(), mapEditorSavePlugin()],
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
