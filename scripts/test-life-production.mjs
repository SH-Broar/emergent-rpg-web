import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

// Only toast scheduling is stubbed; the router, stocks, materials and run clock execute unchanged.
const previousWindow = globalThis.window;
globalThis.window = { setTimeout: () => 0 };
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  setActivePinia(createPinia());
  const { useRunStore } = await server.ssrLoadModule('/src/stores/run.ts');
  const { useDataStore } = await server.ssrLoadModule('/src/stores/data.ts');
  const farming = await server.ssrLoadModule('/src/systems/farming.ts');
  const life = await server.ssrLoadModule('/src/systems/life-activity.ts');
  const adapter = await server.ssrLoadModule('/src/systems/world/life-world.ts');
  const { resolveInteraction, tickMaterials } = await server.ssrLoadModule('/src/systems/world/engine.ts');
  const { ensureInteractionWorld } = await server.ssrLoadModule('/src/systems/world-interaction.ts');
  const run = useRunStore(), data = useDataStore();
  const itemIds = [...new Set([
    ...farming.CROPS.flatMap(c => [c.lowerItemId, c.upperItemId]),
    ...life.LIFE_ACTIVITIES.flatMap(a => [a.lowerItemId, a.upperItemId]).filter(Boolean),
    'i-material-common',
  ])];
  const definitions = () => new Map(itemIds.map(id => [id, { id, name: id, rank: 'common', category: 'material', effects: [] }]));
  data.data = {
    items: definitions(), timelines: new Map([['test', { nodeMapId: 'test-map' }]]),
    nodeMaps: new Map([['test-map', { nodes: [
      { id: 'field', label: 'Field', kind: 'gather', region: 'tradepost', neighbors: ['away'] },
      { id: 'away', label: 'Away', kind: 'rest', region: 'tradepost', neighbors: ['field'] },
    ], regions: [{ id: 'tradepost', tier: 1 }] }]]),
  };
  const passed = [];
  const fixture = (level = 1) => {
    run.$reset();
    const state = JSON.parse(JSON.stringify(run.data));
    state.colors = { fire: 0, water: 0, electric: 0, iron: 0, earth: 0, wind: 0, light: 0, dark: 0 };
    state.lifeLevel = level;
    state.currentNodeId = 'field';
    state.plots = {}; state.lifeCooldowns = {}; state.visitedNodes = [];
    const actor = id => ({
      id, name: id, kind: 'actor', nodeId: 'field', tags: [], colors: { ...state.colors },
      properties: { integrity: 100, lifeLevel: level, practice: 0 }, stock: { water: 10, 'i-life-char': 5 },
    });
    const world = { version: 1, turn: 0, sequence: 0, entities: { player: actor('player'), npc: actor('npc') }, events: [], knowledge: {}, receipts: [] };
    state.interactionWorld = world;
    const target = adapter.ensureLifeSite(state, world, 'field', 'tradepost');
    return { state, world, target };
  };
  const settle = f => adapter.settleLifeWorld(f.state, f.world, f.world.turn);
  const advance = (f, turns) => {
    for (let i = 0; i < turns; i++) {
      f.world.turn++; f.state.visitedNodes.push('away');
      tickMaterials(f.world); settle(f);
    }
  };
  const action = (f, id, actor = 'player') => adapter.lifeActions(f.state, f.world, actor, f.target.id).find(a => a.id === id);
  const execute = (f, a, actor = 'player') => {
    assert.ok(a, 'action should be offered');
    const result = resolveInteraction(f.world, actor, f.target.id, a);
    assert.equal(result.ok, true, result.reason);
    settle(f);
    return result;
  };
  const plant = (f, mode = 'standard', bonus = -1000, crop = 'crop-grain') =>
    execute(f, adapter.plantLifeAction(f.world, 'player', f.target.id, crop, bonus, mode));
  const stockTotal = target => Object.values(target.stock).reduce((sum, n) => sum + n, 0);

  let f = fixture();
  plant(f);
  assert.equal(f.target.ownerId, 'player');
  assert.ok(f.target.tags.includes('food'));
  execute(f, action(f, 'care', 'npc'), 'npc');
  assert.equal(f.world.entities.npc.stock.water, 9);
  assert.equal(f.target.production.plot.wateredCount, 1, 'NPC water changes the exact player batch');
  f.world.entities.player.nodeId = 'away';
  f.world.entities.player.properties.lifeLevel = 5;
  advance(f, 30);
  assert.equal(stockTotal(f.target), 3, 'producer level is frozen at planting; returning expert does not reroll or increase this batch');
  assert.equal(f.state.items.length, 0, 'maturity creates onsite stock, not player rewards');
  const matureFacts = f.world.events.filter(e => e.kind === 'production' && e.quantity === 3 && e.targetId === f.target.id);
  assert.equal(matureFacts.length, 1);
  assert.equal(matureFacts[0].actorId, undefined, 'natural completion cannot imply an absent producer performed an action');
  execute(f, action(f, 'harvest-one', 'npc'), 'npc');
  assert.equal(f.world.entities.npc.stock['i-crop-grain'], 1);
  assert.equal(stockTotal(f.target), 2);
  assert.ok(f.target.production, 'partial harvest preserves remaining batch');
  assert.equal(f.world.entities.npc.properties.practice, 0, 'splitting a harvest cannot multiply completion practice');
  f.world.entities.player.nodeId = 'field';
  const harvest = action(f, 'harvest');
  execute(f, harvest);
  assert.equal(f.world.entities.player.stock['i-crop-grain'], 2);
  assert.equal(f.world.entities.player.properties.practice, 1);
  const inventory = JSON.stringify(f.world.entities.player);
  assert.equal(resolveInteraction(f.world, 'player', f.target.id, harvest).ok, false);
  assert.equal(JSON.stringify(f.world.entities.player), inventory);
  f.world = JSON.parse(JSON.stringify(f.world)); f.state.interactionWorld = f.world;
  adapter.ensureLifeEntities(f.state, f.world); settle(f);
  assert.equal(f.world.entities[f.target.id].production, undefined);
  assert.equal(f.world.entities[f.target.id].stock['i-crop-grain'], 0);
  passed.push('shared NPC care, unattended stock, producer snapshot, partial harvest, reload and duplicate guard');

  f = fixture();
  const enhanced = adapter.plantLifeAction(f.world, 'player', f.target.id, 'crop-grain', 0, 'standard', 'i-material-common');
  const before = JSON.stringify(f.world);
  assert.equal(resolveInteraction(f.world, 'player', f.target.id, enhanced).ok, false);
  assert.equal(JSON.stringify(f.world), before, 'failed material input is atomic');
  f.world.entities.player.stock['i-material-common'] = 1;
  execute(f, enhanced);
  assert.equal(f.world.entities.player.stock['i-material-common'], 0);
  assert.equal(f.target.production.plot.bonus, 50);
  assert.equal(resolveInteraction(f.world, 'player', f.target.id, enhanced).ok, false);
  f.world.entities.player.stock.water = 0;
  const dryBefore = JSON.stringify(f.target);
  assert.equal(resolveInteraction(f.world, 'player', f.target.id, action(f, 'care')).ok, false);
  assert.equal(JSON.stringify(f.target), dryBefore);
  execute(f, { id: 'water', label: 'Water', description: '', duration: 1, effects: [
    { kind: 'stock', side: 'actor', resourceId: 'water', amount: -1 },
    { kind: 'influence', property: 'moisture', amount: 3 },
  ] }, 'npc');
  assert.equal(f.target.production.plot.wateredCount, 1, 'generic material action and production care share a reducer');
  passed.push('atomic enhancement and care costs, generic water affects production');

  f = fixture();
  plant(f);
  execute(f, { id: 'force', label: 'Break', description: '', duration: 1, effects: [{ kind: 'influence', property: 'force', amount: 1000 }] });
  assert.equal(f.target.properties.integrity, 0);
  assert.equal(f.target.production, undefined);
  advance(f, 50);
  adapter.ensureLifeEntities(f.state, f.world);
  assert.equal(stockTotal(f.target), 0);
  assert.equal(adapter.lifeActions(f.state, f.world, 'player', f.target.id).length, 0);
  f.world = JSON.parse(JSON.stringify(f.world)); f.state.interactionWorld = f.world;
  adapter.ensureLifeEntities(f.state, f.world); settle(f);
  assert.equal(f.world.entities[f.target.id].properties.integrity, 0);
  assert.equal(f.state.plots.field, undefined);
  passed.push('destruction stops the actual production and survives reload without resurrection');

  f = fixture();
  delete f.world.entities[f.target.id];
  f.world.turn = 12;
  f.state.plots.field = { cropId: 'crop-grain', plantedTurn: 0, lastTickTurn: 10, growTurns: 3, waterAt: [1], wateredCount: 0, growthProgress: 1, bonus: -1000 };
  f.target = adapter.ensureLifeSite(f.state, f.world, 'field', 'tradepost');
  settle(f);
  assert.equal(f.target.production.plot.growthVersion, 2);
  assert.equal(stockTotal(f.target), 2, 'old blocked-time save recovers elapsed growth');
  const oldBatch = JSON.stringify(f.target);
  adapter.ensureLifeEntities(f.state, f.world); settle(f);
  assert.equal(JSON.stringify(f.target), oldBatch);
  execute(f, action(f, 'harvest'));
  adapter.ensureLifeEntities(f.state, f.world); settle(f);
  assert.equal(f.target.production, undefined);
  passed.push('legacy gated save migrates once and cannot replay its yield');


  f = fixture();
  delete f.world.entities[f.target.id];
  f.world.turn = 20;
  f.state.plots.field = { cropId: 'crop-char', plantedTurn: 0, lastTickTurn: 18, growTurns: 4, waterAt: [1], wateredCount: 0, growthProgress: 1, bonus: -1000 };
  f.target = adapter.ensureLifeSite(f.state, f.world, 'field', 'tradepost');
  settle(f);
  assert.equal(f.target.tags.includes('food'), false, 'a legacy charcoal batch keeps its actual classification in a farming region');
  assert.equal(f.target.stock['i-life-char'], 2);
  execute(f, action(f, 'harvest'));
  passed.push('legacy batch food classification follows the actual product, not region defaults');

  f = fixture(3);
  plant(f, 'abundant');
  assert.equal(f.target.production.duration, 15);
  f.world.entities.player.properties.lifeLevel = 1;
  f.world.entities.player.nodeId = 'away';
  advance(f, 12);
  assert.equal(f.target.production.settled, false);
  advance(f, 3);
  assert.equal(f.target.production.plot.wateredCount, 2);
  assert.equal(stockTotal(f.target), 5, 'learned abundance and automatic care remain the producer snapshot');
  assert.ok(f.world.events.filter(e => e.message.includes('보존 관리')).every(e => e.actorId === undefined));
  const ordinary = fixture(1);
  plant(ordinary, 'abundant');
  assert.equal(ordinary.target.production.duration, 12);
  assert.equal(ordinary.target.production.plot.productionMode, 'standard');
  advance(ordinary, 12);
  assert.equal(stockTotal(ordinary.target), 2);
  passed.push('specialization unlock, extra output and automatic upkeep have real effects while away');

  f = fixture();
  f.world.entities.player.nodeId = 'n-ilu-larder';
  f.target = adapter.ensureLifeSite(f.state, f.world, 'n-ilu-larder', 'iluneon');
  f.world.entities['ilu-irrigation'] = { id: 'ilu-irrigation', name: 'Waterworks', kind: 'facility', nodeId: 'n-ilu-larder', tags: [], colors: {}, stock: {}, properties: { integrity: 100, irrigation: 1 } };
  plant(f);
  advance(f, 12);
  assert.equal(f.target.production.plot.wateredCount, 2);
  assert.equal(stockTotal(f.target), 3);
  passed.push('shared irrigation properties improve production in their region');

  f = fixture();
  delete f.world.entities[f.target.id];
  f.state.lifeCooldowns.field = 10;
  f.target = adapter.ensureLifeSite(f.state, f.world, 'field', 'martin');
  assert.equal(stockTotal(f.target), 0);
  advance(f, 9);
  assert.equal(adapter.gatherLifeAction(f.world, 'player', f.target.id), undefined);
  advance(f, 1);
  assert.equal(stockTotal(f.target), 2);
  const gather = adapter.gatherLifeAction(f.world, 'npc', f.target.id, -1000);
  execute(f, gather, 'npc');
  assert.equal(f.world.entities.npc.stock['i-life-fish'], 2);
  assert.equal(adapter.gatherLifeAction(f.world, 'player', f.target.id), undefined);
  const fishBefore = JSON.stringify(f.world.entities.npc.stock);
  assert.equal(resolveInteraction(f.world, 'npc', f.target.id, gather).ok, false);
  assert.equal(JSON.stringify(f.world.entities.npc.stock), fishBefore);
  advance(f, 8);
  assert.equal(stockTotal(f.target), 2, 'one renewable reducer restocks a shared source once');
  passed.push('shared extraction stock, legacy cooldown, material conversion and duplicate guard');


  f = fixture();
  delete f.world.entities[f.target.id];
  f.target = adapter.ensureLifeSite(f.state, f.world, 'field', 'moss-south');
  plant(f, 'standard', -1000, 'crop-char');
  assert.equal(f.target.tags.includes('food'), false);
  execute(f, action(f, 'care'));
  advance(f, 1);
  assert.equal(f.target.production.plot.wateredCount, 1, 'charcoal heat care survives ordinary heat decay');
  assert.equal(f.world.entities.player.stock['i-life-char'], 4);
  assert.equal(f.target.properties.integrity, 100, 'kiln material tolerance supports its heat process');
  passed.push('charcoal has material heat care and is not classified as food');

  // Exercise the actual UI facade and store clock; pure cases above cover contested NPC use.
  run.$reset();
  run.data.remainingTime = 300; run.data.hp = run.data.maxHp = 30;
  run.data.currentNodeId = 'field'; run.data.timelineId = 'test';
  const world = ensureInteractionWorld(run.data);
  for (const entity of Object.values(world.entities)) if (entity.agent) entity.agent.nextActionTurn = 9999;
  assert.equal(farming.plant('field', 'crop-grain', -1000), true);
  assert.equal(run.data.ended, false);
  const viewBefore = JSON.stringify(run.data.plots);
  for (let i = 0; i < 10; i++) farming.plotStatus('field');
  assert.equal(JSON.stringify(run.data.plots), viewBefore, 'previews do not mutate world state');
  run.visitNode('away');
  for (let i = 0; i < 10; i++) run.spendWorldTime(1);
  assert.equal(farming.isReady('field'), true);
  assert.equal(run.data.items.length, 0);
  assert.equal(farming.harvest('field'), null, 'remote harvest is rejected by the same location rule');
  run.visitNode('field');
  const timeBefore = run.data.remainingTime;
  const result = farming.harvest('field');
  assert.equal(result.itemIds.length, 2);
  assert.equal(run.data.items.filter(i => i.id === 'i-crop-grain').length, 2);
  assert.equal(run.data.lifeXp, 1);
  assert.equal(run.data.remainingTime, timeBefore);
  const rewardsBefore = JSON.stringify({ items: run.data.items, xp: run.data.lifeXp, colors: run.data.colors, time: run.data.remainingTime });
  assert.equal(farming.harvest('field'), null);
  assert.equal(JSON.stringify({ items: run.data.items, xp: run.data.lifeXp, colors: run.data.colors, time: run.data.remainingTime }), rewardsBefore);
  passed.push('real facade and store: local action rules, exactly one clock tick, actual inventory/XP sync');


  for (let cycle = 0; cycle < 2; cycle++) {
    assert.equal(farming.plant('field', 'crop-grain', -1000), true);
    run.spendWorldTime(11);
    assert.ok(farming.harvest('field'));
  }
  assert.equal(run.data.lifeLevel, 2, 'three completed ordinary production cycles teach automatic upkeep');
  assert.equal(farming.plant('field', 'crop-grain', -1000), true);
  run.spendWorldTime(11);
  assert.equal(farming.getPlot('field').wateredCount, 2);
  assert.equal(farming.plotMinimumYield('field'), 3, 'earned upkeep changes the next real batch');
  data.data.items.delete('i-crop-grain');
  const preservedBatch = JSON.stringify(world.entities['life:field']);
  assert.equal(farming.harvest('field'), null);
  assert.equal(JSON.stringify(world.entities['life:field']), preservedBatch, 'missing item data preserves the actual batch');
  data.data.items = definitions();
  assert.equal(farming.harvest('field').itemIds.length, 3);
  passed.push('earned player mastery improves subsequent production and missing output data is recoverable');

  console.log('PASS life production: ' + passed.length + ' integration scenarios');
  for (const description of passed) console.log('  ✓ ' + description);
} finally {
  await server.close();
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}
