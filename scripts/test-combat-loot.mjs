import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const originalWindow = globalThis.window;
const originalStorage = globalThis.localStorage;
const saved = new Map();
globalThis.window = { setTimeout: () => 0 };
globalThis.localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
  removeItem: key => saved.delete(key),
};
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  setActivePinia(createPinia());
  const { useRunStore } = await server.ssrLoadModule('/src/stores/run.ts');
  const { useDataStore } = await server.ssrLoadModule('/src/stores/data.ts');
  const engine = await server.ssrLoadModule('/src/systems/grid-combat.ts');
  const run = useRunStore();
  const data = useDataStore();
  data.data = {
    items: new Map([['test-loot', { id: 'test-loot', name: '시험 물품', rank: 'common', category: 'material', effects: [] }]]),
    timelines: new Map(), nodeMaps: new Map(), races: new Map(), cards: new Map(), chaos: new Map(),
  };
  const stage = {
    id: 'loot-test', width: 5, height: 5, cells: Array.from({ length: 5 }, () => Array(5).fill('floor')),
    playerStart: { x: 1, y: 1 }, enemyStarts: [{ x: 4, y: 4 }], foresight: 3, objects: [],
    itemDrops: [{ pos: { x: 1, y: 2 }, gold: 7 }, { pos: { x: 1, y: 3 }, itemId: 'test-loot' }],
  };
  const enemy = { id: 'test-enemy', name: '시험 마물', tier: 'normal', hp: 100, defense: 0, attack: 0, tempo: 1000, intents: [] };
  function start() {
    run.$reset();
    run.active = true;
    run.data.currentNodeId = 'test-loot-node';
    run.data.hp = 100;
    run.data.maxHp = 100;
    run.data.remainingTime = 300;
    run.bindRng();
    run.data.gridCombat = engine.startGridCombat(run.data, stage, [enemy]);
    return run.data.gridCombat;
  }
  function collect(state) {
    assert.equal(engine.queuePlayerAction(state, { kind: 'move', to: { x: 1, y: 2 } }), true);
    assert.equal(engine.queuePlayerAction(state, { kind: 'move', to: { x: 1, y: 3 } }), true);
    engine.commitRound(state);
    assert.equal(state.pendingLoot.length, 2);
    assert.equal(run.data.gold, 0, 'field gold stays provisional until a successful exit');
    assert.equal(run.data.items.length, 0, 'field items stay provisional until a successful exit');
    assert.equal(stage.itemDrops.length, 2, 'shared stage definitions remain unchanged');
  }

  let combat = start();
  collect(combat);
  run.saveActiveRun();
  assert.equal(run.loadActiveRun(), true);
  assert.equal(run.data.gridCombat, undefined, 'reload abandons the unfinished encounter');
  assert.equal(run.data.gold, 0, 'reload cannot bank provisional gold');
  assert.equal(run.data.items.length, 0, 'reload cannot bank provisional items');

  combat = engine.startGridCombat(run.data, stage, [enemy]);
  run.data.gridCombat = combat;
  collect(combat);
  combat.resolution = 'recovered';
  combat.outcome = 'win';
  run.endGridCombat('win');
  assert.equal(run.data.gold, 7);
  assert.equal(run.data.items.length, 1);
  assert.equal(run.data.items[0].id, 'test-loot');
  run.endGridCombat('win');
  assert.equal(run.data.gold, 7, 'duplicate finish cannot grant field loot again');
  assert.equal(run.data.items.length, 1);

  combat = start();
  collect(combat);
  combat.resolution = 'cleared';
  combat.outcome = 'win';
  run.endGridCombat('win');
  assert.equal(run.data.gold, 7, 'full victory also banks field loot');
  assert.equal(run.data.items.length, 1);

  combat = start();
  collect(combat);
  combat.player.hp = 0;
  combat.outcome = 'lose';
  run.endGridCombat('lose');
  assert.equal(run.data.gold, 0, 'defeat discards provisional loot');
  assert.equal(run.data.items.length, 0);
  assert.equal(run.data.gridCombat, undefined);

  combat = start();
  collect(combat);
  run.data.nodeStates['test-loot-node'] = { combatCleared: true };
  combat.outcome = 'win';
  run.endGridCombat('win');
  assert.equal(run.data.gold, 0, 'an already settled node cannot pay field rewards again');

  console.log('PASS combat loot: movement pickup, isolated stage, reload discard, recovery/clear transfer, duplicate finish, defeat, settled-node guard');
} finally {
  await server.close();
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage;
}
