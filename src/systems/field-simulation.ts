import type { RunState } from '@/data/schemas';
import type { GridPos } from '@/data/schemas/base';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { ensureInteractionWorld, syncPlayerToWorld, syncPlayerFromWorld, availableWorldActions } from './world-interaction';
import { influenceEntity, observeWorld, recordFact, resolveInteraction, tickMaterials } from './world/engine';
import { gestureDefinition } from './gesture-catalog';
import { processSocialFacts, rankSocialActions } from './world/social';
import { cardinal, createSightTest, distance, entitiesAt, fieldPath, hasSight, positionKey, walkable } from './world/spatial';
import type { InteractionAction, InteractionWorld, WorldEntity } from './world/types';
import { ensureFieldSpace, fieldItemName, fieldMap, placeFieldEntity, spawnCreature } from './field-generation';
import { GESTURES, GLYPHS, type Gesture, type FieldResult, type FieldSpace } from './field-types';
import { isEdgeRequirementMet } from './map';
import { isFoodResource } from './world/resources';
import { applyArcRewards, applyBossRewards } from './boss-rewards';

export const STEP_SECONDS = 30;
const LEGACY_SECONDS = 864;
const valid = (e: WorldEntity) => (e.properties.integrity ?? 100) > 0;
export function gestureLevel(run: RunState, gesture: Gesture): number { return 1 + Math.floor(Math.sqrt((run.field?.gestureXp[gesture] ?? 0) / 6)); }
export function fieldClock(run: RunState): string {
  const elapsed = run.field?.elapsedSeconds ?? run.visitedNodes.length * LEGACY_SECONDS;
  const seconds = Math.floor(elapsed + 12 * 3600);
  return `${Math.floor(seconds / 86400) + 1}일 ${String(Math.floor(seconds / 3600) % 24).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function ensureField(run = useRunStore().data): { world: InteractionWorld; space: FieldSpace; player: WorldEntity } {
  const world = ensureInteractionWorld(run);
  if (!run.field) {
    run.field = { version: 1, elapsedSeconds: run.visitedNodes.length * LEGACY_SECONDS, gestureXp: {}, practiceAt: {}, spoken: {}, lastNpcStep: 0, lastWorldStep: 0, sequence: 0, completedDungeons: [] };
    run.field.lastNpcStep = run.field.elapsedSeconds;
    run.field.lastWorldStep = run.field.elapsedSeconds;
    const player = world.entities.player!;
    player.stock['field-seed'] = (player.stock['field-seed'] ?? 0) + 3;
    player.stock.water = (player.stock.water ?? 0) + 2;
    run.gridCombat = undefined;
    run.combat = undefined;
  }
  run.field.elapsedSeconds = Math.max(run.field.elapsedSeconds, run.visitedNodes.length * LEGACY_SECONDS);
  const space = ensureFieldSpace(run, world, run.currentNodeId);
  const player = world.entities.player!;
  if (!run.field.controlsVersion) {
    for (const [old,id] of [['up','lift'],['down','place'],['left','take'],['right','give']]) run.field.gestureXp[id!] ??= run.field.gestureXp[old!] ?? 0;
    run.field.controlsVersion=2;
  }
  player.properties.carryCapacity = 2 + gestureLevel(run, 'lift');
  if (!player.pos || !space.tiles[player.pos.y]?.[player.pos.x] || space.tiles[player.pos.y]![player.pos.x] === 'wall') placeFieldEntity(world, space, player, space.spawn);
  for (const held of Object.values(world.entities).filter(e => e.carriedBy === player.id)) held.nodeId = player.nodeId;
  syncPlayerFromWorld(run, world);
  observeWorld(world, player.id);
  return { world, space, player };
}
export function visibleFieldEntities(run: RunState): WorldEntity[] {
  const world = run.interactionWorld;
  const player = world?.entities.player;
  if (!world || !player) return [];
  const sees=createSightTest(world,player);
  return Object.values(world.entities).filter(e => e.nodeId === player.nodeId && !e.carriedBy && e.pos && (valid(e) || e.kind !== 'actor') && sees(e));
}
export function carriedEntity(world: InteractionWorld, actorId = 'player'): WorldEntity | undefined { return Object.values(world.entities).find(e => e.carriedBy === actorId); }
export function groundAt(run: RunState, pos: GridPos): WorldEntity {
  const { world, space } = ensureField(run);
  const existing = entitiesAt(world, space.id, pos).find(e => e.id !== 'player' && e.kind !== 'actor');
  if (existing) return existing;
  const id = `${space.id}:ground:${positionKey(pos)}`;
  return world.entities[id] ??= { id, name: space.tiles[pos.y]?.[pos.x] === 'soil' ? '빈 밭' : '바닥', kind: 'terrain', nodeId: space.id, pos: { ...pos }, colors: {}, stock: {}, tags: ['ground', 'storage', 'shared', ...(space.tiles[pos.y]?.[pos.x] === 'soil' ? ['field-plot'] : [])], properties: { integrity: 100, soil: space.tiles[pos.y]?.[pos.x] === 'soil' ? 1 : 0 } };
}
function program(gesture: Gesture, effects: InteractionAction['effects'], extra: Partial<InteractionAction> = {}): InteractionAction {
  return { id: `glyph:${gesture}`, label: GLYPHS[gesture], description: '', duration: 0, effects, ...extra };
}
/** This adapter chooses primitives by capabilities, never a per-object action pair table. */
export function fieldAction(run: RunState, world: InteractionWorld, actor: WorldEntity, target: WorldEntity, gesture: Gesture, pos: GridPos, selectedItem?: string): InteractionAction | undefined {
  const level = actor.id === 'player' ? gestureLevel(run, gesture) : 1 + Math.floor(actor.agent?.skills.work ?? 0);
  const held = carriedEntity(world, actor.id);
  const effect = gestureDefinition(gesture)?.effect;
  if (effect) return program(gesture, [{kind:'influence',side:'actor',property:'mana',amount:-effect.mana},{kind:'influence',property:effect.property,amount:effect.amount+level*2}], {reach:effect.reach,requires:{actorMin:{mana:effect.mana}}});
  if (gesture === 'up' || gesture === 'lift') return (target.properties.portable ?? 0) > 0 && !held ? program(gesture, [{ kind: 'carry', held: true }]) : undefined;
  if (gesture === 'down' || gesture === 'place') return held ? program(gesture, [{ kind: 'carry', held: false, pos }], {reach:1+Math.floor(level/4)}) : undefined;
  if (gesture === 'left' || gesture === 'take') {
    const resource = selectedItem && (target.stock[selectedItem] ?? 0) > 0 ? selectedItem : Object.keys(target.stock).find(id => (target.stock[id] ?? 0) > 0);
    if (!resource || target.id === actor.id) return undefined;
    const quantity = Math.min(target.stock[resource]!, 1 + Math.floor(level / 3));
    return program(gesture, [{ kind: 'transfer', resourceId: resource, quantity, from: 'target', to: 'actor' }], { utility: { food: isFoodResource(resource) ? .7 : .05, work: .15 } });
  }
  if (gesture === 'right' || gesture === 'give') {
    const resource = selectedItem;
    if (!resource || (actor.stock[resource] ?? 0) <= 0 || target.id === actor.id) return undefined;
    return program(gesture, [{ kind: 'transfer', resourceId: resource, quantity: 1, from: 'actor', to: 'target' }], { reach: 1 + Math.floor(level / 4), utility: { sharing: .3 } });
  }
  if (gesture === 'triangle') {
    if (target.id === actor.id) return program(gesture, [{ kind: 'influence', property: 'guard', amount: 4 + level * 2 }]);
    const coal = selectedItem === 'i-life-char' && (actor.stock['i-life-char'] ?? 0) > 0;
    const electric = selectedItem === 'i-life-charge' && (actor.stock['i-life-charge'] ?? 0) > 0;
    const power = 5 + level * 2 + Math.floor((actor.colors.fire ?? 0) / 20);
    const amount = target.creature ? power / target.creature.maxHp * 100 + (target.properties.hardness ?? 0) : 12 + level * 3;
    const effects: InteractionAction['effects'] = coal || electric
      ? [{ kind: 'stock', resourceId: selectedItem!, amount: -1, side: 'actor' }, { kind: 'influence', property: coal ? 'heat' : 'charge', amount: coal ? 4 + level : 8 + level * 2 }]
      : [{ kind: 'influence', property: 'force', amount }];
    if (!coal && !electric && target.pos && actor.pos && distance(target.pos, actor.pos) === 1 && (target.creature || (target.properties.portable ?? 0) > 0)) {
      const dest = { x: target.pos.x + Math.sign(target.pos.x - actor.pos.x), y: target.pos.y + Math.sign(target.pos.y - actor.pos.y) };
      if (walkable(world, target.nodeId, dest, target.id)) effects.push({ kind: 'relocate', pos: dest });
    }
    return program(gesture, effects, { reach: electric ? 3 : 1 });
  }
  if (gesture === 'inverted') {
    if ((target.properties.soil ?? 0) > 0 && !target.production && Object.values(target.stock).every(n => n <= 0) && (actor.stock['field-seed'] ?? 0) > 0) {
      return program(gesture, [{ kind: 'stock', resourceId: 'field-seed', amount: -1, side: 'actor' }, { kind: 'production', batch: {
        id: `field-batch:${actor.id}:${run.field?.elapsedSeconds}:${target.id}`, recipeId: 'field-grain', producerId: actor.id, startedTurn: (run.field?.elapsedSeconds ?? 0) / LEGACY_SECONDS,
        duration: Math.max(900, 1800 - (level - 1) * 120) / LEGACY_SECONDS, settled: false, output: { 'i-crop-grain': 2, 'field-seed': 1 }, level, colorValue: actor.colors.earth ?? 0, upper: false, automaticCare: true,
      } }], { utility: { work: .7 } });
    }
    if (target.id === actor.id) {
      const food = selectedItem && isFoodResource(selectedItem) && (actor.stock[selectedItem] ?? 0) > 0 ? selectedItem : Object.keys(actor.stock).find(id => isFoodResource(id) && actor.stock[id]! > 0);
      if (food && (actor.properties.integrity ?? 100) < 100) return program(gesture, [{ kind: 'stock', resourceId: food, amount: -1, side: 'actor' }, { kind: 'influence', property: 'integrity', amount: 15 + level * 3 }]);
      return undefined;
    }
    if ((actor.stock.water ?? 0) > 0 && (target.properties.moisture ?? 0) < 6) return program(gesture, [{ kind: 'stock', resourceId: 'water', amount: -1, side: 'actor' }, { kind: 'influence', property: 'moisture', amount: 3 }], { utility: { work: target.production ? .65 : 0, safety: (target.properties.burning ?? 0) > 0 ? .9 : 0 } });
    return undefined;
  }
  if (target.workRecipe) return program(gesture, [{ kind: 'work', amount: 1 + Math.floor(level / 2) }], { utility: { work: .8 } });
  return program(gesture, [{ kind: 'signal', message: target.kind === 'actor' ? `${actor.name}: ${target.name}에게 말을 건넸다.` : `${actor.name}: ${target.name} 곁에 머물렀다.` }], { reach: target.kind === 'actor' ? 3 : 1, utility: { rest: .1 } });
}
function speechFor(run: RunState, actor: WorldEntity) {
  const npc = useDataStore().npcs.get(actor.npcId ?? '');
  const trust = actor.agent?.relations.player?.trust ?? 0;
  const opinion = actor.agent?.beliefs.filter(b => b.subjectId === 'player' && b.trustDelta !== 0).at(-1);
  const greeting = trust < -.25 ? '잠깐. 지난번 일부터 이야기하고 싶어.' : trust > .15 ? '다시 왔구나. 네가 보탠 일을 기억하고 있어.' : npc?.tagline || '왔구나. 잠깐 쉬었다 갈래?';
  const specific = npc?.backgroundByTimeline?.[run.timelineId] ?? npc?.background;
  const lines = [greeting];
  if (opinion) lines.push(opinion.trustDelta < 0 ? '먹을 것을 나누는 건 좋아. 다만 누군가 들인 수고까지 없는 셈 치지는 말아 줘.' : '함께한 일은 기억에 남지. 고마워.');
  if (specific) lines.push(...specific.split('|').filter(Boolean).slice(0, 2));
  else lines.push(actor.agent?.profession === 'artisan' ? '재료야 많지. 쓸 만하게 다듬는 데 손이 많이 갈 뿐이야.' : actor.agent?.profession === 'grower' ? '밭은 내가 보는 동안에도 자라. 네 일도 보고 와.' : '이 길에도 저마다 사정이 있어. 직접 보고 판단하는 편이 좋아.');
  return { actorId: actor.id, name: actor.name, lines };
}
function grantPractice(run: RunState, gesture: Gesture, target: WorldEntity, result: ReturnType<typeof resolveInteraction>) {
  const field = run.field!;
  if (!result.facts.some(f => f.kind !== 'signal')) return;
  const key = `${gesture}:${target.id}`;
  if (field.practiceAt[key] !== undefined && field.elapsedSeconds - field.practiceAt[key]! < 60) return;
  field.practiceAt[key] = field.elapsedSeconds;
  field.gestureXp[gesture] = Math.min(600, (field.gestureXp[gesture] ?? 0) + 1);
  if (gesture === 'take' && (target.tags.includes('field-plot') || target.tags.includes('brush'))) useRunStore().addLifeXp(1);
}
function settleProduction(run: RunState, world: InteractionWorld, activeIds?: ReadonlySet<string>) {
  for (const e of activeIds ? [...activeIds].map(id=>world.entities[id]!).filter(Boolean) : Object.values(world.entities)) {
    if (!e.tags.includes('field-plot')) continue;
    if (!valid(e)) { e.production = undefined; continue; }
    const batch = e.production;
    if (!batch) continue;
    if (!batch.settled && run.field!.elapsedSeconds >= Math.round((batch.startedTurn + batch.duration) * LEGACY_SECONDS)) {
      const bonus = Math.min(2, Math.floor((e.properties.moisture ?? 0) / 3));
      batch.output['i-crop-grain'] = 2 + bonus;
      for (const [id, n] of Object.entries(batch.output)) e.stock[id] = (e.stock[id] ?? 0) + n;
      batch.settled = true;
      e.name = bonus > 0 ? '여문 들곡' : '들곡';
      recordFact(world, { turn: world.turn, nodeId: e.nodeId, targetId: e.id, kind: 'production', ownerId: e.ownerId, labor: e.labor ?? 0, message: `${e.name} +${batch.output['i-crop-grain']}` });
    }
    if (batch.settled && Object.values(e.stock).every(n => n <= 0)) { e.production = undefined; e.name = '빈 밭'; e.properties.moisture = 0; }
  }
}
function tickResidents(run: RunState, world: InteractionWorld, activeIds: ReadonlySet<string>) {
  // Candidate evaluation is read-only. Keep shared entity references but exclude unrelated areas
  // from its repeated inventory, occupancy and path queries; commit the chosen action to the world.
  const local: InteractionWorld = { ...world, entities: Object.fromEntries(Object.entries(world.entities).filter(([,e])=>e.nodeId===run.currentNodeId)) };
  for (const actor of [...activeIds].map(id=>world.entities[id]!).filter(e => e?.agent && e.id !== 'player' && e.pos && valid(e))) {
    if (run.field!.elapsedSeconds-(actor.fieldNpcAt??0)<90) continue;
    actor.fieldNpcAt=run.field!.elapsedSeconds;
    actor.agent!.needs.work = Math.min(1, actor.agent!.needs.work + .025);
    actor.agent!.needs.food = Math.min(1, actor.agent!.needs.food + .012);
    observeWorld(local, actor.id);
    const choices = rankSocialActions(local, actor.id, (actorId, targetId) => {
      const target = local.entities[targetId];
      if (!target || !target.pos || target.nodeId !== actor.nodeId || target.creature) return [];
      const programs = [
        ...availableWorldActions(run, local, actorId, targetId).filter(a => a.effects.every(e => e.kind !== 'move') && !['force','heat','charge'].includes(a.id)),
        ...(['left', 'inverted', 'circle'] as const).map(g => fieldAction(run, local, actor, target, g, target.pos!)).filter((a): a is InteractionAction => !!a),
      ];
      if (distance(actor.pos!, target.pos) <= 1) return programs;
      const step = fieldPath(local, actor.nodeId, actor.pos!, target.pos, actor.id, true)?.[0];
      return step ? programs.map(a => ({ ...a, duration: 1, effects: [{ kind: 'relocate' as const, side: 'actor' as const, pos: step }] })) : [];
    });
    const choice = choices[0];
    if (choice) resolveInteraction(world, actor.id, choice.targetId, choice.action);
  }
  processSocialFacts(world);
}
function creatureCells(world: InteractionWorld, e: WorldEntity, player: WorldEntity): GridPos[] {
  const data = useDataStore(), c = e.creature!;
  const def = c.rank === 'boss' ? data.bosses.get(c.definitionId) : data.monsters.get(c.definitionId);
  let shape = def && 'gridBehavior' in def ? def.gridBehavior?.[Math.floor(e.properties.attacksMade ?? 0) % Math.max(1, def.gridBehavior?.length ?? 0)]?.shape : undefined;
  if (c.rank === 'boss' && def && 'phases' in def) {
    const phases = def.phases.filter(p => (e.properties.integrity ?? 100) / 100 <= p.startsAtHpRatio);
    const phase = phases.at(-1);
    shape = phase?.gridBehavior?.[0]?.shape;
    const phaseIndex = phase ? def.phases.indexOf(phase) : 0;
    if (c.phase !== phaseIndex) {
      c.phase = phaseIndex;
      for (const [i, id] of (phase?.spawnMinions ?? []).entries()) {
        const minion = data.monsters.get(id);
        if (minion) spawnCreature(useRunStore().data, world, world.spaces![e.nodeId]!, minion, 100 + phaseIndex * 10 + i, 'normal');
      }
    }
  }
  if (shape?.length) {
    const cells = shape.map(p => ({ x: e.pos!.x + p.dx, y: e.pos!.y + p.dy })).filter(p => world.spaces?.[e.nodeId]?.tiles[p.y]?.[p.x] && world.spaces[e.nodeId]!.tiles[p.y]![p.x] !== 'wall');
    if (cells.some(p => distance(p, player.pos!) === 0)) return cells;
  }
  if (c.rank === 'normal') return [{ ...player.pos! }];
  const radius = c.rank === 'boss' ? 2 : 1;
  return [player.pos!, ...cardinal(player.pos!), ...(radius === 2 ? cardinal(player.pos!).flatMap(p => cardinal(p)) : [])].filter((p, i, all) => all.findIndex(q => distance(p, q) === 0) === i && world.spaces?.[e.nodeId]?.tiles[p.y]?.[p.x] && world.spaces[e.nodeId]!.tiles[p.y]![p.x] !== 'wall');
}
function defeatCreature(run: RunState, world: InteractionWorld, e: WorldEntity) {
  const c = e.creature!;
  if (c.defeated || valid(e)) return;
  c.defeated = true; c.intent = undefined;
  const id = `${e.id}:loot`;
  world.entities[id] = { id, name: '남겨진 물품', kind: 'resource', nodeId: e.nodeId, pos: e.pos ? { ...e.pos } : undefined, colors: {}, tags: ['storage', 'shared', 'loot'], properties: { integrity: 100, portable: 1, mass: 1 }, stock: { 'i-crop-grain': c.rank === 'normal' ? 1 : 2, ...(c.reward.itemId ? { [c.reward.itemId]: 1 } : {}) } };
  run.gold += c.reward.gold; run.timeShards += c.reward.shards;
  if (c.rank === 'boss') {
    const boss = useDataStore().bosses.get(c.definitionId);
    if (boss && !run.bossesCleared.includes(boss.id) && !run.arcsCleared?.includes(boss.id)) {
      if (boss.kind === 'arc') { applyArcRewards(boss); (run.arcsCleared ??= []).push(boss.id); }
      else { applyBossRewards(boss); run.bossesCleared.push(boss.id); }
    }
  }
  const space = world.spaces![e.nodeId]!;
  space.cleared = !Object.values(world.entities).some(other => other.nodeId === space.id && other.creature && valid(other));
  if (space.dungeon?.floor === 3 && space.cleared && !run.field!.completedDungeons.includes(space.nodeId)) {
    run.field!.completedDungeons.push(space.nodeId);
    (run.nodeStates[space.nodeId] ??= { visited: true }).combatCleared = true;
    run.timeShards += 10;
  }
}
function tickCreatures(run: RunState, world: InteractionWorld, activeIds: ReadonlySet<string>) {
  const player = world.entities.player!;
  for (const e of [...activeIds].map(id=>world.entities[id]!).filter(e => e?.creature && e.nodeId === player.nodeId)) {
    if (!valid(e)) { defeatCreature(run, world, e); continue; }
    if (!e.pos || !player.pos || !valid(player)) continue;
    const c = e.creature!;
    const priorIntent = c.intent;
    if (priorIntent?.length) {
      for (const pos of priorIntent) for (const target of entitiesAt(world, e.nodeId, pos)) {
        if (target.id === e.id || !valid(target)) continue;
        const hp = target.id === 'player' ? run.maxHp : target.creature?.maxHp ?? 100;
        const guard = target.properties.guard ?? 0;
        const damage = Math.max(0, c.attack - guard);
        target.properties.guard = Math.max(0, guard - c.attack);
        resolveInteraction(world, e.id, target.id, { id: 'creature-force', label: '충격', description: '', duration: 0, reach: 10, effects: [{ kind: 'influence', property: 'force', amount: damage / hp * 100 + (target.properties.hardness ?? 0) }] });
      }
      c.intent = undefined; e.properties.attacksMade = (e.properties.attacksMade ?? 0) + 1;
      continue;
    }
    const food = !c.angry ? Object.values(world.entities).filter(t => t.nodeId === e.nodeId && t.pos && !t.carriedBy && t.kind !== 'actor' && Object.entries(t.stock).some(([id, n]) => n > 0 && isFoodResource(id)) && distance(e.pos!, t.pos) <= 5 && hasSight(world, e, t)).sort((a,b) => distance(e.pos!, a.pos!) - distance(e.pos!, b.pos!))[0] : undefined;
    if (food) {
      if (distance(e.pos, food.pos!) <= 1) {
        const resourceId = Object.keys(food.stock).find(id => food.stock[id]! > 0 && isFoodResource(id))!;
        resolveInteraction(world, e.id, food.id, program('left', [{ kind: 'transfer', resourceId, quantity: 1, from: 'target', to: 'actor' }, { kind: 'stock', resourceId, amount: -1, side: 'actor' }]));
      } else {
        const next = fieldPath(world, e.nodeId, e.pos, food.pos!, e.id, true)?.[0];
        if (next) resolveInteraction(world, e.id, e.id, program('right', [{ kind: 'relocate', side: 'actor', pos: next }]));
      }
      continue;
    }
    const sees = hasSight(world, e, player);
    if (!sees || distance(e.pos, player.pos) > (world.spaces![e.nodeId]!.dungeon ? 8 : 5)) continue;
    if (distance(e.pos, player.pos) <= c.range) c.intent = creatureCells(world, e, player);
    else {
      const next = fieldPath(world, e.nodeId, e.pos, player.pos, e.id, true)?.[0];
      if (next) resolveInteraction(world, e.id, e.id, program('right', [{ kind: 'relocate', side: 'actor', pos: next }]));
    }
  }
  for (const e of [...activeIds].map(id=>world.entities[id]!).filter(e => e?.creature)) defeatCreature(run, world, e);
}
function checkPlayer(run: RunState, world: InteractionWorld): boolean {
  syncPlayerFromWorld(run, world);
  if (run.hp > 0) return true;
  const store = useRunStore();
  if (!store.loseLife()) { store.endRun('hp-zero'); return false; }
  const oldSpace = world.spaces![run.currentNodeId]!;
  const destination = oldSpace.dungeon?.origin ?? fieldMap(run)!.startNodeId;
  const player = world.entities.player!;
  const held = carriedEntity(world);
  if (held) { held.carriedBy = undefined; held.pos = { ...player.pos! }; }
  run.hp = Math.max(1, Math.ceil(run.maxHp * .5));
  run.currentNodeId = destination;
  const space = ensureFieldSpace(run, world, destination);
  player.nodeId = destination; player.pos = { ...space.spawn };
  syncPlayerToWorld(run, world);
  return false;
}
let fieldViewport: { columns:number; rows:number } | undefined;
export function setFieldViewport(viewport?: {columns:number;rows:number}) { fieldViewport=viewport; }
export function activeFieldIds(run:RunState, world:InteractionWorld): Set<string> {
  const space=world.spaces![run.currentNodeId]!,player=world.entities.player!;
  const cols=fieldViewport?.columns??space.width,rows=fieldViewport?.rows??space.height;
  const x=Math.max(0,Math.min(space.width-cols,player.pos!.x-Math.floor(cols/2)));
  const y=Math.max(0,Math.min(space.height-rows,player.pos!.y-Math.floor(rows/2)));
  const within=(pos:GridPos)=>pos.x>=x-1&&pos.y>=y-1&&pos.x<x+cols+1&&pos.y<y+rows+1;
  return new Set(Object.values(world.entities).filter(e=>e.nodeId===space.id&&(e.id==='player'||e.carriedBy==='player'||e.pos&&within(e.pos)||e.creature?.intent?.some(within))).map(e=>e.id));
}
/** Distant areas settle elapsed state arithmetically; no pathfinding or replay of missed attacks. */
function settleDormant(run:RunState,world:InteractionWorld,e:WorldEntity,until:number) {
  const steps=Math.max(0,Math.floor((until-(e.fieldUpdatedAt??until))/STEP_SECONDS));
  if(steps>0&&valid(e)) {
    const burns=Math.min(steps,e.properties.burning??0);
    if(burns>0) influenceEntity(world,e,'integrity',-3*burns,undefined,`${e.name}에 시간이 흘렀다.`);
    for(const key of ['heat','burning','smoke']) e.properties[key]=Math.max(0,(e.properties[key]??0)-steps);
    if(e.creature) { e.creature.intent=undefined; if(!valid(e)) defeatCreature(run,world,e); }
    if(e.renewable && e.renewable.nextTurn<=world.turn && e.renewable.interval>0 && valid(e)) {
      e.stock[e.renewable.resourceId]=Math.max(e.stock[e.renewable.resourceId]??0,e.renewable.capacity);
      e.renewable.nextTurn+=(Math.floor((world.turn-e.renewable.nextTurn)/e.renewable.interval)+1)*e.renewable.interval;
    }
  }
  e.fieldUpdatedAt=until;
  const cycles=Math.floor((until-(e.fieldNpcAt??until))/90);
  if(e.agent&&e.id!=='player'&&valid(e)&&cycles>0) {
    e.agent.needs.food=Math.min(1,e.agent.needs.food+.012*cycles);
    e.agent.needs.work=Math.min(1,e.agent.needs.work+.025*cycles);
    e.fieldNpcAt=until;
    const food=Object.keys(e.stock).find(id=>isFoodResource(id)&&e.stock[id]!>0);
    if(food&&e.agent.needs.food>.5) {
      const quantity=Math.min(e.stock[food]!,Math.max(1,Math.floor(cycles/4)));
      resolveInteraction(world,e.id,e.id,program('take',[{kind:'stock',side:'actor',resourceId:food,amount:-quantity}],{satisfies:{food:quantity*.2}}));
    }
    if(e.pos&&e.agent.needs.work>.4) {
      const bench=Object.values(world.entities).find(t=>t.nodeId===e.nodeId&&t.workRecipe&&t.pos&&distance(e.pos!,t.pos)<=1&&valid(t));
      if(bench) resolveInteraction(world,e.id,bench.id,program('circle',[{kind:'work',amount:Math.min(3,cycles)}],{satisfies:{work:.1}}));
    }
  }
}
export function advanceFieldTime(seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds % STEP_SECONDS !== 0) throw new Error('Field time must use 30-second steps');
  const store = useRunStore(), run = store.data;
  const { world } = ensureField(run);
  const origin = run.currentNodeId;
  for (let left = seconds; left > 0 && !run.ended; left -= STEP_SECONDS) {
    run.field!.elapsedSeconds += STEP_SECONDS;
    const active=activeFieldIds(run,world),now=run.field!.elapsedSeconds;
    for(const id of active) settleDormant(run,world,world.entities[id]!,now-STEP_SECONDS);
    tickMaterials(world, 'only', active);
    for(const id of active) world.entities[id]!.fieldUpdatedAt=now;
    const coarse=now-run.field!.lastWorldStep>=300;
    if(coarse) {
      for(const e of Object.values(world.entities)) if(!active.has(e.id)&&world.spaces?.[e.nodeId]) settleDormant(run,world,e,now);
      run.field!.lastWorldStep=now;
    }
    settleProduction(run, world, coarse ? undefined : active);
    tickCreatures(run, world, active);
    if (!checkPlayer(run, world) || run.currentNodeId !== origin) break;
    tickResidents(run, world, active);
    syncPlayerFromWorld(run, world);
    while (run.visitedNodes.length < Math.floor(run.field!.elapsedSeconds / LEGACY_SECONDS) && !run.ended) store.spendWorldTime(1);
    processSocialFacts(world);
    observeWorld(world, 'player');
  }
}
export function travelField(to: string): FieldResult {
  const run = useRunStore().data;
  const { world, space, player } = ensureField(run);
  const entry = space.exits.find(e => e.to === to && distance(e.pos, player.pos!) <= 1);
  const cave = entitiesAt(world, space.id, player.pos!).concat(Object.values(world.entities).filter(e => e.nodeId === space.id && e.pos && distance(player.pos!, e.pos) <= 1)).some(e => e.tags.includes('dungeon-entry'));
  const dungeonEntry = to === `${space.nodeId}::dungeon:1` && cave && !space.dungeon;
  if (!entry && !dungeonEntry) return { ok: false, message: '이어진 길이 아니다.' };
  if (entry?.requirement && (entry.requirement === 'room-clear' ? !space.cleared : !isEdgeRequirementMet(entry.requirement, run))) return { ok: false, message: entry.requirement === 'room-clear' ? '아직 마물이 남아 있다.' : '닫힌 길.' };
  if (run.ended) return { ok: false, message: '여정이 끝났다.' };
  const next = ensureFieldSpace(run, world, to);
  run.currentNodeId = next.id;
  player.nodeId = next.id;
  // Return beside the connecting path, never immediately trigger the exit again.
  const back = next.exits.find(e => e.to === space.id);
  const preferred = back ? cardinal(back.pos).find(p => walkable(world, next.id, p, player.id) && p.x > 0 && p.y > 0 && p.x < next.width - 1 && p.y < next.height - 1) : undefined;
  placeFieldEntity(world, next, player, preferred ?? next.spawn);
  const active=activeFieldIds(run,world);
  for(const id of active) settleDormant(run,world,world.entities[id]!,run.field!.elapsedSeconds);
  settleProduction(run,world,active);
  for (const held of Object.values(world.entities).filter(e => e.carriedBy === player.id)) held.nodeId = next.id;
  (run.nodeStates[next.nodeId] ??= { visited: true }).visited = true;
  observeWorld(world, player.id);
  return { ok: true, message: next.name, travel: true };
}
export function stepField(pos: GridPos): FieldResult {
  const run = useRunStore().data;
  const { world, player, space } = ensureField(run);
  if (run.ended || !player.pos || distance(player.pos, pos) !== 1) return { ok: false, message: '한 칸씩 이동한다.' };
  const action = program('right', [{ kind: 'relocate', side: 'actor', pos }]);
  const result = resolveInteraction(world, 'player', 'player', action);
  if (!result.ok) return result;
  advanceFieldTime(STEP_SECONDS);
  if (run.currentNodeId !== space.id || run.ended) return { ok: true, message: '목숨을 잃고 물러났다.', travel: true };
  const exit = space.exits.find(e => distance(e.pos, pos) === 0);
  return exit ? travelField(exit.to) : { ok: true, message: '' };
}
export function performFieldGesture(gesture: Gesture, targetId: string | undefined, pos: GridPos, input?: {quality:number;drawn:boolean}): FieldResult {
  const run = useRunStore().data;
  const { world, space, player } = ensureField(run);
  if (!GESTURES.includes(gesture) || run.ended) return { ok: false, message: '' };
  const definition=gestureDefinition(gesture)!;
  if(definition.drawOnly&&(!input?.drawn||input.quality<1-definition.tolerance)) return {ok:false,message:'무늬가 흐트러졌다.'};
  if(definition.direction) {
    const destination={x:player.pos!.x+definition.direction.x,y:player.pos!.y+definition.direction.y};
    if(walkable(world,space.id,destination,player.id)) { const result=stepField(destination); return {...result,targetId:'player',targetPos:{...player.pos!}}; }
    const adjacent=entitiesAt(world,space.id,destination).filter(valid).sort((a,b)=>Number(b.kind==='actor')-Number(a.kind==='actor'))[0];
    if(!adjacent) return {ok:false,message:'길이 막혀 있다.',targetPos:destination};
    const interaction=adjacent.creature?'triangle':adjacent.kind==='actor'?'circle':(adjacent.properties.portable??0)>0?'lift':Object.values(adjacent.stock).some(n=>n>0)&&!adjacent.workRecipe?'take':'circle';
    return {...performFieldGesture(interaction,adjacent.id,destination),targetId:adjacent.id,targetPos:destination};
  }
  if (!Number.isInteger(pos.x) || !Number.isInteger(pos.y) || !space.tiles[pos.y]?.[pos.x] || space.tiles[pos.y]![pos.x] === 'wall') return { ok: false, message: '닿을 수 없는 곳.' };
  if (gesture === 'circle') {
    const exit = space.exits.find(e => distance(e.pos, pos) === 0 && distance(player.pos!, pos) <= 1);
    if (exit) { const result = travelField(exit.to); if (result.ok) advanceFieldTime(STEP_SECONDS); return result; }
  }
  const target: WorldEntity | undefined = gesture === 'place' ? carriedEntity(world) : targetId ? world.entities[targetId] : groundAt(run, pos);
  if (!target || target.nodeId !== player.nodeId || target.carriedBy && target.carriedBy !== player.id || !hasSight(world, player, target)) return { ok: false, message: '대상이 보이지 않는다.' };
  if (gesture === 'circle' && target.tags.includes('dungeon-entry')) {
    if (!target.pos || distance(player.pos!, target.pos) > 1) return { ok: false, message: '조금 더 가까이.' };
    const result = travelField(`${space.nodeId}::dungeon:1`);
    if (result.ok) advanceFieldTime(STEP_SECONDS);
    return result;
  }
  const action = fieldAction(run, world, player, target, gesture, pos, run.field!.selectedItem);
  if (!action) return { ok: false, message: '변화 없음' };
  const beforeHp = target.properties.integrity ?? 100;
  const result = resolveInteraction(world, player.id, target.id, action);
  if (!result.ok) return { ok: false, message: result.reason ?? result.message };
  if (target.creature && (target.properties.integrity ?? 100) < beforeHp) target.creature.angry = true;
  let speech;
  if (gesture === 'circle' && target.kind === 'actor' && target.id !== player.id && !target.creature) { speech = speechFor(run, target); run.field!.spoken[target.id] = (run.field!.spoken[target.id] ?? 0) + 1; }
  const transferred = result.facts.find(f => f.kind === 'transfer');
  let message = transferred ? `${fieldItemName(transferred.resourceId!)} ${gesture === 'take' ? '+' : '−'}${transferred.quantity}` : gesture === 'lift' ? `${target.name} ∧` : gesture === 'place' ? `${target.name} ∨` : target.production && !target.production.settled ? '싹이 자란다.' : result.facts.some(f => f.property === 'integrity' && f.after! < f.before!) ? `−${Math.ceil((beforeHp - (target.properties.integrity ?? 100)) * (target.creature?.maxHp ?? 100) / 100)}` : GLYPHS[gesture];
  if (result.facts.some(f => f.message === '물이 퍼졌다.')) message = '물이 퍼졌다.';
  if (target.production && target.tags.includes('field-plot')) target.name = '자라는 들곡';
  grantPractice(run, gesture, target, result);
  processSocialFacts(world);
  syncPlayerFromWorld(run, world);
  const resting = gesture === 'circle' && (target.id === 'player' || target.tags.includes('shelter'));
  if (resting && !Object.values(world.entities).some(e => e.nodeId === space.id && e.creature && valid(e))) {
    advanceFieldTime(600);
    if (!run.ended) { run.hp = Math.min(run.maxHp, run.hp + Math.ceil(run.maxHp * .15)); syncPlayerToWorld(run, world); }
    message = '10분이 흘렀다.';
  } else advanceFieldTime(STEP_SECONDS);
  return { ok: true, message, speech, changed: result.facts.map(f => f.targetId) };
}
