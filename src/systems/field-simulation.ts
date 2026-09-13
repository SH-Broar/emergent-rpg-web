import { colorOperationAction, colorOperationDisabled } from './field-color-actions';
import { tickFieldCasting, triggerFieldInstallations } from './field-casting';
import { bossEncounterFailure } from './field-combat';
import { fieldReading, recordReading } from './field-readings';
import { arriveTimeAllies, tickTimeAllies, reconcileTimePeople, isTimeAlly, timeAllyTopics, recruitTimeAlly, resolveTimeEnding } from './time-story';
import { fieldChaosHpMultiplier } from './field-chaos';
import { ensureJourney, noteJourney, questTopics, performQuest, completeBossQuests, ensureQuestRemains } from './field-journey';
import { skillGestureUnlocked, SKILL_UNLOCK_LEVEL, type SkillGesture } from './field-skill-rules';
import { supplyAction, SUPPLY_NAMES } from './field-supplies';
import { fieldTargets } from './field-selection';
import { prepareCreatureIntent } from './field-ai';
import { ensureBases, rememberHouse, wakeTime, playerHomeId, initialHomeNode, baseEntryFailure, baseOffer, purchaseBase } from './field-bases';
import { absorbRunIntoMeta } from './progression';
import { enforceTamamoSubmission } from './field-combat';
import { ensureFieldSkills, SKILL_GESTURES, castFieldSkill, tickFieldSkills } from './field-skills';
import { NPC_DIALOGUE } from '@/data/npc-dialogue';
import { ensureResidentPopulation, placeArrivingResidents, tickResidentSchedules, residentAgenda, performResidentEvent } from './field-residents';
import { reconcileFieldTransformation, cureFieldTransformation } from './field-transformation';
import { XP_NORMAL, XP_ELITE } from './enhance';
import { inward } from './field-geography';
import { combatDefinition, phaseFor, resolveAttack, tickStatuses, finishStatusStep, afterMovement, commitCreatureMove, beginBossEncounter, clearCombatStatuses } from './field-combat';
import { actionRestriction, movementRange, movesAsAir, outgoingDamage, status, changeStatus } from './world/status';
import type { RunState } from '@/data/schemas';
import type { GridPos } from '@/data/schemas/base';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { ensureInteractionWorld, syncPlayerToWorld, syncPlayerFromWorld, availableWorldActions } from './world-interaction';
import { influenceEntity, normalizeIntegrity, interactionDisabled, observeWorld, recordFact, resolveInteraction, tickMaterials } from './world/engine';
import { gestureDefinition } from './gesture-catalog';
import { processSocialFacts, rankSocialActions } from './world/social';
import { cardinal, createSightTest, distance, entitiesAt, fieldPath, hasSight, positionKey, walkable } from './world/spatial';
import type { InteractionAction, InteractionWorld, WorldEntity } from './world/types';
import { ensureFieldSpace, fieldCreatureHp, fieldItemName, placeFieldEntity, spawnCreature } from './field-generation';
import { GESTURES, GLYPHS, type Gesture, type FieldResult, type FieldSpace, type FieldSpeech } from './field-types';
import { isEdgeRequirementMet } from './map';
import { isFoodResource } from './world/resources';
import { lifeActions, plantLifeAction, gatherForageAction } from './world/life-world';
import { bonusesFromEffective } from './equipment';
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
  ensureBases(run);
  ensureJourney(run).visited[run.currentNodeId]=true;
  const space = ensureFieldSpace(run, world, run.currentNodeId);
  const player = world.entities.player!;
  if (!run.field.controlsVersion) {
    for (const [old,id] of [['up','lift'],['down','place'],['left','take'],['right','give']]) run.field.gestureXp[id!] ??= run.field.gestureXp[old!] ?? 0;
    run.field.controlsVersion=2;
  }
  if((run.field.controlsVersion??0)<3){run.field.gestureXp.strike??=run.field.gestureXp.triangle??0;run.field.gestureXp.tend??=run.field.gestureXp.inverted??0;run.field.controlsVersion=3;}
  run.maxMp=3;run.mp=Math.min(3,run.mp);player.properties.mana=run.mp;
  if(!run.field.combatVersion){run.field.combatVersion=1;run.field.manaStep=0;player.properties['status:possession']=run.possessed??0;player.properties['status:feral-heavy']=run.feralHeavy??0;}
  if(!run.field.formVersion){
    for(const actor of Object.values(world.entities))if(actor.npcId){
      const capabilities=useDataStore().npcs.get(actor.npcId)?.tags?.filter(t=>t.startsWith('restore:'))??[];
      actor.tags=[...new Set([...actor.tags,...capabilities])];
    }
    run.field.formVersion=1;
  }
  reconcileFieldTransformation(run,world);
  ensureResidentPopulation(run,world);placeArrivingResidents(run,world);
  reconcileTimePeople(run,world);
  ensureQuestRemains(run,world,space,placeFieldEntity);
  ensureFieldSkills(run);
  player.properties.maxHp=run.maxHp;
  for(const e of Object.values(world.entities).filter(e=>e.nodeId===space.id&&e.kind==='actor')){
    e.properties.maxHp=e.id==='player'?run.maxHp:e.creature?.maxHp??100;
    normalizeIntegrity(e.properties);
    if(e.creature&&(e.creature.balanceVersion??0)<2){const def=combatDefinition(e);if(def)e.creature.maxHp=Math.ceil(fieldCreatureHp(def.hp,e.creature.rank)*fieldChaosHpMultiplier(run,e.creature.rank));e.creature.balanceVersion=2;e.properties.maxHp=e.creature.maxHp;}
    if(e.creature){e.creature.species??=useDataStore().monsters.get(e.creature.definitionId)?.species;}
  }
  player.properties.carryCapacity = 2 + gestureLevel(run, 'lift');
  if (!player.pos || !space.tiles[player.pos.y]?.[player.pos.x] || space.tiles[player.pos.y]![player.pos.x] === 'wall') placeFieldEntity(world, space, player, space.spawn);
  for (const held of Object.values(world.entities).filter(e => e.carriedBy === player.id)) held.nodeId = player.nodeId;
  syncPlayerFromWorld(run, world);
  observeWorld(world, player.id);
  for(const e of Object.values(world.entities))if(e.creature&&e.nodeId===player.nodeId)prepareCreatureIntent(run,world,e);
  return { world, space, player };
}
export function visibleFieldEntities(run: RunState): WorldEntity[] {
  const world = run.interactionWorld;
  const player = world?.entities.player;
  if (!world || !player) return [];
  const sees=createSightTest(world,player);
  return Object.values(world.entities).filter(e => e.nodeId === player.nodeId && !e.carriedBy && e.pos && (valid(e) || e.kind !== 'actor' && !e.tags.includes('casting-trace')) && sees(e));
}
export function carriedEntity(world: InteractionWorld, actorId = 'player'): WorldEntity | undefined { return Object.values(world.entities).find(e => e.carriedBy === actorId); }
function groundTarget(world:InteractionWorld,space:FieldSpace,pos:GridPos):WorldEntity {
  const existing = fieldTargets(entitiesAt(world, space.id, pos).filter(e => e.id !== 'player' && e.kind !== 'actor' && valid(e)))[0];
  if (existing) return existing;
  const id = `${space.id}:ground:${positionKey(pos)}`;
  return world.entities[id] ?? { id, name: space.tiles[pos.y]?.[pos.x] === 'soil' ? '빈 밭' : '바닥', kind: 'terrain', nodeId: space.id, pos: { ...pos }, colors: {}, stock: {}, tags: ['ground', 'storage', 'shared', ...(space.tiles[pos.y]?.[pos.x] === 'soil' ? ['field-plot'] : [])], properties: { integrity: 100, soil: space.tiles[pos.y]?.[pos.x] === 'soil' ? 1 : 0 } };
}
export function groundAt(run: RunState, pos: GridPos): WorldEntity {
  const {world,space}=ensureField(run),target=groundTarget(world,space,pos);
  return world.entities[target.id]??=target;
}
function program(gesture: Gesture, effects: InteractionAction['effects'], extra: Partial<InteractionAction> = {}): InteractionAction {
  return { id: `glyph:${gesture}`, label: GLYPHS[gesture], description: '', duration: 0, effects, ...extra };
}
/** This adapter chooses primitives by capabilities, never a per-object action pair table. */
export function fieldAction(run: RunState, world: InteractionWorld, actor: WorldEntity, target: WorldEntity, gesture: Gesture, pos: GridPos, selectedItem?: string): InteractionAction | undefined {
  const level = actor.id === 'player' ? gestureLevel(run, gesture) : 1 + Math.floor(actor.agent?.skills.work ?? 0);
  if(gesture==='tend'&&selectedItem&&SUPPLY_NAMES[selectedItem])return supplyAction(actor,target,selectedItem);
  if(gesture==='tap'&&target.recordId){const reading=fieldReading(target);return reading?program(gesture,[{kind:'signal',message:reading.lines[0]??target.name}]):undefined;}
  if(gesture==='strike')gesture='triangle';
  if(gesture==='tend')gesture='inverted';
  if((gesture==='tap'||gesture==='take')&&target.tags.includes('forage')){
   const action=gatherForageAction(world,actor.id,target.id);return action?{...action,duration:0}:undefined;
  }
  if(gesture==='tap'&&target.tags.includes('life-site')) {
    let action:InteractionAction|undefined=lifeActions(run,world,actor.id,target.id)[0];
    const batch=action?.effects.find(e=>e.kind==='production'&&e.batch);
    if(actor.id==='player'&&batch?.kind==='production'&&batch.batch)action=plantLifeAction(world,actor.id,target.id,batch.batch.recipeId,0,run.field?.productionMode);
    return action?{...action,duration:0}:undefined;
  }
  if(gesture==='tap'&&target.kind!=='actor'&&!target.tags.some(t=>t.startsWith('service:')||t==='shelter'||t==='dungeon-entry')&&!target.workRecipe&&Object.values(target.stock).some(n=>n>0))gesture='take';
  const combat=actor.id==='player'?bonusesFromEffective(run,useDataStore().equipments):{damage:0,block:0};
  const held = carriedEntity(world, actor.id);
  const effect = gestureDefinition(gesture)?.effect;
  if (effect) return program(gesture, [{kind:'influence',side:'actor',property:'mana',amount:-effect.mana},{kind:'influence',property:effect.property,amount:(effect.amount+level*2)/(target.kind==='actor'?(target.properties.maxHp??100)/100:1)}], {reach:effect.reach,requires:{actorMin:{mana:effect.mana}}});
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
    if (target.id === actor.id) return status(actor,'feral')||status(actor,'feral-heavy')?undefined:program(gesture, [{ kind: 'influence', property: 'guard', amount: Math.max(0,4 + level * 2 + Math.floor(combat.block*(status(actor,'regress')?.5:1))+status(actor,'dexterity')-status(actor,'frail')-(actor.properties.guard??0)) }]);
    const coal = selectedItem === 'i-life-char' && (actor.stock['i-life-char'] ?? 0) > 0;
    const electric = selectedItem === 'i-life-charge' && (actor.stock['i-life-charge'] ?? 0) > 0;
    const power = outgoingDamage(actor,5 + level * 2 + Math.floor(combat.damage*(status(actor,'regress')?.5:1)));
    const amount = target.kind==='actor' ? Math.max(0,power-(target.creature?combatDefinition(target)?.defense??0:0)) / (target.properties.maxHp??100) * 100 + (target.properties.hardness ?? 0)+(target.colors.iron??0)/20 : 12 + level * 3 + combat.damage;
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
export function speechFor(run:RunState,actor:WorldEntity):FieldSpeech {
  const dialogue=NPC_DIALOGUE[actor.npcId??''];
  const trust=actor.agent?.relations.player?.trust??0;
  const lines=dialogue?.greeting.split('\n')??[actor.name+'이 고개를 돌렸다.'];
  const topics:NonNullable<FieldSpeech['topics']>=dialogue?.topics.map(t=>({...t,lines:[...t.lines]}))??[];
  const form=run.transform?.field?run.transform.formRaceId:undefined;
  if(form){
    if(actor.tags.includes('restore:'+form)){
      lines.splice(0,lines.length,'그 모습… 타마모한테 다녀왔구나. 잠깐, 꼬리부터 볼게.');
      topics.unshift({label:'원래 모습으로',lines:[],action:'restore-form'},
        {label:'이 몸에 대해',lines:['몸을 돌려놓을 수는 있어. 그 전에 이 힘을 더 익혀 봐도 되고. 결정했으면 말해.']});
    }else{
      lines.unshift((run.field?.spoken[actor.id]??0)>0?'어, 목소리는 알아듣겠어. 무슨 일이 있었던 거야?':'들어올 때 문턱 조심해. 꼬리 끝이 걸릴 것 같아서.');
      const knows=actor.tags.includes('mage')||['npc-cayo','npc-valencia'].includes(actor.npcId??'');
      topics.unshift({label:'변신을 풀려면',lines:[knows?'카시스에게 물어봐. 모스의 대장간에도 가끔 들르던데. 나는 그 술법을 잘 몰라.':'미안해. 나는 그런 술법은 다룰 줄 몰라.']});
    }
  }
  topics.unshift(...questTopics(run,actor), ...timeAllyTopics(run,actor));
  topics.push(...residentAgenda(run,actor)??[]);
  if(trust<-.25)lines.unshift('미안하지만, 지금은 이야기하고 싶지 않아.');
  return {actorId:actor.id,name:actor.name,lines,topics};
}
/** Dialogue choices revalidate the actual NPC at execution time. */
export function performFieldService(actorId:string,action:string):FieldResult {
  const run=useRunStore().data,{world}=ensureField(run);
  enforceTamamoSubmission(run,world);if(!checkPlayer(run,world))return {ok:false,message:'집에서 눈을 떴다.',travel:true};
  if(run.ended||run.field?.encounter)return {ok:false,message:'지금은 부탁할 수 없다.'};
  if(action==='story:recruit'){
    const result=recruitTimeAlly(run,world,actorId);
    if(result.ok)advanceFieldTime(STEP_SECONDS,false);
    return result;
  }
  if(action.startsWith('quest:')){
    const result=performQuest(run,world,actorId,action);
    if(result.ok){syncPlayerFromWorld(run,world);advanceFieldTime(STEP_SECONDS,false);}
    return result;
  }
  if(action.startsWith('base:')){
    const result=purchaseBase(run,actorId,action);
    if(result.ok){syncPlayerFromWorld(run,world);advanceFieldTime(STEP_SECONDS,false);}
    return result;
  }
  if(action.startsWith('resident-event:')){
    const result=performResidentEvent(run,world,actorId,action.slice('resident-event:'.length));
    if(result.ok){if('practice'in result&&result.practice)useRunStore().addLifeXp(result.practice);processSocialFacts(world);syncPlayerFromWorld(run,world);advanceFieldTime(STEP_SECONDS,false);}
    return result;
  }
  if(action!=='restore-form')return {ok:false,message:'지금은 부탁할 수 없다.'};
  const result=cureFieldTransformation(run,world,actorId);
  if(!result.ok)return result;
  processSocialFacts(world);syncPlayerFromWorld(run,world);advanceFieldTime(STEP_SECONDS,false);
  return {...result,speech:{actorId,name:world.entities[actorId]!.name,lines:['끝났어. 바로 일어나지 말고, 손부터 조금 움직여 봐.']}};
}
function grantPractice(run: RunState, gesture: Gesture, target: WorldEntity, result: ReturnType<typeof resolveInteraction>) {
  const field = run.field!;
  if (!result.facts.some(f => f.kind !== 'signal')) return;
  const key = `${gesture}:${target.id}`;
  if (field.practiceAt[key] !== undefined && field.elapsedSeconds - field.practiceAt[key]! < 60) return;
  field.practiceAt[key] = field.elapsedSeconds;
  field.gestureXp[gesture] = Math.min(600, (field.gestureXp[gesture] ?? 0) + 1);
  if (result.facts.some(f=>f.kind==='transfer'&&(f.after??0)<(f.before??0)) && (target.tags.includes('field-plot') || target.tags.includes('brush') || target.tags.includes('forage'))) useRunStore().addLifeXp(1);
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
    if(isTimeAlly(run,actor))continue;
    if(actor.routine&&(actor.routine.travel||actor.routine.goal!==actor.nodeId))continue;
    if(actionRestriction(actor))continue;
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
function defeatCreature(run: RunState, world: InteractionWorld, e: WorldEntity) {
  const c = e.creature!;
  if (c.defeated || valid(e)) return;
  noteJourney(run,'defeat');
  c.defeated = true; c.intent = undefined; c.pending=undefined;c.nextAction=undefined;
  const id = `${e.id}:loot`;
  const loot:WorldEntity = { id, name: '남겨진 물품', kind: 'resource', nodeId: e.nodeId, pos: e.pos ? { ...e.pos } : undefined, colors: {}, tags: ['storage', 'shared', 'loot'], properties: { integrity: 100, portable: 1, mass: 1 }, stock: { 'i-crop-grain': c.rank === 'normal' ? 1 : 2, ...(c.reward.itemId ? { [c.reward.itemId]: 1 } : {}) } };
  placeFieldEntity(world,world.spaces![e.nodeId]!,loot,e.pos??world.spaces![e.nodeId]!.spawn);
  run.gold += c.reward.gold; run.timeShards += c.reward.shards;
  if(c.rank!=='boss'&&!e.tags.includes('split-child'))useRunStore().gainXp(c.rank==='elite'?XP_ELITE:XP_NORMAL);
  const definition=combatDefinition(e);
  if(definition&&'splitCount'in definition&&definition.splitCount&&!e.tags.includes('split-child')){
    for(let i=0;i<definition.splitCount;i++){
      const child=spawnCreature(run,world,world.spaces![e.nodeId]!,definition,200+(run.field!.sequence++),'normal');
      child.tags.push('split-child');child.creature!.maxHp=Math.max(1,Math.floor(c.maxHp/2));child.properties.maxHp=child.creature!.maxHp;child.creature!.reward={gold:0,shards:0};child.creature!.angry=true;
    }
  }
  if (c.rank === 'boss') {
    const boss = useDataStore().bosses.get(c.definitionId);
    if(boss?.defeatText)run.field!.notification={actorId:e.id,name:e.name,lines:[boss.defeatText]};
    if (boss && !run.bossesCleared.includes(boss.id) && !run.arcsCleared?.includes(boss.id)) {
      if (boss.kind === 'arc') { applyArcRewards(boss); (run.arcsCleared ??= []).push(boss.id); }
      else { applyBossRewards(boss); run.bossesCleared.push(boss.id); completeBossQuests(run,world,boss.id); resolveTimeEnding(run,world); run.field!.clearedAt=run.field!.elapsedSeconds; useRunStore().endRun('boss-cleared'); absorbRunIntoMeta(run); }
    }
  }
  if(world.entities.player)world.entities.player.properties.level=run.level??1;
  const space = world.spaces![e.nodeId]!;
  space.cleared = !Object.values(world.entities).some(other => other.nodeId === space.id && other.creature && valid(other));
  if(space.cleared&&space.id===world.entities.player?.nodeId)clearCombatStatuses(world.entities.player!);
  if (space.dungeon?.floor === 3 && space.cleared && !run.field!.completedDungeons.includes(space.nodeId)) {
    run.field!.completedDungeons.push(space.nodeId);
    (run.nodeStates[space.nodeId] ??= { visited: true }).combatCleared = true;
    run.timeShards += 10;
  }
}
function tickCreatures(run: RunState, world: InteractionWorld, activeIds: ReadonlySet<string>, blocked:ReadonlySet<string>) {
  const player = world.entities.player!;
  for (const e of [...activeIds].map(id=>world.entities[id]!).filter(e => e?.creature && e.nodeId === player.nodeId)) {
    if(run.ended||!valid(player))break;
    if (!valid(e)) { defeatCreature(run, world, e); continue; }
    if (blocked.has(e.id)) { e.creature!.recovery=Math.max(0,(e.creature!.recovery??0)-1); continue; }
    if (!e.pos || !player.pos || !valid(player)) continue;
    const c=e.creature!,def=combatDefinition(e),phase=phaseFor(e);
    if(phase && def && 'phases' in def) {
      const index=def.phases.indexOf(phase);
      if(c.phase!==index){
        if(c.phase!==undefined){c.pending=undefined;c.intent=undefined;c.nextAction=undefined;}c.phase=index;
        for(const [i,id]of (phase.spawnMinions??[]).entries()){
          const minion=useDataStore().monsters.get(id);
          if(minion)prepareCreatureIntent(run,world,spawnCreature(run,world,world.spaces![e.nodeId]!,minion,100+index*10+i,'normal'));
        }
      }
    }
    if(!c.pending&&!c.nextAction){prepareCreatureIntent(run,world,e);continue;}
    if(c.pending){
      if(--c.pending.remaining<=0){resolveAttack(world,e);reconcileFieldTransformation(run,world);enforceTamamoSubmission(run,world);}
      continue;
    }
    const next=c.nextAction;c.nextAction=undefined;
    if(next?.kind==='recover')c.recovery=Math.max(0,(c.recovery??0)-1);
    else if(next?.kind==='move'&&next.pos){commitCreatureMove(world,e,next.pos);triggerFieldInstallations(run,world,e.id);}
    else if(next?.kind==='eat'&&next.targetId&&next.resourceId){
      const food=world.entities[next.targetId];
      if(food?.pos&&valid(food)&&food.nodeId===e.nodeId&&distance(e.pos,food.pos)<=1&&hasSight(world,e,food)&&(food.stock[next.resourceId]??0)>0)
        resolveInteraction(world,e.id,food.id,program('take',[{kind:'transfer',resourceId:next.resourceId,quantity:1,from:'target',to:'actor'},{kind:'stock',resourceId:next.resourceId,amount:-1,side:'actor'}]));
    }else if(next?.kind==='encounter')beginBossEncounter(run,e);

  }
  for(const e of [...activeIds].map(id=>world.entities[id]!).filter(e=>e?.creature))defeatCreature(run,world,e);
}
/** Unconscious time settles production and distant travel without replaying combat. */
export function recoverFieldPlayer(run:RunState=useRunStore().data):void {
 if(!run.field||run.ended)return;
 const world=run.interactionWorld;if(!world?.entities.player)return;
 const player=world.entities.player,bases=ensureBases(run),field=run.field;
 const until=wakeTime(field.elapsedSeconds),reason=field.knockoutReason;
 const destination=world.spaces?.[bases.lastHouse]?.residence?.kind==='home'||bases.lastHouse.endsWith('::player-home')?bases.lastHouse:playerHomeId(initialHomeNode(run));
 const held=carriedEntity(world);if(held){held.carriedBy=undefined;held.pos=player.pos?{...player.pos}:undefined;}
 clearCombatStatuses(player,true);run.possessed=0;run.feralHeavy=0;field.encounter=undefined;field.knockoutReason=undefined;
 if(field.skills){field.skills.pending=undefined;field.skills.nextPower=undefined;field.skills.nextCost=undefined;field.skills.manaDue=[];}
 for(const e of Object.values(world.entities))if(e.nodeId===player.nodeId&&e.creature){e.creature.pending=undefined;e.creature.intent=undefined;e.creature.nextAction=undefined;e.creature.engaged=false;}
 run.hp=run.maxHp;run.mp=3;field.manaStep=0;
 run.combat=undefined;run.gridCombat=undefined;
 run.currentNodeId=destination;player.nodeId=destination;
 const space=ensureFieldSpace(run,world,destination);placeFieldEntity(world,space,player,space.spawn);
 syncPlayerToWorld(run,world);
 // Five-minute scheduling samples only existing entities. Unvisited spaces remain abstract.
 const inactive=new Set<string>();
 while(field.elapsedSeconds<until){
  field.elapsedSeconds=Math.min(until,field.elapsedSeconds+300);
  tickResidentSchedules(run,world,inactive);
 }
 while(run.visitedNodes.length<Math.floor(until/LEGACY_SECONDS)&&!run.ended)useRunStore().spendWorldTime(1);
 world.turn=run.visitedNodes.length;
 for(const e of Object.values(world.entities))if(e.id!=='player')settleDormant(run,world,e,until);
 settleProduction(run,world);
 field.lastWorldStep=until;field.lastNpcStep=until;player.fieldUpdatedAt=until;player.fieldNpcAt=until;
 bases.knockouts++;
 run.hp=run.maxHp;run.mp=3;syncPlayerToWorld(run,world);
 placeArrivingResidents(run,world);processSocialFacts(world);observeWorld(world,player.id);
 field.notification={actorId:'player',name:space.name,lines:[...(reason==='tamamo'?['타마모 앞에서 두 꼬리가 저절로 낮아졌다.']:[]),fieldClock(run).slice(0,-3)+' · 눈을 떴다.']};
}
function checkPlayer(run: RunState, world: InteractionWorld): boolean {
 syncPlayerFromWorld(run,world);
 if(run.hp>0)return true;
 recoverFieldPlayer(run);return false;
}

let fieldViewport:{columns:number;rows:number}|undefined;
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
    if(e.creature) { e.creature.intent=undefined;e.creature.pending=undefined;e.creature.nextAction=undefined; if(!valid(e)) defeatCreature(run,world,e); }
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
export function advanceFieldTime(seconds: number, waiting=true): void {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds % STEP_SECONDS !== 0) throw new Error('Field time must use 30-second steps');
  const store = useRunStore(), run = store.data;
  const { world } = ensureField(run);
  enforceTamamoSubmission(run,world);
  if(!checkPlayer(run,world)||run.ended)return;
  const origin = run.currentNodeId;
  for (let left = seconds; left > 0 && !run.ended && !run.field!.encounter; left -= STEP_SECONDS) {
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
    const previousStatuses=new Map([...active].map(id=>[id,{...world.entities[id]!.properties}]));
    const blocked=new Set([...active].filter(id=>actionRestriction(world.entities[id]!)!==undefined));
    for(const id of active){const e=world.entities[id]!;if(e.kind==='actor'){tickStatuses(world,e,Math.floor(now/STEP_SECONDS),waiting);triggerFieldInstallations(run,world,e.id);}}
    run.field!.manaStep=(run.field!.manaStep??0)+1;
    if(run.field!.manaStep>=2){run.field!.manaStep=0;world.entities.player!.properties.mana=Math.min(3,(world.entities.player!.properties.mana??0)+1+(status(world.entities.player!,'haste')?1:0));}
    tickFieldCasting(run, world);
    tickFieldSkills(run, world);
    reconcileTimePeople(run, world);
    tickTimeAllies(run, world, blocked);
    for(const id of active)triggerFieldInstallations(run,world,id);
    tickCreatures(run, world, active, blocked);
    reconcileTimePeople(run, world);
    for(const id of active)if(world.entities[id]?.kind==='actor')finishStatusStep(world.entities[id]!,previousStatuses.get(id)!);
    if (!checkPlayer(run, world) || run.currentNodeId !== origin) break;
    tickResidentSchedules(run,world,active);
    tickResidents(run, world, active);
    for(const id of active)triggerFieldInstallations(run,world,id);
    for(const id of active){const e=world.entities[id];if(e?.creature)prepareCreatureIntent(run,world,e);}
    syncPlayerFromWorld(run, world);
    while (run.visitedNodes.length < Math.floor(run.field!.elapsedSeconds / LEGACY_SECONDS) && !run.ended) store.spendWorldTime(1);
    processSocialFacts(world);
    observeWorld(world, 'player');
  }
}
export function travelField(to: string): FieldResult {
  const run = useRunStore().data;
  const { world, space, player } = ensureField(run);
  enforceTamamoSubmission(run,world);if(!checkPlayer(run,world))return {ok:false,message:'집에서 눈을 떴다.',travel:true};
  const entry = space.exits.find(e => e.to === to && distance(e.pos, player.pos!) <= 1);
  const cave = entitiesAt(world, space.id, player.pos!).concat(Object.values(world.entities).filter(e => e.nodeId === space.id && e.pos && distance(player.pos!, e.pos) <= 1)).some(e => e.tags.includes('dungeon-entry'));
  const dungeonEntry = to === `${space.nodeId}::dungeon:1` && cave && !space.dungeon;
  if (!entry && !dungeonEntry) return { ok: false, message: '이어진 길이 아니다.' };
  if (entry?.requirement && (entry.requirement === 'room-clear' ? !space.cleared : !isEdgeRequirementMet(entry.requirement, run))) return { ok: false, message: entry.requirement === 'room-clear' ? '아직 마물이 남아 있다.' : '닫힌 길.' };
  if (run.ended) return { ok: false, message: '여정이 끝났다.' };
  const access=baseEntryFailure(run,to);
  if(access){
    const door=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.pos&&entry&&distance(e.pos,entry.pos)===0&&e.tags.some(t=>t==='base:build'||t==='base:rent'));
    return {ok:false,message:access,speech:door?baseOffer(run,door):undefined};
  }
  const next = ensureFieldSpace(run, world, to);
  rememberHouse(run,next.id);
  ensureJourney(run).visited[next.id]=true;
  run.currentNodeId = next.id;
  player.nodeId = next.id;
  // Return beside the connecting path, never immediately trigger the exit again.
  const back = next.exits.find(e => e.to === space.id);
  const direction=entry?inward(space,entry.pos):undefined;
  const facing=direction?{x:-direction.x,y:-direction.y}:undefined;
  // Reciprocal exits now use opposite borders, including every intermediate road.
  const backDirection=back?inward(next,back.pos):undefined;
  const preferred=back&&backDirection?{x:back.pos.x+backDirection.x,y:back.pos.y+backDirection.y}:undefined;
  if(facing){player.properties.facingX=facing.x;player.properties.facingY=facing.y;}
  placeFieldEntity(world, next, player, preferred ?? next.spawn);
  placeArrivingResidents(run,world);
  arriveTimeAllies(run,world,next,space.id,entry?.pos??space.spawn);
  const active=activeFieldIds(run,world);
  for(const id of active) settleDormant(run,world,world.entities[id]!,run.field!.elapsedSeconds);
  settleProduction(run,world,active);
  for (const held of Object.values(world.entities).filter(e => e.carriedBy === player.id)) held.nodeId = next.id;
  for(const e of Object.values(world.entities))if(e.creature&&e.nodeId===player.nodeId)prepareCreatureIntent(run,world,e);
  if(!next.road)(run.nodeStates[next.nodeId] ??= { visited: true }).visited = true;
  observeWorld(world, player.id);
  return { ok: true, message: next.name, travel: true };
}
export function stepField(pos: GridPos): FieldResult {
  const run = useRunStore().data;
  const { world, player, space } = ensureField(run);
  enforceTamamoSubmission(run,world);if(!checkPlayer(run,world))return {ok:false,message:'집에서 눈을 떴다.',travel:true};
  if (run.ended || !player.pos || distance(player.pos, pos) !== 1) return { ok: false, message: '한 칸씩 이동한다.' };
  if(run.field!.encounter)return {ok:false,message:''};
  const blocked=actionRestriction(player,true);if(blocked){advanceFieldTime(STEP_SECONDS);return {ok:false,message:blocked};}
  const action = program('right', [{ kind: 'relocate', side: 'actor', pos }]);
  player.properties.facingX=pos.x-player.pos.x;player.properties.facingY=pos.y-player.pos.y;
  const result = resolveInteraction(world, 'player', 'player', action);
  if (!result.ok) return result;
  afterMovement(player);
  triggerFieldInstallations(run,world,player.id);
  syncPlayerFromWorld(run,world);
  advanceFieldTime(STEP_SECONDS,false);
  if (run.currentNodeId !== space.id || run.ended) return { ok: true, message: '집에서 눈을 떴다.', travel: true };
  const exit = space.exits.find(e => distance(e.pos, pos) === 0);
  return exit ? travelField(exit.to) : { ok: true, message: '' };
}
export function dashFailure(world:InteractionWorld,space:FieldSpace,player:WorldEntity,pos:GridPos):string|undefined {
  const restricted=actionRestriction(player,true);if(restricted)return restricted;
  const range=Math.max(1,movementRange(player)-status(player,'slowed'));
  if((player.properties.mana??0)<1)return '마나 부족';
  if(!walkable(world,space.id,pos,player.id))return '착지할 수 없다.';
  const path=fieldPath(world,space.id,player.pos!,pos,player.id);
  const air=movesAsAir(player);
  if(distance(player.pos!,pos)<1||distance(player.pos!,pos)>range||(!air&&(!path||path.length>range)))return '너무 먼 곳.';
  if((path??[]).some(p=>space.exits.some(x=>distance(x.pos,p)===0))||space.exits.some(x=>distance(x.pos,pos)===0))return '길 안쪽을 선택하세요.';
}
export function performFieldGesture(gesture: Gesture, targetId: string | undefined, pos: GridPos, input?: {quality:number;drawn:boolean}): FieldResult {
  const run = useRunStore().data;
  const { world, space, player } = ensureField(run);
  enforceTamamoSubmission(run,world);if(!checkPlayer(run,world))return {ok:false,message:'집에서 눈을 떴다.',travel:true};
  if (!GESTURES.includes(gesture) || run.ended || run.field!.encounter) return { ok: false, message: '' };
  if(!skillGestureUnlocked(run.level,gesture))return {ok:false,message:'레벨 '+SKILL_UNLOCK_LEVEL[gesture as SkillGesture]+'에 배우는 도형이다.'};
  const definition=gestureDefinition(gesture)!;
  if(definition.drawOnly&&(!input?.drawn||input.quality<1-definition.tolerance)) return {ok:false,message:'무늬가 흐트러졌다.'};
  if(definition.direction) {
    const destination={x:player.pos!.x+definition.direction.x,y:player.pos!.y+definition.direction.y};
    if(walkable(world,space.id,destination,player.id)) { const result=stepField(destination); const ground=entitiesAt(world,player.nodeId,player.pos!).find(e=>e.id!=='player');return {...result,targetId:ground?.id??'player',targetPos:{...player.pos!}}; }
    const adjacent=fieldTargets(entitiesAt(world,space.id,destination).filter(valid))[0];
    if(!adjacent) return {ok:false,message:'길이 막혀 있다.',targetPos:destination};
    const interaction=adjacent.creature?'strike':adjacent.kind==='actor'?'tap':(adjacent.properties.portable??0)>0?'lift':'tap';
    return {...performFieldGesture(interaction,adjacent.id,destination),targetId:adjacent.id,targetPos:destination};
  }
  const blocked=actionRestriction(player);
  if(blocked){advanceFieldTime(STEP_SECONDS);return {ok:false,message:blocked};}
  if(SKILL_GESTURES.includes(gesture as typeof SKILL_GESTURES[number])) {
    const result=castFieldSkill(run,world,gesture,pos);
    if(!checkPlayer(run,world))return {ok:false,message:'집에서 눈을 떴다.',travel:true};
    if(result.ok){noteJourney(run,'skill');noteJourney(run,'skill:'+gesture);syncPlayerFromWorld(run,world);advanceFieldTime(STEP_SECONDS,false);}
    return result;
  }
  if(gesture==='dash'){
    const reason=dashFailure(world,space,player,pos);if(reason)return {ok:false,message:reason};
    influenceEntity(world,player,'mana',-1,player.id);
    const steps=movesAsAir(player)?[pos]:fieldPath(world,space.id,player.pos!,pos,player.id)??[pos];
    for(const step of steps){player.pos={...step};triggerFieldInstallations(run,world,player.id);if(!valid(player))break;}
    afterMovement(player);
    recordFact(world,{turn:world.turn,nodeId:space.id,actorId:player.id,targetId:player.id,kind:'move',labor:0,message:'몸을 날렸다.'});
    syncPlayerFromWorld(run,world);advanceFieldTime(STEP_SECONDS,false);return {ok:true,message:'',targetId:'player',targetPos:{...player.pos!}};
  }
  if (!Number.isInteger(pos.x) || !Number.isInteger(pos.y) || !space.tiles[pos.y]?.[pos.x] || space.tiles[pos.y]![pos.x] === 'wall') return { ok: false, message: '닿을 수 없는 곳.' };
  if (gesture === 'circle'||gesture==='tap') {
    const exit = space.exits.find(e => distance(e.pos, pos) === 0 && distance(player.pos!, pos) <= 1);
    if (exit) { const result = travelField(exit.to); if (result.ok) advanceFieldTime(STEP_SECONDS); return result; }
  }
  const target: WorldEntity | undefined = gesture === 'place' ? carriedEntity(world) : targetId ? world.entities[targetId] : groundAt(run, pos);
  if (!target || target.nodeId !== player.nodeId || target.carriedBy && target.carriedBy !== player.id || !hasSight(world, player, target)) return { ok: false, message: '대상이 보이지 않는다.' };
  if ((gesture === 'circle'||gesture==='tap') && target.tags.includes('dungeon-entry')) {
    if (!target.pos || distance(player.pos!, target.pos) > 1) return { ok: false, message: '조금 더 가까이.' };
    const result = travelField(`${space.nodeId}::dungeon:1`);
    if (result.ok) advanceFieldTime(STEP_SECONDS);
    return result;
  }
  if(gesture==='tap'&&target.pos&&distance(player.pos!,target.pos)<=1){
    const offer=baseOffer(run,target);if(offer)return {ok:true,message:'',speech:offer};
    if(target.tags.includes('base:configure'))return {ok:true,message:'',route:'base-configure'};
  }
  if(target.creature?.rank==='boss'&&!target.creature.engaged){const locked=bossEncounterFailure(run,target);if(locked)return {ok:false,message:locked};beginBossEncounter(run,target,true);checkPlayer(run,world);return {ok:true,message:''};}
  if(target.kind==='actor'&&status(target,'ghost')&&(status(player,'ghost')||distance(player.pos!,target.pos!)>1)&&['strike','triangle','star'].includes(gesture))return {ok:false,message:'닿지 않는다.'};
  const action = fieldAction(run, world, player, target, gesture, pos, run.field!.selectedItem);
  if (!action) return { ok: false, message: '변화 없음' };
  const beforeHp = target.properties.integrity ?? 100;
  const result = resolveInteraction(world, player.id, target.id, action);
  if (!result.ok) return { ok: false, message: result.reason ?? result.message };
  for(const id of new Set(result.facts.filter(f=>f.kind==='move').map(f=>f.targetId)))triggerFieldInstallations(run,world,id);
  if(gesture==='tend'&&run.field!.selectedItem&&SUPPLY_NAMES[run.field!.selectedItem]){noteJourney(run,'used');noteJourney(run,'used:'+run.field!.selectedItem);}
  if (target.creature && (target.properties.integrity ?? 100) < beforeHp) target.creature.angry = true;
  let speech = gesture==='tap'&&target.recordId?recordReading(run,target):undefined;
  if ((gesture === 'circle'||gesture==='tap') && target.kind === 'actor' && target.id !== player.id && !target.creature) { speech = speechFor(run, target); run.field!.spoken[target.id] = (run.field!.spoken[target.id] ?? 0) + 1; }
  const transferred = result.facts.find(f => f.kind === 'transfer');
  let message = transferred ? `${fieldItemName(transferred.resourceId!)} ${gesture === 'give' ? '−' : '+'}${transferred.quantity}` : gesture === 'lift' ? `${target.name} ∧` : gesture === 'place' ? `${target.name} ∨` : target.production && !target.production.settled ? '자라기 시작했다.' : result.facts.some(f => f.property === 'integrity' && f.after! < f.before!) ? `−${Math.ceil((beforeHp - (target.properties.integrity ?? 100)) * (target.creature?.maxHp ?? 100) / 100)}` : '';
  if (result.facts.some(f => f.message === '물이 퍼졌다.')) message = '물이 퍼졌다.';
  if (target.production && target.tags.includes('field-plot')&&!target.tags.includes('life-site')) target.name = '자라는 들곡';
  if(target.tags.includes('life-site')||target.tags.includes('forage')) {
    const gained=result.facts.filter(f=>f.targetId==='player'&&f.property==='practice').reduce((sum,f)=>sum+Math.max(0,(f.after??0)-(f.before??0)),0);
    if(gained)useRunStore().addLifeXp(gained);
    const output=result.facts.find(f=>f.targetId==='player'&&f.kind==='production'&&f.quantity);
    if(output?.resourceId)message=`${fieldItemName(output.resourceId)} +${output.quantity}`;
  }
  changeStatus(player.properties,'slime',-1);
  grantPractice(run, gesture, target, result);
  processSocialFacts(world);
  syncPlayerFromWorld(run, world);
  const resting = gesture === 'tap' && (target.id === 'player' || target.tags.includes('shelter'));
  if (resting && !Object.values(world.entities).some(e => e.nodeId === space.id && e.creature && valid(e))) {
    clearCombatStatuses(player,true);syncPlayerFromWorld(run,world);
    advanceFieldTime(600);
    if (!run.ended) { run.hp = Math.min(run.maxHp, run.hp + Math.ceil(run.maxHp * .15)); syncPlayerToWorld(run, world); }
    message = '10분이 흘렀다.';
  } else advanceFieldTime(STEP_SECONDS,false);
  const service=gesture==='tap'?target.tags.find(t=>t.startsWith('service:'))?.slice(8):undefined;
  const routes:Record<string,string>={shop:'/game/shop',workshop:'/game/workshop',village:'/game/village',activity:'/game/activity',event:'/game/event'};
  return { ok: true, message, speech, route:service?routes[service]:undefined, changed: result.facts.map(f => f.targetId) };
}


