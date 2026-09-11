import type { RunState, NodeMap } from '@/data/schemas';
import { useDataStore } from '@/stores/data';
import { iGa } from './josa';
import { isFoodResource } from './world/resources';
import { announceColorGain } from './colors';
import { seedWorld } from './world/seed';
import { createSocialProfile, processSocialFacts, tickSocialAgents } from './world/social';
import { ensureLifeEntities, settleLifeWorld, lifeActions } from './world/life-world';
import { interactionDisabled, observeWorld, resolveInteraction, tickMaterials } from './world/engine';
import { PLAYER_ACTOR_ID, type ActionOffer, type InteractionAction, type InteractionRequest, type InteractionResult, type InteractionWorld, type ObservedTarget, type WorldEntity } from './world/types';

function currentMap(run: RunState): NodeMap | undefined {
  const data = useDataStore();
  const timeline = data.timelines.get(run.timelineId);
  return timeline ? data.nodeMaps.get(timeline.nodeMapId) : undefined;
}

/** Existing inventory remains the public game inventory; the router receives its exact multiset. */
export function syncPlayerToWorld(run: RunState, world: InteractionWorld): void {
  const actor = world.entities[PLAYER_ACTOR_ID];
  if (!actor) return;
  actor.nodeId = run.currentNodeId;
  actor.colors = { ...run.colors };
  actor.properties.integrity = run.maxHp > 0 ? run.hp / run.maxHp * 100 : 100;
  actor.properties.mana = run.mp;
  if(run.field){actor.properties['status:possession']=run.possessed??0;actor.properties['status:feral-heavy']=run.feralHeavy??0;}
  actor.properties.lifeLevel = run.lifeLevel ?? 1;
  const definitions = useDataStore().items;
  const carriedIds = new Set(run.items.map(item => item.id));
  for (const key of Object.keys(actor.stock)) if (definitions.has(key) || carriedIds.has(key)) actor.stock[key] = 0;
  for (const item of run.items) actor.stock[item.id] = (actor.stock[item.id] ?? 0) + 1;
  if (actor.agent) {
    actor.agent.species = run.raceId;
    actor.agent.profession = run.profession ?? 'traveler';
  }
}

export function syncPlayerFromWorld(run: RunState, world: InteractionWorld): void {
  const actor = world.entities[PLAYER_ACTOR_ID];
  if (!actor) return;
  const data = useDataStore();
  const keep: typeof run.items = [];
  const instanceId = (id: string) => `${id}#world-${run.rngSeed}-${world.itemSequence = (world.itemSequence ?? 0) + 1}`;
  const remaining = { ...actor.stock };
  for (const item of run.items) {
    if ((remaining[item.id] ?? 0) > 0) { keep.push(item.instanceId ? item : { ...item, instanceId: instanceId(item.id) }); remaining[item.id]!--; }
  }
  for (const [id, count] of Object.entries(remaining)) {
    const definition = data.items.get(id);
    if (definition) for (let i = 0; i < count; i++) keep.push({ ...definition, instanceId: instanceId(id) });
  }
  run.items = keep;
  const gains = (Object.keys(run.colors) as (keyof typeof run.colors)[]).map(key => ({ key, value: actor.colors[key] ?? 0, delta: (actor.colors[key] ?? 0) - run.colors[key] }));
  for (const { key, value } of gains) run.colors[key] = value;
  run.hp = Math.max(0, Math.min(run.maxHp, Math.ceil((actor.properties.integrity ?? 100) / 100 * run.maxHp - 1e-8)));
  run.mp = Math.max(0, Math.min(run.maxMp, actor.properties.mana ?? run.mp));
  if(run.field){run.possessed=actor.properties['status:possession']??0;run.feralHeavy=actor.properties['status:feral-heavy']??0;}
  for (const { key, value, delta } of gains) if (delta > 0) announceColorGain(key, delta, value);
  actor.colors = { ...run.colors };
}

