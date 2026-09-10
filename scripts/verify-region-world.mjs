import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  setActivePinia(createPinia());
  const { useDataStore } = await server.ssrLoadModule('/src/stores/data.ts');
  const { seedWorld, REGION_ENTITIES: ids } = await server.ssrLoadModule('/src/systems/world/seed.ts');
  const engine = await server.ssrLoadModule('/src/systems/world/engine.ts');
  const social = await server.ssrLoadModule('/src/systems/world/social.ts');
  const resources = await server.ssrLoadModule('/src/systems/world/resources.ts');
  const facade = await server.ssrLoadModule('/src/systems/world-interaction.ts');
  const region = await server.ssrLoadModule('/src/systems/region-world.ts');
  const items = new Map(['i-crop-grain', 'i-crop-grain-fine', 'i-life-char'].map(id => [id, { id, name: id, effects: [], rank: 'common', category: 'material' }]));
  const nodes = [
    { id: 'n-iluneon-square', kind: 'village', neighbors: ['n-iluneon-market', 'n-ilu-larder', 'n-ilu-diner-back'] },
    { id: 'n-iluneon-market', kind: 'village', neighbors: ['n-iluneon-square'] },
    { id: 'n-ilu-larder', kind: 'gather', region: 'iluneon', neighbors: ['n-iluneon-square'] },
    { id: 'n-ilu-diner-back', kind: 'combat', neighbors: ['n-iluneon-square'] },
  ].map(n => ({ label: n.id, ...n }));
  useDataStore().data = { items, timelines: new Map([['test', { id: 'test', nodeMapId: 'test-map' }]]),
    nodeMaps: new Map([['test-map', { id: 'test-map', nodes }]]), races: new Map(), cards: new Map(), chaos: new Map() };

  function fixture(turn = 0, nodeId = 'n-iluneon-square') {
    return { timelineId: 'test', raceId: 'human', profession: 'traveler', currentDay: 1, currentNodeId: nodeId,
      visitedNodes: Array(turn).fill(nodeId), nodeStates: {}, activeSlots: [], items: [], gold: 0, ended: false,
      colors: { fire: 0, water: 0, electric: 0, iron: 0, earth: 0, wind: 0, light: 0, dark: 0 },
      lifeLevel: 1, lifeXp: 0, hp: 36, maxHp: 36, mp: 12, maxMp: 12, remainingTime: 300 };
  }
  function advance(run, turns) {
    for (let i = 0; i < turns; i++) {
      run.visitedNodes.push(run.currentNodeId);
      region.tickRegionWorld(run);
    }
  }
  const transfer = (from, resourceId, quantity = 1) => ({ id: 'arbitrary-transfer', label: '옮기기', description: '', duration: 1,
    effects: [{ kind: 'transfer', resourceId, quantity, from, to: from === 'actor' ? 'target' : 'actor' }] });
  function localWorld() {
    const world = seedWorld(fixture());
    world.entities.player.nodeId = 'n-iluneon-market';
    engine.observeWorld(world, 'player');
    return world;
  }

  // Authored individuality changes outlook; species does not assign moral alignment.
  const human = social.createSocialProfile('human', 'artisan', { homeNodeId: 'a' });
  const mouse = social.createSocialProfile('sminthus', 'artisan', { homeNodeId: 'a' });
  assert.deepEqual(human.norms, mouse.norms);
  assert.notDeepEqual(human.norms, social.createSocialProfile('human', 'traveler', { homeNodeId: 'a' }).norms);
  assert.equal(social.effectiveNorms({ ...human, normScopes: { individual: { laborRespect: 0 }, guild: { laborRespect: 0 } } }).laborRespect, 0);

  for (const id of ['i-crop-grain', 'i-life-mush-fine', 'i-life-game', 'i-life-dried-fine', 'i-life-fish-fine']) assert.equal(resources.isFoodResource(id), true);
  for (const id of ['i-life-char', 'i-life-char-fine', 'i-life-ore', 'i-life-charge', 'i-tool-food-looking', 'unknown']) assert.equal(resources.isFoodResource(id), false);
  function takePrivate(resourceId, fromActor = false) {
    const sample = localWorld();
    const target = sample.entities[fromActor ? 'actor-ilu-artisan' : ids.storage];
    target.nodeId = 'n-iluneon-market';
    target.ownerId = 'actor-ilu-artisan';
    target.labor = 50;
    target.tags = fromActor ? ['person'] : ['storage', 'food']; // A mixed private container is not its contents.
    target.stock[resourceId] = 1;
    const result = engine.resolveInteraction(sample, 'player', target.id, transfer('target', resourceId));
    social.processSocialFacts(sample);
    return { trust: sample.entities['actor-ilu-artisan'].agent.relations.player.trust, fact: result.facts[0] };
  }
  const charcoalTaking = takePrivate('i-life-char');
  const grainTaking = takePrivate('i-crop-grain', true);
  assert.equal(charcoalTaking.fact.resourceTags.includes('food'), false);
  assert.equal(grainTaking.fact.resourceTags.includes('food'), true);
  assert.ok(Math.abs(grainTaking.trust) < Math.abs(charcoalTaking.trust) / 5,
    'food carried by an actor is treated much more mildly than charcoal in a food-labelled cabinet');

  function authoredCultureJudgment(culture) {
    const sample = localWorld();
    const witness = sample.entities['actor-ilu-artisan'];
    witness.agent.normScopes.culture = culture;
    engine.resolveInteraction(sample, 'player', witness.id, transfer('target', 'i-crop-grain'));
    social.processSocialFacts(sample);
    const foodTrust = witness.agent.relations.player.trust;
    engine.resolveInteraction(sample, 'player', ids.workshop, {
      id: 'culture-test-force', label: '힘', description: '', duration: 1,
      effects: [{ kind: 'influence', property: 'force', amount: 12 }],
    });
    social.processSocialFacts(sample);
    return { foodTrust, harmDelta: witness.agent.relations.player.trust - foodTrust };
  }
  const sharingCulture = authoredCultureJudgment({ foodSharing: 1, harmAversion: 0 });
  const protectiveCulture = authoredCultureJudgment({ foodSharing: 0, harmAversion: 1 });
  assert.ok(sharingCulture.foodTrust > protectiveCulture.foodTrust,
    'the same species and profession can interpret food taking differently under authored cultural norms');
  assert.ok(sharingCulture.harmDelta > protectiveCulture.harmDelta,
    'optional culture can also change the same witnessed damage judgment');
  assert.equal(human.normScopes.culture, undefined, 'seeds do not invent species-wide cultural norms');

  let world = localWorld();
  const artisan = world.entities['actor-ilu-artisan'];
  const courier = world.entities['actor-ilu-courier'];
  const stolen = engine.resolveInteraction(world, 'player', ids.workshop, transfer('target', 'i-life-char'));
  assert.equal(stolen.ok, true);
  social.processSocialFacts(world);
  const directTrust = artisan.agent.relations.player.trust;
  assert.ok(directTrust < -.02, 'witness recognizes another person\'s processed labor');
  assert.equal(courier.agent.relations.player, undefined, 'remote actor cannot know who took anything');
  social.processSocialFacts(world);
  assert.equal(artisan.agent.relations.player.trust, directTrust, 'same witness fact is interpreted once');

  artisan.nodeId = courier.nodeId;
  engine.observeWorld(world, artisan.id);
  const tell = { id: 'arbitrary-report', label: '전하기', description: '', duration: 1,
    effects: [{ kind: 'signal', sourceFactId: stolen.facts[0].id, message: '본 일을 전한다.' }] };
  engine.resolveInteraction(world, artisan.id, courier.id, tell);
  social.processSocialFacts(world);
  const heardTrust = courier.agent.relations.player.trust;
  const belief = courier.agent.beliefs.find(b => b.factId === stolen.facts[0].id);
  assert.equal(belief.confidence, .55);
  assert.ok(heardTrust < 0 && Math.abs(heardTrust) < Math.abs(directTrust), 'hearsay retains weaker confidence');
  engine.resolveInteraction(world, artisan.id, courier.id, tell);
  social.processSocialFacts(world);
  assert.equal(courier.agent.relations.player.trust, heardTrust, 'repeating a rumor cannot repeat punishment');

  world = localWorld();
  world.entities[ids.workshop].properties.smoke = 3;
  engine.resolveInteraction(world, 'player', ids.workshop, transfer('target', 'i-life-char'));
  social.processSocialFacts(world);
  assert.equal(world.entities['actor-ilu-artisan'].agent.relations.player, undefined);
  world.entities[ids.workshop].properties.smoke = 0;
  engine.observeWorld(world, 'actor-ilu-artisan');
  social.processSocialFacts(world);
  assert.equal(world.entities['actor-ilu-artisan'].agent.relations.player, undefined, 'discovering missing goods later does not identify a culprit');
  const ambient = engine.recordFact(world, { turn: world.turn, nodeId: 'n-iluneon-market', targetId: ids.workshop,
    ownerId: 'actor-ilu-artisan', kind: 'property', property: 'integrity', before: 100, after: 97, labor: 30, message: '손상된 것을 발견했다.' });
  social.processSocialFacts(world);
  assert.ok(world.entities['actor-ilu-artisan'].agent.beliefs.some(b => b.factId === ambient.id && !b.subjectId));

  world = seedWorld(fixture());
  world.entities[ids.storage].stock['i-crop-grain'] = 1;
  engine.resolveInteraction(world, 'player', ids.storage, transfer('target', 'i-crop-grain'));
  social.processSocialFacts(world);
  assert.equal(world.entities['actor-ilu-courier'].agent.relations.player.trust, 0, 'shared food taking is not a universal crime');
  world.entities.player.stock['i-crop-grain'] = 2;
  engine.resolveInteraction(world, 'player', ids.storage, transfer('actor', 'i-crop-grain'));
  social.processSocialFacts(world);
  const sharedTrust = world.entities['actor-ilu-courier'].agent.relations.player.trust;
  for (let i = 0; i < 6; i++) {
    engine.resolveInteraction(world, 'player', ids.storage, transfer('target', 'i-crop-grain'));
    social.processSocialFacts(world);
    engine.resolveInteraction(world, 'player', ids.storage, transfer('actor', 'i-crop-grain'));
    social.processSocialFacts(world);
  }
  assert.equal(world.entities['actor-ilu-courier'].agent.relations.player.trust, sharedTrust, 'circulating the same gift creates no new trust');

  // Utility is expected benefit; only an actual meal satisfies hunger. Invalid highest scores are excluded.
  world = seedWorld(fixture());
  const agent = world.entities['actor-ilu-grower'];
  agent.agent.needs.food = 1;
  engine.observeWorld(world, agent.id);
  const candidates = social.rankSocialActions(world, agent.id, (_actor, target) => target === agent.id ? [
    { id: 'impossible', label: '실패', description: '', duration: 1, effects: [{ kind: 'stock', resourceId: 'absent', amount: -1, side: 'actor' }], utility: { food: 100 } },
    { id: 'meal', label: '식사', description: '', duration: 1, effects: [{ kind: 'stock', resourceId: 'i-crop-grain', amount: -1, side: 'actor' }], utility: { food: 1 }, satisfies: { food: .7 } },
  ] : []);
  assert.equal(candidates[0].action.id, 'meal');
  engine.resolveInteraction(world, agent.id, agent.id, { id: 'walk', label: '걷기', description: '', duration: 1,
    effects: [{ kind: 'move', nodeId: agent.nodeId }], utility: { food: 1 } });
  assert.equal(agent.agent.needs.food, 1, 'walking toward food is not eating');
  engine.resolveInteraction(world, agent.id, agent.id, candidates[0].action);
  assert.ok(Math.abs(agent.agent.needs.food - .3) < 1e-9);

  const obscuredRun = fixture();
  facade.ensureInteractionWorld(obscuredRun);
  const obscuredStorage = obscuredRun.interactionWorld.entities[ids.storage];
  const hiddenStock = obscuredStorage.stock['i-crop-grain'];
  obscuredStorage.properties.smoke = 3;
  const blindRequest = facade.performWorldInteraction(obscuredRun,
    { actorId: 'player', targetId: ids.storage, actionId: 'take:i-crop-grain' });
  assert.equal(blindRequest.ok, false, 'a cached action cannot operate on a currently unobserved target');
  assert.equal(obscuredStorage.stock['i-crop-grain'], hiddenStock);

  const rememberedRun = fixture();
  facade.ensureInteractionWorld(rememberedRun);
  const rememberedWorld = rememberedRun.interactionWorld;
  const remoteUtility = facade.availableWorldActions(rememberedRun, rememberedWorld, 'actor-ilu-artisan', ids.irrigation)[0].utility;
  rememberedWorld.entities[ids.irrigation].properties.integrity = 0;
  rememberedWorld.entities[ids.irrigation].tags = [];
  rememberedWorld.entities[ids.irrigation].workRecipe = undefined;
  const rememberedTravel = facade.availableWorldActions(rememberedRun, rememberedWorld, 'actor-ilu-artisan', ids.irrigation)[0];
  assert.deepEqual(rememberedTravel.utility, remoteUtility, 'remote choices use remembered traits, not hidden changed traits');
  assert.equal(engine.interactionDisabled(rememberedWorld, 'actor-ilu-artisan', ids.irrigation, rememberedTravel), undefined);
  assert.equal(engine.resolveInteraction(rememberedWorld, 'actor-ilu-artisan', ids.irrigation, rememberedTravel).ok, true,
    'unseen destruction cannot prevent travel toward the remembered site');
  assert.equal(rememberedWorld.entities['actor-ilu-artisan'].nodeId, 'n-iluneon-square', 'travel still moves only one authored edge');

  const changed = fixture();
  facade.ensureInteractionWorld(changed);
  const readyWorld = changed.interactionWorld;
  const readyChoice = social.rankSocialActions(readyWorld, 'actor-ilu-artisan',
    (actor, target) => facade.availableWorldActions(changed, readyWorld, actor, target))[0];
  const emptyWorld = JSON.parse(JSON.stringify(readyWorld));
  emptyWorld.entities[ids.workshop].stock['raw-fiber'] = 0;
  engine.observeWorld(emptyWorld, 'actor-ilu-artisan');
  const emptyChoice = social.rankSocialActions(emptyWorld, 'actor-ilu-artisan',
    (actor, target) => facade.availableWorldActions(changed, emptyWorld, actor, target))[0];
  assert.notDeepEqual([readyChoice.targetId, readyChoice.action.effects], [emptyChoice.targetId, emptyChoice.action.effects],
    'removing a recipe input changes the decision instead of replaying a scripted job');
  const hungryWorld = JSON.parse(JSON.stringify(readyWorld));
  hungryWorld.entities['actor-ilu-artisan'].agent.needs.food = 1;
  const hungryChoice = social.rankSocialActions(hungryWorld, 'actor-ilu-artisan',
    (actor, target) => facade.availableWorldActions(changed, hungryWorld, actor, target))[0];
  assert.ok(hungryChoice.action.satisfies?.food > 0, 'actual hunger can outweigh profession work');

  const burningWorld = localWorld();
  const lit = engine.resolveInteraction(burningWorld, 'player', ids.workshop,
    { id: 'arbitrary-heat', label: '열', description: '', duration: 1, effects: [{ kind: 'influence', property: 'heat', amount: 4 }] });
  social.processSocialFacts(burningWorld);
  assert.ok(lit.facts.some(f => f.property === 'burning'));
  assert.ok(burningWorld.entities['actor-ilu-artisan'].agent.relations.player.trust < 0, 'witnessed ignition is attributed before later ambient damage');

  const run = fixture(120, 'n-ilu-larder');
  region.ensureRegionWorld(run);
  assert.equal(run.interactionWorld.turn, 120, 'old runs begin now without retroactive simulation');
  assert.equal(run.gold, 0);
  const untouched = JSON.stringify(run);
  region.tickRegionWorld(run);
  assert.equal(JSON.stringify(run), untouched, 'same clock cannot repeat simulation');
  const work = { id: 'unrelated-name', label: '노동', description: '', duration: 1, effects: [{ kind: 'work', amount: 25 }] };
  for (let i = 0; i < 4; i++) engine.resolveInteraction(run.interactionWorld, 'player', ids.irrigation, work);
  assert.equal(region.irrigationActive(run, 'n-ilu-larder'), true);
  run.interactionWorld.entities[ids.irrigation].properties.integrity = 0;
  assert.equal(region.irrigationActive(run, 'n-ilu-larder'), false, 'destroyed infrastructure loses its real benefit');
  assert.equal(region.irrigationActive(run, 'n-another-farm'), false);
  const previousStock = run.interactionWorld.entities[ids.storage].stock['i-crop-grain'];
  region.reportRegionEncounter(run, 'n-ilu-diner-back', 'recovered');
  assert.equal(run.items.filter(i => i.id === 'i-crop-grain').length, 3);
  assert.equal(run.interactionWorld.entities[ids.storage].stock['i-crop-grain'], previousStock, 'recoveries are carried, not remotely donated');
  region.reportRegionEncounter(run, 'n-ilu-diner-back', 'recovered');
  assert.equal(run.items.length, 3);
  const reloaded = JSON.parse(JSON.stringify(run));
  region.reportRegionEncounter(reloaded, 'n-ilu-diner-back', 'win');
  assert.equal(reloaded.regionWorld.victories, 0, 'one resolved encounter cannot grant both recover and clear rewards');

  const daily = fixture();
  region.ensureRegionWorld(daily);
  const dailyNode = 'n-ilu-diner-back';
  const dailyStore = daily.interactionWorld.entities[ids.storage];
  const stockStart = dailyStore.stock['i-crop-grain'];
  region.reportRegionEncounter(daily, dailyNode, 'recovered');
  daily.nodeStates[dailyNode] = { combatCleared: true, tradeCleared: true };
  region.reportRegionDelivery(daily, dailyNode, 2, ['i-crop-grain', 'i-life-char']);
  assert.equal(daily.items.filter(i => i.id === 'i-crop-grain').length, 3);
  assert.equal(dailyStore.stock['i-crop-grain'], stockStart + 1);
  const charAfterFirst = dailyStore.stock['i-life-char'];
  region.reportRegionDelivery(daily, dailyNode, 2, ['i-crop-grain', 'i-life-char']);
  assert.equal(dailyStore.stock['i-life-char'], charAfterFirst, 'same-day delivery callbacks are idempotent');

  // advanceDay reopens ordinary encounters/contracts but retains elite clearance.
  daily.currentDay++;
  daily.nodeStates[dailyNode].combatCleared = false;
  daily.nodeStates[dailyNode].tradeCleared = false;
  region.reportRegionEncounter(daily, dailyNode, 'recovered');
  region.reportRegionEncounter(daily, dailyNode, 'recovered');
  daily.nodeStates[dailyNode].combatCleared = true;
  daily.nodeStates[dailyNode].tradeCleared = true;
  region.reportRegionDelivery(daily, dailyNode, 2, ['i-crop-grain', 'i-life-char']);
  region.reportRegionDelivery(daily, dailyNode, 2, ['i-crop-grain', 'i-life-char']);
  assert.equal(daily.items.filter(i => i.id === 'i-crop-grain').length, 6, 'a reopened encounter grants one new carried recovery per day');
  assert.equal(dailyStore.stock['i-crop-grain'], stockStart + 2, 'a reopened contract contributes its real goods once per day');
  assert.equal(dailyStore.stock['i-life-char'], charAfterFirst + 1);
  daily.nodeStates['n-ilu-test-elite'] = { combatCleared: true, tradeCleared: true };
  region.reportRegionEncounter(daily, 'n-ilu-test-elite', 'recovered');
  assert.equal(daily.items.length, 6, 'permanent elite clearance continues to prevent another recovery');

  const sim = fixture();
  region.ensureRegionWorld(sim);
  advance(sim, 15);
  const clone = JSON.parse(JSON.stringify(sim));
  advance(sim, 45);
  advance(clone, 45);
  assert.deepEqual(JSON.parse(JSON.stringify(clone)), JSON.parse(JSON.stringify(sim)), 'NPC choices and consequences remain deterministic through reload');
  assert.equal(sim.gold, 0, 'there is no periodic NPC gold dividend');
  const npcFacts = sim.interactionWorld.events.filter(f => f.actorId && f.actorId !== 'player');
  assert.ok(npcFacts.some(f => f.kind === 'work'));
  assert.ok(npcFacts.some(f => f.kind === 'move'));
  assert.ok(npcFacts.some(f => f.kind === 'transfer' || f.kind === 'production'));
  assert.equal(Object.keys(sim.interactionWorld.entities).some(id => ['npc-echo','npc-hako','npc-phoenix'].includes(id)), false);
  console.log('PASS region-world: profiles, witnessed norms, rumor provenance, gift-loop safety, utility feasibility, real facilities, carried recovery, 60-turn deterministic simulation');
  console.log('NPC fact kinds:', [...new Set(npcFacts.map(f => f.kind))].join(', '));
} finally {
  await server.close();
}
