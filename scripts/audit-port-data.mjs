import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = resolve(root, 'public');
const oldFetch = globalThis.fetch;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { loadFromText, loadAllData } = await server.ssrLoadModule('/src/data/loader.ts');
  const all = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? all(join(dir,e.name)) : e.name.endsWith('.txt') ? [join(dir,e.name)] : []);
  const source = loadFromText(all(join(publicDir,'data')).map(f => readFileSync(f,'utf8')).join('\n'));
  globalThis.fetch = async url => {
    const path = resolve(publicDir, String(url).replace(/^\//, ''));
    if (!path.startsWith(publicDir + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))) throw new Error('Unexpected data path');
    return new Response(readFileSync(path, 'utf8'));
  };
  const runtime = await loadAllData('/');
  const counts = data => Object.fromEntries(Object.entries(data).filter(([,v]) => v instanceof Map).map(([key,value]) => [key,value.size]));
  const attacks = [...runtime.monsters.values()].flatMap(m => m.gridBehavior ?? []);
  console.log(JSON.stringify({
    runtime: counts(runtime), allSourceFilesIncludingDemos: counts(source),
    fieldAttackDefinitions: attacks.length,
    authoredStatusTokens: [...new Set(attacks.map(a => a.applyStatus).filter(Boolean))].sort(),
    note: 'Data presence is not field support. See docs/porting-checklist.md for implementation status.'
  },null,2));
} finally { await server.close(); globalThis.fetch = oldFetch; }