export function ensureInteractionWorld(run: RunState): InteractionWorld {
  if (run.field && run.interactionWorld) { syncPlayerToWorld(run, run.interactionWorld); return run.interactionWorld; }
  const world = run.interactionWorld ??= seedWorld(run);
  const map = currentMap(run);
  if (map) for (const node of map.nodes) {
    if (node.kind !== 'gather' || world.entities[`life:${node.id}`]) continue;
    world.entities[`life:${node.id}`] = { id: `life:${node.id}`, name: node.label, kind: 'plot', nodeId: node.id,
      colors: {}, tags: ['life-site', 'gather', `region:${node.region ?? ''}`], properties: { integrity: 100 }, stock: {} };
  }
  syncPlayerToWorld(run, world);
  for (const actor of Object.values(world.entities)) {
    if (!actor.agent) continue;
    const race = useDataStore().races.get(actor.agent.species);
    if (!race) continue;
    actor.properties.laborPower = race.baseStats.vigor + race.baseStats.attack / 4;
    actor.properties.hardness = race.baseStats.defense / 2;
  }
  ensureLifeEntities(run, world);
  for (const actor of Object.values(world.entities)) if (actor.kind === 'actor') observeWorld(world, actor.id);
  return world;
}

function nextStep(map: NodeMap | undefined, from: string, to: string): string | undefined {
  if (!map || from === to) return undefined;
  const queue: { node: string; first?: string }[] = [{ node: from }];
  const seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    // Only ordinary authored edges: conditional gates cannot be bypassed by an NPC action.
    const neighbors = map.nodes.find(n => n.id === current.node)?.neighbors ?? [];
    for (const id of neighbors) {
      if (seen.has(id)) continue;
      const first = current.first ?? id;
      if (id === to) return first;
      seen.add(id); queue.push({ node: id, first });
    }
  }
  return undefined;
}

function laborPower(actor: WorldEntity): number {
  const aptitude = Math.max(actor.colors.iron ?? 0, actor.colors.earth ?? 0, actor.colors.electric ?? 0) / 20;
  return Math.round(8 + (actor.properties.laborPower ?? 12) / 2 + aptitude + (actor.agent?.skills.work ?? 0) * 12 + (actor.properties.lifeLevel ?? 1) * 2);
}

