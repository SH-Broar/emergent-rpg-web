import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
const saved = new Map();
globalThis.window = { setTimeout: () => 0 };
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  setActivePinia(createPinia());
  const engine = await server.ssrLoadModule('/src/systems/world/engine.ts');
  const facade = await server.ssrLoadModule('/src/systems/world-interaction.ts');
  const tactical = await server.ssrLoadModule('/src/systems/tactical-environment.ts');
  const colors = await server.ssrLoadModule('/src/systems/colors.ts');
  const items = await server.ssrLoadModule('/src/systems/item.ts');
  const { useRunStore } = await server.ssrLoadModule('/src/stores/run.ts');
  const { useDataStore } = await server.ssrLoadModule('/src/stores/data.ts');
  const { loadFromText } = await server.ssrLoadModule('/src/data/loader.ts');
  const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.txt') ? [join(dir, e.name)] : []);
  const data = useDataStore();
  data.data = loadFromText(files(join(root, 'public/data')).map(f => readFileSync(f, 'utf8')).join('\n'));
  const run = useRunStore();
  const passed = [];
  const actor = id => ({ id, name: id, kind: 'actor', nodeId: 'place', colors: {}, tags: ['person'], properties: { integrity: 100 }, stock: { water: 2 }, ownerId: id });
  const target = () => ({ id: 'object', name: '작업물', kind: 'facility', nodeId: 'place', colors: { earth: 20 }, tags: ['flammable'], properties: { integrity: 100, flammability: 3 }, stock: {} });
  const fixture = () => ({ version: 1, turn: 0, sequence: 0, entities: { player: actor('player'), npc: actor('npc'), object: target() }, events: [], knowledge: {}, receipts: [] });
  const action = (effects, duration = 1) => ({ id: 'new-action-never-mentioned-in-engine', label: '새 도구 사용', description: '공통 영향', effects, duration });
  let world = fixture();
  let result = engine.resolveInteraction(world, 'player', 'object', action([
    { kind: 'stock', side: 'actor', resourceId: 'water', amount: -1 },
    { kind: 'influence', property: 'moisture', amount: 3 },
  ]));
  assert.equal(result.ok, true); assert.equal(world.entities.object.properties.moisture, 3);
  assert.equal(world.entities.player.stock.water, 1);
  engine.resolveInteraction(world, 'npc', 'object', action([{ kind: 'influence', property: 'heat', amount: 3 }]));
  assert.equal(world.entities.object.properties.burning ?? 0, 0);
  assert.equal(world.entities.object.properties.smoke, 2);
  passed.push('an unregistered action composes stock and material effects; water and heat react by properties');

  world = fixture();
  const before = JSON.stringify(world);
  result = engine.resolveInteraction(world, 'player', 'object', action([
    { kind: 'stock', side: 'actor', resourceId: 'water', amount: -1 },
    { kind: 'influence', property: 'heat', amount: 10 },
    { kind: 'stock', side: 'actor', resourceId: 'missing', amount: -1 },
  ]));
  assert.equal(result.ok, false); assert.equal(JSON.stringify(world), before);
  assert.equal(engine.resolveInteraction(world, 'player', 'object', action([{ kind: 'influence', property: 'heat', amount: NaN }])).ok, false);
  assert.equal(engine.resolveInteraction(world, 'player', 'object', action([{ kind: 'transfer', resourceId: 'water', quantity: -2, from: 'actor', to: 'target' }])).ok, false);
  passed.push('the complete transaction is validated before any resource, event or property is changed');

  const playerWorld = fixture(), npcWorld = fixture();
  const same = action([{ kind: 'influence', property: 'force', amount: 12 }]);
  engine.resolveInteraction(playerWorld, 'player', 'object', same);
  engine.resolveInteraction(npcWorld, 'npc', 'object', same);
  assert.deepEqual(playerWorld.entities.object, npcWorld.entities.object);
  assert.equal(playerWorld.events[0].actorId, 'player'); assert.equal(npcWorld.events[0].actorId, 'npc');
  const iron = { integrity: 100 }, soft = { integrity: 100 };
  engine.applyMaterialInfluence(iron, { iron: 80 }, 'force', 12);
  engine.applyMaterialInfluence(soft, { iron: 0 }, 'force', 12);
  assert.ok(iron.integrity > soft.integrity);
  assert.equal(playerWorld.entities.object.colors.earth, 20);
  passed.push('player and NPC use the same reducer; colors classify resistance without being spent');

  world = fixture();
  Object.assign(world.entities.object, { stock: { fiber: 1 }, workRecipe: { required: 20, inputs: { fiber: 1 }, outputs: { cloth: 2 }, repeat: true } });
  engine.resolveInteraction(world, 'player', 'object', action([{ kind: 'work', amount: 10 }]));
  assert.equal(world.entities.object.stock.cloth, undefined);
  engine.resolveInteraction(world, 'npc', 'object', action([{ kind: 'work', amount: 10 }]));
  assert.equal(world.entities.object.stock.fiber, 0); assert.equal(world.entities.object.stock.cloth, 2);
  const completed = JSON.stringify(world);
  assert.equal(engine.resolveInteraction(world, 'npc', 'object', action([{ kind: 'work', amount: 20 }])).ok, false);
  assert.equal(JSON.stringify(world), completed);
  passed.push('shared work accumulates across actors and transforms actual inputs exactly once');

  world = fixture();
  world.entities.remote = { ...actor('remote'), nodeId: 'elsewhere' };
  engine.observeWorld(world, 'remote');
  engine.resolveInteraction(world, 'player', 'object', same);
  assert.equal(world.knowledge.remote.facts.length, 0);
  assert.equal(world.knowledge.remote.targets.object, undefined);
  assert.ok(world.knowledge.npc.facts.length > 0);
  world.entities.object.properties.smoke = 3;
  const knownCount = world.knowledge.npc.facts.length;
  engine.resolveInteraction(world, 'player', 'object', same);
  assert.equal(world.knowledge.npc.facts.length, knownCount);
  assert.equal(world.events.at(-1).witnesses.includes('npc'), false);
  passed.push('local witnesses learn facts; distance and obscuring material prevent magical attribution');

  world = fixture();
  world.entities.object.properties.lifeMigrated = 1;
  world.entities.npc.properties.practice = 99;
  engine.observeWorld(world, 'player');
  assert.equal(world.knowledge.player.targets.object.properties.lifeMigrated, undefined);
  assert.equal(world.knowledge.player.targets.npc.properties.practice, undefined);
  passed.push('observation DTOs exclude migration flags and another actor’s private progression');

  const stage = { width: 3, height: 3, cells: Array.from({ length: 3 }, () => Array(3).fill('floor')) };
  const battle = { stage, environment: {} };
  const properties = { flammability: 1 };
  engine.applyMaterialInfluence(properties, {}, 'heat', 3);
  tactical.paintEnvironment(battle, [{ x: 1, y: 1 }], 'fire', 3);
  engine.applyMaterialInfluence(properties, {}, 'moisture', 3);
  tactical.paintEnvironment(battle, [{ x: 1, y: 1 }], 'wet', 3);
  const cell = tactical.environmentAt(battle, { x: 1, y: 1 });
  assert.equal(cell.fire ?? 0, properties.burning ?? 0); assert.equal(cell.smoke, properties.smoke);
  assert.equal(cell.wet ?? 0, properties.moisture ?? 0);
  passed.push('combat geometry adapts to the exact material reactions used by world objects');

  const timeline = [...data.timelines.values()].find(t => data.nodeMaps.get(t.nodeMapId)?.nodes.some(n => n.id === 'n-iluneon-square'));
  assert.ok(timeline);
  const reset = (nodeId = 'n-iluneon-square') => {
    run.$reset(); run.active = true;
    Object.assign(run.data, { timelineId: timeline.id, raceId: 'human', currentNodeId: nodeId, hp: 36, maxHp: 36, mp: 12, maxMp: 12, remainingTime: 100 });
    const w = facade.ensureInteractionWorld(run.data);
    for (const a of Object.values(w.entities)) if (a.agent && a.id !== 'player') a.agent.nextActionTurn = 10000;
    return w;
  };
  world = reset();
  const clock = run.data.visitedNodes.length;
  const sourceBefore = world.entities['ilu-shared-storage'].stock['i-crop-grain'];
  result = run.performWorldAction({ actorId: 'player', targetId: 'ilu-shared-storage', actionId: 'take:i-crop-grain' });
  assert.equal(result.ok, true); assert.equal(run.data.visitedNodes.length, clock + 1);
  assert.equal(run.data.items.filter(i => i.id === 'i-crop-grain').length, 1);
  assert.ok(run.data.items.find(i => i.id === 'i-crop-grain').instanceId);
  assert.equal(world.entities['ilu-shared-storage'].stock['i-crop-grain'], sourceBefore - 1);
  assert.equal(run.data.nodeStates['n-iluneon-square'], undefined, 'in-place work does not replay node entry');
  assert.equal(run.data.postmanStepCount ?? 0, 0, 'travel relic is not a free-work source');
  const snapshot = JSON.stringify(run.data);
  result = run.performWorldAction({ actorId: 'player', targetId: 'ilu-shared-storage', actionId: 'water' });
  assert.equal(result.ok, false); assert.equal(JSON.stringify(run.data), snapshot);
  assert.equal(run.performWorldAction({ actorId: 'npc', targetId: 'ilu-shared-storage', actionId: 'take:i-crop-grain' }).ok, false);
  passed.push('actual store action transfers inventory and spends one world turn; a failed action spends nothing');

  const observationSnapshot = JSON.stringify(run.data);
  for (let i = 0; i < 5; i++) {
    facade.observedTargets(run.data); facade.affordances(run.data, 'player', 'ilu-shared-storage');
  }
  assert.equal(JSON.stringify(run.data), observationSnapshot);
  const persisted = JSON.stringify(run.data.interactionWorld);
  run.saveActiveRun();
  run.data.interactionWorld = undefined;
  assert.equal(run.loadActiveRun(), true);
  assert.equal(JSON.stringify(run.data.interactionWorld), persisted);
  passed.push('queries do not tick simulation; stock, ownership, knowledge and receipts survive actual save/load');

  world = reset(); world.entities['ilu-shared-storage'].stock['i-potion-small'] = 2;
  for (let i = 0; i < 2; i++) assert.equal(run.performWorldAction({ actorId: 'player', targetId: 'ilu-shared-storage', actionId: 'take:i-potion-small' }).ok, true);
  const potions = run.data.items.filter(item => item.id === 'i-potion-small');
  assert.equal(new Set(potions.map(item => item.instanceId)).size, 2);
  run.data.hp = 10;
  assert.ok(items.useItem(potions[0]));
  assert.equal(run.data.items.filter(item => item.id === 'i-potion-small').length, 1);
  facade.ensureInteractionWorld(run.data); facade.tickInteractionWorld(run.data);
  assert.equal(run.data.items.filter(item => item.id === 'i-potion-small').length, 1);
  assert.equal(run.data.items.find(item => item.id === 'i-potion-small').instanceId, potions[1].instanceId);
  passed.push('transferred consumables retain unique item identities and cannot be restored by inventory sync');

  world = reset('n-iluneon-market');
  const travelerPower = facade.availableWorldActions(run.data, world, 'player', 'ilu-workshop').find(a => a.id === 'work').effects[0].amount;
  run.setProfession('artisan');
  const artisanPower = facade.availableWorldActions(run.data, world, 'player', 'ilu-workshop').find(a => a.id === 'work').effects[0].amount;
  assert.ok(artisanPower > travelerPower);
  run.data.raceId = 'arcana'; facade.ensureInteractionWorld(run.data);
  assert.equal(world.entities.player.properties.laborPower, data.races.get('arcana').baseStats.vigor + data.races.get('arcana').baseStats.attack / 4);
  passed.push('profession changes learned work, and diverse species reuse authored bodily stats');

  reset();
  const colorCalls = [];
  colors.setColorGainHook((color, amount) => colorCalls.push({ color, amount }));
  result = run.executeWorldAction('player', action([{ kind: 'influence', property: 'color:earth', amount: 2, side: 'actor' }]));
  assert.equal(result.ok, true); assert.deepEqual(colorCalls, [{ color: 'earth', amount: 2 }]);
  facade.ensureInteractionWorld(run.data); facade.tickInteractionWorld(run.data);
  assert.equal(colorCalls.length, 1, 'sync and reads do not replay color rewards');
  colors.setColorGainHook(() => {});
  passed.push('shared color growth fires existing relic and UI gain hooks exactly once');

  reset(); run.data.remainingTime = 1;
  result = run.performWorldAction({ actorId: 'player', targetId: 'player', actionId: 'rest' });
  assert.equal(result.ok, true); assert.equal(run.data.ended, true); assert.equal(run.data.endReason, 'time-up');
  passed.push('the final in-place action expires the run through the normal end condition');
  console.log(JSON.stringify({ pass: passed.length, scenarios: passed }, null, 2));
} finally {
  globalThis.window = oldWindow; globalThis.localStorage = oldStorage; await server.close();
}