/** Color programs use the same paid transaction, simulation clock and social evidence as every other gesture. */
export function performFieldColor(operationId:string,targetId:string|undefined,pos:GridPos):FieldResult {
  const run=useRunStore().data,{world,space,player}=ensureField(run);
  enforceTamamoSubmission(run,world);
  if(!checkPlayer(run,world))return {ok:false,message:'집에서 눈을 떴다.',travel:true};
  if(run.ended||run.field!.encounter)return {ok:false,message:''};
  if(!Number.isInteger(pos.x)||!Number.isInteger(pos.y)||!space.tiles[pos.y]?.[pos.x]||space.tiles[pos.y]![pos.x]==='wall')
    return {ok:false,message:'닿을 수 없는 곳.'};
  const target=targetId?world.entities[targetId]:groundTarget(world,space,pos);
  if(!target||target.nodeId!==player.nodeId||target.carriedBy&&target.carriedBy!==player.id||!hasSight(world,player,target))
    return {ok:false,message:'대상이 보이지 않는다.'};
  const fresh=!world.entities[target.id],preview=fresh?{...world,entities:{...world.entities,[target.id]:target}}:world;
  const action=colorOperationAction(preview,player.id,target.id,operationId);
  const reason=colorOperationDisabled(preview,player.id,target.id,action);
  if(reason||!action)return {ok:false,message:reason??'변화 없음'};
  if(target.creature?.rank==='boss'&&!target.creature.engaged) {
    const locked=bossEncounterFailure(run,target);if(locked)return {ok:false,message:locked};
    beginBossEncounter(run,target,true);return {ok:false,message:''};
  }
  const before=target.properties.integrity??100;
  if(fresh)world.entities[target.id]=target;
  const result=resolveInteraction(world,player.id,target.id,action);
  if(!result.ok){if(fresh)delete world.entities[target.id];return {ok:false,message:result.reason??result.message};}
  for(const id of new Set(result.facts.filter(f=>f.kind==='move').map(f=>f.targetId)))triggerFieldInstallations(run,world,id);
  if(target.creature&&(target.properties.integrity??100)<before)target.creature.angry=true;
  grantPractice(run,operationId.endsWith(':out')?'strike':'tend',target,result);
  processSocialFacts(world);syncPlayerFromWorld(run,world);
  advanceFieldTime(STEP_SECONDS,false);
  return {ok:true,message:action.label,changed:result.facts.map(f=>f.targetId),targetId:target.id,targetPos:target.pos?{...target.pos}:pos};
}