/** Definitions emit primitives. The target's material/production rules supply all reactions. */
export function availableWorldActions(run: RunState, world: InteractionWorld, actorId: string, targetId: string): InteractionAction[] {
  const actor = world.entities[actorId], target = world.entities[targetId];
  if (!actor || !target) return [];
  const subject = actorId === PLAYER_ACTOR_ID ? '내가' : `${actor.name}${iGa(actor.name)}`;
  if (actor.nodeId !== target.nodeId) {
    if (actorId === PLAYER_ACTOR_ID) return []; // Map movement already has its own entry/gate flow.
    const remembered = world.knowledge[actorId]?.targets[targetId];
    const step = remembered ? nextStep(currentMap(run), actor.nodeId, remembered.nodeId) : undefined;
    return step ? [{ id: `travel:${targetId}`, label: '그곳으로 이동', description: '기억하는 장소로 연결된 길 한 구간을 이동한다.', duration: 1,
      effects: [{ kind: 'move', nodeId: step }], utility: { curiosity: .12,
        work: remembered?.tags.some(tag => ['workshop', 'irrigation', 'path', 'life-site'].includes(tag)) ? .25 : 0,
        food: remembered?.tags.includes('food') ? .25 : 0 } }] : [];
  }
  const actions = lifeActions(run, world, actorId, targetId);
  const isLife = target.tags.includes('life-site') || target.kind === 'plot';
  if (!isLife && target.id !== actor.id) for (const [id, count] of Object.entries(target.stock)) {
    if (count <= 0) continue;
    const name = resourceName(id);
    const raw = id.startsWith('raw-');
    actions.push({ id: `take:${id}`, label: raw ? `${name} 채집` : `${name} 1개 가져오기`, description: `${target.name}의 ${name} 1개를 옮긴다.${target.ownerId ? ' 소유와 작업 기록은 남으며, 목격한 이가 각자의 기준으로 판단한다.' : ''}`,
      duration: raw ? 2 : 1, effects: [{ kind: 'transfer', resourceId: id, quantity: 1, from: 'target', to: 'actor' }],
      utility: { food: isFoodResource(id) ? .65 : 0, work: raw ? .15 : .04 } });
  }
  if (target.id !== actor.id && (target.kind === 'actor' || target.tags.includes('storage') || target.workRecipe)) {
    for (const [id, count] of Object.entries(actor.stock)) {
      if (count <= 0) continue;
      actions.push({ id: `give:${id}`, label: `${resourceName(id)} 1개 건네기`, description: `내 ${resourceName(id)} 1개를 ${target.name}에게 옮긴다.`, duration: 1,
        effects: [{ kind: 'transfer', resourceId: id, quantity: 1, from: 'actor', to: 'target' }],
        utility: { sharing: (target.stock[id] ?? 0) < 2 ? .25 : 0, work: target.workRecipe?.inputs[id] && (target.stock[id] ?? 0) < target.workRecipe.inputs[id]! ? .6 : 0 } });
    }
  }
  if (target.workRecipe) actions.push({ id: 'work', label: '작업 돕기', description: `작업 ${laborPower(actor)} 진척. 완성할 때 ${Object.entries(target.workRecipe.inputs).map(([id,n]) => `${resourceName(id)} ${n}개`).join(', ') || '재료 소비 없음'}.`, duration: 1,
    effects: [{ kind: 'work', amount: laborPower(actor) }, { kind: 'influence', property: 'practice', amount: 1, side: 'actor' }],
    utility: { work: .65, safety: target.tags.includes('path') ? .45 : 0 }, satisfies: { work: .12 } });
  if (target.id !== actor.id) {
    actions.push({ id: 'water', label: '물 붓기', description: '물 1개를 사용해 수분 +3. 열을 식히고 수분에 반응하는 생산물을 돌본다.', duration: 1,
      effects: [{ kind: 'stock', resourceId: 'water', amount: -1, side: 'actor' }, { kind: 'influence', property: 'moisture', amount: 3 }],
      utility: { safety: (target.properties.burning ?? 0) > 0 ? 1 : 0 } });
    actions.push({ id: 'heat', label: '열 가하기', description: '숯 1개를 사용해 열 +4. 가연성·수분·내열성에 따라 반응한다.', duration: 1,
      effects: [{ kind: 'stock', resourceId: 'i-life-char', amount: -1, side: 'actor' }, { kind: 'influence', property: 'heat', amount: 4 }] });
    actions.push({ id: 'force', label: '힘 가하기', description: '힘 +12. 단단함에 따라 내구가 손상될 수 있고, 파괴되면 생산과 재고를 잃는다.', duration: 1,
      effects: [{ kind: 'influence', property: 'force', amount: 12 }] });
    if ((actor.colors.electric ?? 0) >= 5) actions.push({ id: 'charge', label: '전하 흘리기', description: 'MP 1을 써 전하 +4. 전도성과 수분이 높을수록 영향이 커진다.', duration: 1,
      requires: { actorMin: { mana: 1 } }, effects: [{ kind: 'influence', property: 'mana', amount: -1, side: 'actor' }, { kind: 'influence', property: 'charge', amount: 4 }] });
  }
  if (target.kind === 'actor') {
    actions.push({ id: 'rest', label: target.id === actor.id ? '쉬며 주변 살피기' : '함께 쉬기', description: '1턴 쉬면서 주변에서 일어나는 일을 관찰한다.', duration: 1,
      effects: [{ kind: 'signal', message: `${subject} ${target.id === actor.id ? '주변을 살피며 쉰다.' : `${target.name} 곁에서 쉰다.`}` }], utility: { rest: .5, curiosity: .1 }, satisfies: { rest: .3, curiosity: .04 } });
    if (target.id === actor.id) for (const [id, count] of Object.entries(actor.stock)) {
      if (count <= 0 || !isFoodResource(id)) continue;
      actions.push({ id: id === 'i-crop-grain' ? 'eat' : `eat:${id}`, label: `${resourceName(id)}으로 끼니 준비`, description: `${resourceName(id)} 1개를 사용한다.`, duration: 1,
        effects: [{ kind: 'stock', resourceId: id, amount: -1, side: 'actor' }, { kind: 'signal', message: `${subject} 끼니를 준비했다.` }], utility: { food: 1 }, satisfies: { food: .6 } });
    }
    if (target.id !== actor.id) {
      const known = world.knowledge[actorId]?.facts.filter(f => f.actorId && f.actorId !== actorId && !f.sourceFactId && f.kind !== 'signal').at(-1);
      if (known) actions.push({ id: `tell:${known.id}`, label: '본 일 전하기', description: '직접 목격한 일 한 가지를 출처와 함께 전한다. 상대는 전언으로 받아들인다.', duration: 1,
        effects: [{ kind: 'signal', message: `${actor.name}의 전언: ${known.message}`, sourceFactId: known.id }], utility: { curiosity: .3 } });
    }
  }
  return actions;
}

