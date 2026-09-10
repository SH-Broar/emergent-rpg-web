import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const previousWindow = globalThis.window;
globalThis.window = { setTimeout: () => 0 };
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  setActivePinia(createPinia());
  const { useRunStore } = await server.ssrLoadModule('/src/stores/run.ts');
  const { useDataStore } = await server.ssrLoadModule('/src/stores/data.ts');
  const engine = await server.ssrLoadModule('/src/systems/grid-combat.ts');
  const env = await server.ssrLoadModule('/src/systems/tactical-environment.ts');
  const enhance = await server.ssrLoadModule('/src/systems/enhance.ts');
  const rewards = await server.ssrLoadModule('/src/systems/tactical-cards.ts');
  const { loadFromText } = await server.ssrLoadModule('/src/data/loader.ts');
  const { getRng, setRng, createSeededRng } = await server.ssrLoadModule('/src/systems/rng.ts');
  const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.txt') ? [join(dir, e.name)] : []);
  const data = useDataStore();
  data.data = loadFromText(files(join(root, 'public/data')).map(f => readFileSync(f, 'utf8')).join('\n'));
  const run = useRunStore();
  const enemy = { id: 'test-monster', name: '검증 마물', hp: 100, attack: 0, defense: 0, tempo: 100, tier: 'normal', intents: [] };
  const stage = { id: 'test-field', width: 5, height: 5, cells: Array.from({ length: 5 }, () => Array(5).fill('floor')), playerStart: { x: 1, y: 2 }, enemyStarts: [{ x: 2, y: 2 }], foresight: 3, spawns: [], objects: [] };
  const reset = (cards = [], customStage = stage, customEnemy = enemy) => {
    run.$reset(); run.data.hp = 100; run.data.maxHp = 100; run.data.deckSize = 10;
    run.data.deck = cards.map((c, i) => ({ ...c, instanceId: `${c.id}#test${i}` }));
    run.data.collection = [...run.data.deck];
    setRng(createSeededRng(41926).next);
    return engine.startGridCombat(run.data, customStage, [customEnemy]);
  };
  const play = (s, id, aimOffset) => {
    const card = s.hand.find(c => c.id === id);
    assert.ok(card, `missing card ${id}`);
    assert.equal(engine.queuePlayerAction(s, { kind: 'card', cardInstanceId: card.instanceId, targetTiles: [], aimOffset }), true);
  };
  const card = id => { const c = data.cards.get(id); assert.ok(c, `loaded ${id}`); return c; };
  const passed = [];

  let s = reset();
  assert.equal(engine.queuePlayerAction(s, { kind: 'basic-attack' }), true);
  assert.equal(engine.queuePlayerAction(s, { kind: 'basic-guard' }), true);
  assert.equal(engine.queuePlayerAction(s, { kind: 'basic-attack' }), true);
  assert.equal(engine.queuePlayerAction(s, { kind: 'basic-attack' }), false);
  engine.commitRound(s);
  assert.equal(s.enemies[0].hp, 90); assert.equal(s.player.block, 3);
  assert.equal(engine.remainingActions(s), 3);
  assert.equal(engine.queuePlayerAction(s, { kind: 'move', to: { x: 1, y: 3 } }), true);
  assert.equal(engine.queuePlayerAction(s, { kind: 'move', to: { x: 2, y: 3 } }), true);
  engine.commitRound(s); assert.deepEqual(s.player.pos, { x: 2, y: 3 });
  passed.push('hand-independent basics, three-action cap, repeated moves and round reset');

  const instant = { ...card('c-quickdraw'), instanceId: 'instant' };
  s = reset([instant, instant, instant, instant]);
  for (let i = 0; i < 4; i++) engine.playInstantCard(s, `c-quickdraw#test${i}`);
  assert.equal(s.actionsUsed, 3); assert.equal(s.enemies[0].tempoCounter, 3);
  assert.equal(s.hand.some(c => c.instanceId === 'c-quickdraw#test3'), true);
  engine.commitRound(s); assert.equal(engine.remainingActions(s), 3);
  s = reset([{ ...instant, cost: 1 }, { ...card('c-tactic-spark'), cost: 3 }]);
  play(s, 'c-tactic-spark', { dx: 1, dy: 0 });
  engine.playInstantCard(s, 'c-quickdraw#test0');
  assert.equal(s.mana, 3); assert.equal(s.actionsUsed, 0);
  passed.push('instant cards spend actions and enemy time; reserved mana cannot be stolen');

  for (const level of [0, 1, 5, 10, 30]) {
    const strike = { ...card('c-tactic-spark'), enhanceLevel: level, awakened: level > 5 };
    s = reset([strike]); const before = s.enemies[0].hp;
    play(s, strike.id, { dx: 1, dy: 0 }); engine.commitRound(s);
    assert.equal(before - s.enemies[0].hp, enhance.scaledValue(7, strike));
  }
  assert.ok(enhance.scaledValue(11, { ...card('c-human-balance'), id: 'balance-plus', enhanceLevel: 5, awakened: true }) >= enhance.scaledValue(9, { ...card('c-human-balance'), enhanceLevel: 5 }));
  assert.equal(engine.enhancedEffectValue({ ...instant, enhanceLevel: 5 }, 'draw', 1), 1);
  passed.push('enhancement equals execution, awakening retains growth, draw counts stay bounded');

  s = reset([card('c-tactic-water'), card('c-tactic-spark')]);
  play(s, 'c-tactic-water', { dx: 1, dy: 0 }); play(s, 'c-tactic-spark', { dx: 1, dy: 0 });
  engine.commitRound(s); assert.equal(s.enemies[0].hp, 89);
  assert.equal(engine.environmentAt(s, { x: 2, y: 2 }).wet, undefined);
  env.paintEnvironment(s, [{ x: 2, y: 2 }], 'fire');
  env.paintEnvironment(s, [{ x: 2, y: 2 }], 'wet');
  assert.equal(engine.environmentAt(s, { x: 2, y: 2 }).fire, undefined);
  assert.equal(engine.environmentAt(s, { x: 2, y: 2 }).smoke, 2);
  passed.push('water plus electricity, extinguishing fire and steam smoke');

  s = reset([card('c-tactic-shove')]);
  env.paintEnvironment(s, [{ x: 3, y: 2 }], 'fire');
  play(s, 'c-tactic-shove'); engine.commitRound(s);
  assert.deepEqual(s.enemies[0].pos, { x: 3, y: 2 }); assert.equal(s.enemies[0].hp, 92);
  const wallStage = structuredClone(stage); wallStage.cells[2][3] = 'wall';
  s = reset([card('c-tactic-shove')], wallStage); play(s, 'c-tactic-shove'); engine.commitRound(s);
  assert.equal(s.enemies[0].hp, 92);
  passed.push('push into fire and blocked push collision');

  s = reset([], { ...stage, enemyStarts: [{ x: 4, y: 2 }] });
  env.paintEnvironment(s, [s.player.pos], 'smoke', 2);
  assert.equal(engine.enemyPlan(s, s.enemies[0])[0].kind, 'wait');
  s.enemies[0].pos = { x: 2, y: 2 };
  assert.equal(engine.enemyPlan(s, s.enemies[0])[0].kind, 'attack');
  s.enemies[0].pos = { x: 4, y: 2 }; s.environment = {}; s.noise = { pos: { x: 4, y: 4 }, rounds: 2 };
  const lured = engine.enemyPlan(s, s.enemies[0])[0];
  assert.equal(lured.kind, 'move'); assert.ok(lured.to.y > 2);
  passed.push('smoke hides distant targets, close attacks persist, noise changes movement');

  const recoveryStage = { ...stage, objects: [{ id: 'supplies', kind: 'supply', pos: { x: 2, y: 2 } }] };
  s = reset([], recoveryStage);
  assert.equal(engine.queuePlayerAction(s, { kind: 'extract' }), false);
  assert.equal(engine.queuePlayerAction(s, { kind: 'interact', objectId: 'supplies' }), true);
  assert.equal(engine.queuePlayerAction(s, { kind: 'interact', objectId: 'supplies' }), false);
  assert.equal(engine.queuePlayerAction(s, { kind: 'extract' }), true);
  engine.commitRound(s); assert.equal(s.resolution, 'recovered'); assert.equal(s.outcome, 'win'); assert.equal(s.enemies[0].hp, 100);
  assert.equal(recoveryStage.objects[0].used, undefined, 'source definition is never consumed');
  const snapshot = JSON.stringify(s); engine.commitRound(s); assert.equal(JSON.stringify(s), snapshot);
  passed.push('supply extraction with survivors, definition isolation, ended battle idempotence');

  s = reset([card('c-tactic-spark')]);
  play(s, 'c-tactic-spark', { dx: 0, dy: -2 });
  const before = JSON.stringify(s); const rngBefore = getRng();
  const forecast = engine.previewPlan(s);
  assert.equal(forecast.length, 1); assert.equal(forecast[0].hits, 0); assert.ok(forecast[0].warning);
  assert.equal(JSON.stringify(s), before); assert.equal(getRng(), rngBefore);
  passed.push('empty-target warning and read-only forecast');

  s = reset([card('c-tactic-smoke')], { ...stage, enemyStarts: [{ x: 4, y: 2 }] }, { ...enemy, tempo: 1 });
  play(s, 'c-tactic-smoke');
  const smokeSnapshot = JSON.stringify(s);
  const smokeForecast = engine.forecastRound(s);
  assert.ok(smokeForecast.timeline.filter(x => x.kind === 'enemy').every(x => x.intentKind === 'wait'));
  assert.equal(JSON.stringify(s), smokeSnapshot);
  engine.commitRound(s); assert.deepEqual(s.enemies[0].pos, { x: 4, y: 2 });
  s = reset([card('c-tactic-shove'), card('c-tactic-spark')]);
  play(s, 'c-tactic-shove'); play(s, 'c-tactic-spark', { dx: 2, dy: 0 });
  const pushSnapshot = JSON.stringify(s);
  assert.equal(engine.previewPlan(s)[1].hits, 1, 'follow-up targeting sees pushed position');
  assert.equal(JSON.stringify(s), pushSnapshot);
  passed.push('same-round smoke and push are projected without mutating battle state');

  s = reset([instant]); s.player.statuses.sleep = 1;
  engine.playInstantCard(s, 'c-quickdraw#test0');
  assert.equal(s.actionsUsed, 0); assert.equal(s.hand.length, 1);
  assert.equal(engine.queuePlayerAction(s, { kind: 'basic-attack' }), false);
  engine.commitRound(s); assert.equal(s.player.statuses.sleep, undefined);
  passed.push('sleep blocks instant and queued actions until round recovery');

  s = reset();
  assert.equal(engine.queuePlayerAction(s, { kind: 'move', to: { x: 1, y: 3 } }), true);
  assert.equal(engine.queuePlayerAction(s, { kind: 'move', to: { x: 2, y: 3 } }), true);
  engine.dequeuePlayerAction(s, 0);
  assert.ok(engine.previewPlan(s)[0].warning);
  engine.commitRound(s);
  assert.deepEqual(s.player.pos, { x: 1, y: 2 }, 'removing an earlier move must not enable an illegal diagonal teleport');
  passed.push('editing chained movement cannot bypass legal movement');

  const instantStrike = { ...card('c-strike'), instant: true };
  s = reset([instantStrike]); s.enemies[0].hp = 1;
  const savedPlayer = { ...s.player, hp: 73, pos: { ...s.player.pos }, statuses: { ...s.player.statuses } };
  s.swap = { controlling: true, companionId: 'test-companion', savedPlayer, savedHand: [] };
  s.player = { ...s.player, hp: 9, maxHp: 12 };
  engine.playInstantCard(s, 'c-strike#test0');
  assert.equal(s.outcome, 'win'); assert.equal(s.player.hp, 73); assert.equal(s.swap, undefined);
  passed.push('instant victory during companion control restores the real player before persistence');

  reset(); run.data.collection = Array.from({ length: 10 }, (_, i) => ({ ...card('c-strike'), instanceId: `base#${i}` }));
  run.data.deck = [...run.data.collection]; rewards.offerTacticalReward();
  const offer = JSON.stringify(run.data.tacticalDraft); rewards.offerTacticalReward(); assert.equal(JSON.stringify(run.data.tacticalDraft), offer);
  assert.equal(rewards.chooseTacticalReward(-1), false);
  const selected = run.data.tacticalDraft[0].id; assert.equal(rewards.chooseTacticalReward(0), true);
  assert.equal(run.data.deck.length, 10); assert.ok(run.data.deck.some(c => c.id === selected));
  assert.equal(run.data.collection.length, 11); assert.equal(rewards.chooseTacticalReward(0), false);
  assert.equal(rewards.starterTactics().length, 3);
  passed.push('loaded tactical pool, one-time draft, immediate deck replacement retains collection');
  console.log(JSON.stringify({ pass: passed.length, scenarios: passed }, null, 2));
} finally { globalThis.window = previousWindow; await server.close(); }
