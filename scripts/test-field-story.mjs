import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url)), saved = new Map();
const prior = { window: globalThis.window, storage: globalThis.localStorage, fetch: globalThis.fetch };
globalThis.window = { setTimeout: () => 0 };
globalThis.localStorage = { getItem: k => saved.get(k) ?? null, setItem: (k,v) => saved.set(k,v), removeItem: k => saved.delete(k) };
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  setActivePinia(createPinia());
  const mod = p => server.ssrLoadModule('/src/' + p);
  const { useRunStore } = await mod('stores/run.ts'), { useDataStore } = await mod('stores/data.ts');
  const { loadAllData } = await mod('data/loader.ts');
  globalThis.fetch = async url => new Response(readFileSync(join(root, 'public', String(url).replace(/^\//, '')), 'utf8'));
  const data = useDataStore(); data.data = await loadAllData('/');
  const timeline = [...data.timelines.values()].find(t => data.nodeMaps.get(t.nodeMapId)?.nodes.some(n => n.id === 'n-iluneon-square'));
  const field = await mod('systems/field-simulation.ts'), generation = await mod('systems/field-generation.ts');
  const engine = await mod('systems/world/engine.ts'), journey = await mod('systems/field-journey.ts');
  const readings = await mod('systems/field-readings.ts'), combat = await mod('systems/field-combat.ts');
  const { JOURNEY_QUESTS } = await mod('data/journey-quests.ts'), { FIELD_RECORDS } = await mod('data/field-records.ts');
  const { createSocialProfile } = await mod('systems/world/social.ts');
  const run = useRunStore(), results = [];
  function start() {
    run.startRun({ timelineId: timeline.id, raceId: 'human', season: 'spring', startNodeId: 'n-iluneon-square', maxHp: 100, maxMp: 3, timeLimit: 300 });
    const a = field.ensureField(run.data);
    a.world.entities = { player: a.player }; run.data.relics = [];
    a.space.width = 9; a.space.height = 9; a.space.tiles = Array.from({ length: 9 }, () => Array(9).fill('grass')); a.space.exits = [];
    a.player.pos = { x: 4, y: 4 };
    return a;
  }
  function npc(a) {
    const source = data.npcs.get('npc-niayur');
    const actor = { id: 'npc:' + source.id, npcId: source.id, name: source.name, kind: 'actor', nodeId: a.space.id, pos: { x: 4, y: 3 }, tags: ['person'], colors: {}, properties: { integrity: 100 }, stock: {}, agent: createSocialProfile(source.raceId, source.role, { homeNodeId: source.homeNodeId, turn: 0 }) };
    a.world.entities[actor.id] = actor;
    return actor;
  }
  const record = { id: 'fixture-wet-record', nodeId: 'n-iluneon-square', name: '겹친 기록', lines: ['물에 젖은 글 아래에서 다른 문장이 드러난다.'], hint: '물을 묻히면 읽을 수 있을 것 같다.', min: { moisture: 3 } };
  FIELD_RECORDS.push(record);
  let a = start();
  delete a.space.recordsVersion; readings.ensureFieldRecords(a.world, a.space, generation.placeFieldEntity);
  const object = a.world.entities['record:' + record.id]; assert(object);
  object.pos = { x: 4, y: 3 };
  assert(field.performFieldGesture('tap', object.id, object.pos).ok);
  assert(!run.data.field.journey.readings[record.id], 'an obscured reading is not evidence');
  a.player.stock.water = 1;
  assert(field.performFieldGesture('tend', object.id, object.pos).ok);
  assert.equal(a.player.stock.water, 0);
  const read = field.performFieldGesture('tap', object.id, object.pos);
  assert(read.ok && read.speech.lines.includes(record.lines[0]));
  assert(run.data.field.journey.readings[record.id]);
  run.saveActiveRun(); run.$reset(); assert(run.loadActiveRun());
  assert.deepEqual(run.data.field.journey.readings[record.id].lines, record.lines);
  const world = run.data.interactionWorld, stored = world.entities[object.id];
  stored.properties.integrity = 0; delete world.spaces[stored.nodeId].recordsVersion;
  readings.ensureFieldRecords(world, world.spaces[stored.nodeId], generation.placeFieldEntity);
  assert.equal(world.entities[object.id].properties.integrity, 0, 'destroyed evidence is not recreated');
  results.push('Water exposes a real readable object; successful nearby reading persists; destroyed records are not recreated');

  a = start(); delete a.space.recordsVersion;
  readings.ensureFieldRecords(a.world, a.space, generation.placeFieldEntity);
  const distant = a.world.entities['record:' + record.id]; distant.pos = { x: 1, y: 1 }; distant.properties.moisture = 3;
  const time = run.data.field.elapsedSeconds;
  assert(!field.performFieldGesture('tap', distant.id, distant.pos).ok);
  assert.equal(run.data.field.elapsedSeconds, time); assert(!run.data.field.journey.readings[record.id]);
  results.push('Out-of-range interaction cannot grant evidence or spend a turn');

  const choiceQuest = { id: 'fixture-choice', npcId: 'npc-niayur', title: '판단', offer: ['확인하고 이야기하자.'], reminder: '기록을 확인한다.', finish: '그렇게 기록해 두자.', goals: [{ kind: 'read', key: record.id, label: '기록 읽기' }, { kind: 'deliver', key: 'raw-fiber', amount: 1, label: '섬유' }], choices: [{ id: 'keep', label: '그대로 남긴다', reply: '두 기록 모두 남기자.' }, { id: 'change', label: '고쳐 적는다', reply: '고친 이유도 함께 적자.' }], reward: { xp: 2 } };
  JOURNEY_QUESTS.push(choiceQuest);
  a = start(); const guide = npc(a);
  assert(journey.performQuest(run.data, a.world, guide.id, 'quest:accept:fixture-choice').ok);
  assert(!journey.performQuest(run.data, a.world, guide.id, 'quest:choose:fixture-choice:keep').ok);
  journey.ensureJourney(run.data).readings[record.id] = { at: 0, lines: record.lines }; a.player.stock['raw-fiber'] = 1;
  const xp = run.data.xp;
  assert(!journey.performQuest(run.data, a.world, guide.id, 'quest:finish:fixture-choice').ok, 'a decision cannot be skipped');
  assert(journey.questTopics(run.data, guide).some(t => t.action === 'quest:choose:fixture-choice:keep'));
  const decided = journey.performQuest(run.data, a.world, guide.id, 'quest:choose:fixture-choice:keep');
  assert(decided.ok); assert(decided.speech.lines.includes(choiceQuest.choices[0].reply));
  assert.equal(a.player.stock['raw-fiber'], 0); assert.equal(guide.stock['raw-fiber'], 1);
  assert.equal(run.data.field.journey.decisions['fixture-choice'], 'keep');
  const claimedXp = run.data.xp;
  assert(!journey.performQuest(run.data, a.world, guide.id, 'quest:choose:fixture-choice:change').ok);
  assert.equal(run.data.xp, claimedXp); assert(claimedXp >= xp);
  run.saveActiveRun(); run.$reset(); assert(run.loadActiveRun()); assert.equal(run.data.field.journey.decisions['fixture-choice'], 'keep');
  results.push('Evidence precedes decisions; actual delivery and reward happen once; the chosen response and save survive');

  const finalQuest = { id: 'fixture-final', npcId: 'npc-niayur', title: '마지막', offer: ['닻으로 가자.'], reminder: '닻을 넘는다.', finish: '멎었던 소리가 돌아왔다.', goals: [{ kind: 'boss', key: 'bs-act-1-anchor', label: '시간의 정령' }], completeOnBoss: 'bs-act-1-anchor', encounter: { bossId: 'bs-act-1-anchor', lines: ['검증용 조우 대사'] }, reward: {} };
  JOURNEY_QUESTS.push(finalQuest);
  a = start(); const finalGuide = npc(a);
  assert.equal(journey.goalProgress(run.data, finalQuest.goals[0]), 0);
  journey.noteJourney(run.data, 'bs-act-1-anchor', 1);
  journey.ensureJourney(run.data).visited['n-anchor-point'] = true;
  assert.equal(journey.goalProgress(run.data, finalQuest.goals[0]), 0, 'entering or an arbitrary count is not victory');
  assert(journey.performQuest(run.data, a.world, finalGuide.id, 'quest:accept:fixture-final').ok);
  const boss = generation.spawnCreature(run.data, a.world, a.space, data.bosses.get('bs-act-1-anchor'), 910, 'boss');
  assert(combat.beginBossEncounter(run.data, boss, true));
  assert.deepEqual(run.data.field.encounter.lines, finalQuest.encounter.lines);
  combat.resolveFieldEncounter(run.data, true);
  assert(!run.data.field.journey.completed['fixture-final']);
  engine.influenceEntity(a.world, boss, 'integrity', -100, 'player');
  field.advanceFieldTime(30, false);
  assert(run.data.ended); assert.equal(run.data.endReason, 'boss-cleared');
  assert(run.data.field.journey.completed['fixture-final'], 'final quest closes before ending and save');
  const completed = run.data.field.journey.completed['fixture-final'];
  journey.completeBossQuests(run.data, a.world, 'bs-act-1-anchor');
  assert.equal(run.data.field.journey.completed['fixture-final'], completed);
  assert.equal(run.data.bossesCleared.filter(id => id === 'bs-act-1-anchor').length, 1);
  results.push('Authored pre-boss dialogue and actual final victory close the accepted quest before run end, without duplicate credit');
  console.log(JSON.stringify({ status: 'PASS', scenarios: results.length, results }, null, 2));
} finally {
  await server.close();
  globalThis.window = prior.window; globalThis.localStorage = prior.storage; globalThis.fetch = prior.fetch;
}