/** Context help uses the same action construction and validation as actual input. */
export function fieldHints(run:RunState,world:InteractionWorld,target:WorldEntity|undefined,pos:GridPos) {
  const player=world.entities.player;if(!player)return [];
  if(!target)return [{id:'dash',label:'이동기 · ◆1'},{id:'tap',label:world.spaces?.[player.nodeId]?.exits.some(e=>distance(e.pos,pos)===0)?'길 따라가기':'주변 살피기'}];
  const service=target.tags.find(t=>t.startsWith('service:'));
  const tapLabel=target.recordId?'읽기':target.id==='player'?'쉬기':target.kind==='actor'?'대화':service?'들어가기':target.tags.includes('dungeon-entry')?'던전 들어가기':target.tags.includes('shelter')?'쉬기':target.workRecipe?'작업':target.tags.includes('life-site')?(lifeActions(run,world,'player',target.id)[0]?.label??'성장 중'):Object.values(target.stock).some(n=>n>0)?'가져오기':'살피기';
  const selectedSupply=run.field?.selectedItem&&SUPPLY_NAMES[run.field.selectedItem]?supplyAction(player,target,run.field.selectedItem):undefined;
  const options=[{id:'tap',label:tapLabel},{id:'lift',label:'들어 올리기'},{id:'place',label:'내려놓기'},{id:'strike',label:target.id==='player'?'방어':'힘 가하기'},{id:'tend',label:selectedSupply?.label??(target.id==='player'?'먹기':target.properties.soil?'심기 · 돌보기':'물 주기')},{id:'give',label:'건네기'}];
  if(selectedSupply)options.sort((a,b)=>Number(b.id==='tend')-Number(a.id==='tend'));
  return options.filter(h=>{
    if(h.id==='tap'&&target.creature)return false;
    const t=h.id==='place'?carriedEntity(world):target;if(!t)return false;
    const at=h.id==='place'&&player.pos&&distance(player.pos,pos)===0?cardinal(player.pos).find(p=>walkable(world,player.nodeId,p,t.id))??pos:pos;
    const action=fieldAction(run,world,player,t,h.id,at,run.field?.selectedItem);
    return !!action&&!interactionDisabled(world,'player',t.id,action);
  }).slice(0,target.creature?2:3).concat(target.creature||target.id==='player'?[{id:'dash',label:'이동기 · ◆1'}]:[]);
}