function resourceName(id: string): string {
  return useDataStore().items.get(id)?.name ?? ({ water: '물', 'raw-fiber': '거친 섬유', 'raw-stone': '원석' } as Record<string,string>)[id] ?? id;
}

export function observedTargets(run: RunState, actorId = PLAYER_ACTOR_ID): ObservedTarget[] {
  const world = run.interactionWorld;
  const actor = world?.entities[actorId];
  if (!world || !actor) return [];
  return Object.values(world.knowledge[actorId]?.targets ?? {}).filter(t => t.nodeId === actor.nodeId);
}

export function affordances(run: RunState, actorId: string, targetId: string): ActionOffer[] {
  const world = run.interactionWorld;
  if (!world || !observedTargets(run, actorId).some(t => t.id === targetId)) return [];
  return availableWorldActions(run, world, actorId, targetId).map(action => {
    const reason = run.ended ? '여정이 끝났다.' : run.gridCombat || run.combat ? '전투 중에는 사용할 수 없다.' : run.remainingTime < action.duration ? '남은 시간이 부족하다.' : interactionDisabled(world, actorId, targetId, action);
    return { id: action.id, label: action.label, description: action.description, duration: action.duration, enabled: !reason, reason };
  });
}

export function commitWorldInteraction(run: RunState, targetId: string, action: InteractionAction): InteractionResult {
  const fail = (message: string): InteractionResult => ({ ok: false, reason: message, message, duration: 0, facts: [] });
  if (run.ended || run.gridCombat || run.combat) return fail('지금은 세계 행동을 할 수 없다.');
  if (run.remainingTime < action.duration) return fail('남은 시간이 부족하다.');
  const world = ensureInteractionWorld(run);
  if (targetId !== PLAYER_ACTOR_ID && !observedTargets(run).some(target => target.id === targetId)) return fail('현재 관찰할 수 없는 대상이다.');
  const result = resolveInteraction(world, PLAYER_ACTOR_ID, targetId, action);
  if (result.ok) { processSocialFacts(world); syncPlayerFromWorld(run, world); }
  return result;
}

export function performWorldInteraction(run: RunState, request: InteractionRequest): InteractionResult {
  const world = ensureInteractionWorld(run);
  if (request.actorId !== PLAYER_ACTOR_ID) return { ok: false, message: '플레이어의 행동만 직접 선택할 수 있다.', duration: 0, facts: [] };
  const action = availableWorldActions(run, world, request.actorId, request.targetId).find(a => a.id === request.actionId);
  return action ? commitWorldInteraction(run, request.targetId, action) : { ok: false, message: '지금은 가능한 행동이 아니다.', duration: 0, facts: [] };
}

export function tickInteractionWorld(run: RunState): void {
  const world = ensureInteractionWorld(run);
  if (run.field) { world.turn = run.visitedNodes.length; settleLifeWorld(run, world, world.turn); syncPlayerFromWorld(run, world); return; }
  while (world.turn < run.visitedNodes.length) {
    world.turn++;
    tickMaterials(world, world.spaces ? 'exclude' : undefined);
    settleLifeWorld(run, world, world.turn);
    processSocialFacts(world);
    tickSocialAgents(world, world.turn, (actor, target) => world.spaces?.[world.entities[actor]?.nodeId ?? ''] ? [] : availableWorldActions(run, world, actor, target));
    processSocialFacts(world);
    for (const actor of Object.values(world.entities)) if (actor.kind === 'actor') observeWorld(world, actor.id);
  }
  syncPlayerFromWorld(run, world);
}

export function changeWorldProfession(run: RunState, profession: NonNullable<RunState['profession']>): void {
  run.profession = profession;
  const actor = ensureInteractionWorld(run).entities[PLAYER_ACTOR_ID];
  if (!actor?.agent) return;
  const profile = createSocialProfile(run.raceId, profession, { homeNodeId: actor.agent.homeNodeId, turn: run.visitedNodes.length });
  actor.agent = { ...profile, relations: actor.agent.relations, beliefs: actor.agent.beliefs, needs: actor.agent.needs };
  observeWorld(run.interactionWorld!, PLAYER_ACTOR_ID);
}
