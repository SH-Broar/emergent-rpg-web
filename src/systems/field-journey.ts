import type { RunState } from '@/data/schemas';
import type { FieldSpace, FieldSpeech, FieldResult } from './field-types';
import type { InteractionWorld, WorldEntity, PrimitiveEffect } from './world/types';
import { useDataStore } from '@/stores/data';
import { useRunStore } from '@/stores/run';
import { instantiateCard } from './deck';
import { resolveInteraction } from './world/engine';
import { actionRestriction } from './world/status';
import { distance, hasSight } from './world/spatial';
import { chaosStoryAvailable, livingTimeAlly, TIME_ALLIES } from './time-story';
import { JOURNEY_QUESTS, type JourneyQuest, type JourneyGoal } from '@/data/journey-quests';
import { TIME_TESTIMONIES } from '@/data/time-testimonies';

export interface JourneyState {
  accepted: Record<string, number>;
  completed: Record<string, number>;
  counts: Record<string, number>;
  visited: Record<string, boolean>;
  decisions?: Record<string, string>;
  readings?: Record<string, { at: number; lines: string[]; recovered?: boolean }>;
  testimonies?: Record<string, { at: number; source: string; written: boolean }>;
}
export function ensureJourney(run: RunState): JourneyState {
  const state = run.field!.journey ??= { accepted: {}, completed: {}, counts: {}, visited: {} };
  state.decisions ??= {}; state.readings ??= {}; state.testimonies ??= {};
  return state;
}
export function noteJourney(run: RunState, key: string, amount = 1) {
  if (!run.field) return;
  const state = ensureJourney(run);
  state.counts[key] = (state.counts[key] ?? 0) + amount;
}
export function questAvailable(run: RunState, q: JourneyQuest) {
  const state = run.field?.journey;
  return !state?.completed[q.id] && (!q.after || q.after.every(id => !!state?.completed[id]));
}
export function goalApplies(run: RunState, g: JourneyGoal): boolean {
  return !g.whenChoice || run.field?.journey?.decisions?.[g.whenChoice.questId] === g.whenChoice.choiceId;
}
export function goalProgress(run: RunState, g: JourneyGoal): number {
  if (!goalApplies(run, g)) return g.amount ?? 1;
  if (g.kind === 'ally') return livingTimeAlly(run, g.key) ? 1 : 0;
  const state = run.field?.journey;
  if (g.kind === 'visit') return state?.visited[g.key] || run.nodeStates[g.key]?.visited ? 1 : 0;
  if (g.kind === 'talk') return g.testimony ? (state?.testimonies?.[g.testimony] ? 1 : 0) : (run.field?.spoken['npc:' + g.key] ?? 0) > 0 ? 1 : 0;
  if (g.kind === 'deliver') return run.interactionWorld?.entities.player?.stock[g.key] ?? 0;
  if (g.kind === 'dungeon') return run.field?.completedDungeons.length ?? 0;
  if (g.kind === 'boss') return run.bossesCleared.includes(g.key) || run.arcsCleared?.includes(g.key) ? 1 : 0;
  if (g.kind === 'read') return state?.readings?.[g.key] ? 1 : 0;
  return state?.counts[g.key] ?? 0;
}
export const questGoalsReady = (run: RunState, q: JourneyQuest) => q.goals.every(g => goalProgress(run, g) >= (g.amount ?? 1));
export const questReady = (run: RunState, q: JourneyQuest) => questGoalsReady(run, q) &&
  (!q.choices?.length || q.choices.some(c => c.id === run.field?.journey?.decisions?.[q.id]));
export function currentJourney(run: RunState) {
  const available = JOURNEY_QUESTS.filter(q => q.main && questAvailable(run, q));
  const first = run.field?.journey?.decisions?.['time-13'];
  const preferred = first === 'tifre' ? ['time-09','time-10','time-11','time-12'] : ['time-05','time-06','time-07','time-08'];
  return available.find(q => preferred.includes(q.id)) ?? available[0] ??
    JOURNEY_QUESTS.find(q => ['home', 'first-shape', 'fibers', 'provisions'].includes(q.id) && questAvailable(run, q));
}
const REMAINS_PREFIX = 'quest-remains:';
export function questRemainsNpc(run: RunState, actor: WorldEntity): string | undefined {
  if (!actor.id.startsWith(REMAINS_PREFIX) || actor.recordId !== actor.id || !actor.tags.includes('quest-remains')) return;
  const npcId = actor.id.slice(REMAINS_PREFIX.length), source = run.interactionWorld?.entities['npc:' + npcId];
  return source && !TIME_ALLIES.includes(npcId as typeof TIME_ALLIES[number]) && (source.properties.integrity ?? 100) <= 0 ? npcId : undefined;
}
function questActorNpc(run: RunState, actor: WorldEntity) {
  return actor.npcId && (actor.properties.integrity ?? 100) > 0 ? actor.npcId : questRemainsNpc(run, actor);
}
/** Dead bodies stay dead. Their existing papers are a separate, inspectable object at the actual death site. */
export function ensureQuestRemains(run: RunState, world: InteractionWorld, space: FieldSpace,
  place: (world: InteractionWorld, space: FieldSpace, entity: WorldEntity, pos: {x:number;y:number}) => WorldEntity) {
  if (!run.field || run.ended) return;
  const relevant = new Set(JOURNEY_QUESTS.flatMap(q => [q.npcId, q.turnInNpcId ?? q.npcId, ...q.goals.filter(g => g.kind === 'talk').map(g => g.key)]));
  for (const source of Object.values(world.entities)) {
    if (!source.npcId || TIME_ALLIES.includes(source.npcId as typeof TIME_ALLIES[number]) || !relevant.has(source.npcId) || source.nodeId !== space.id || (source.properties.integrity ?? 100) > 0) continue;
    const id = REMAINS_PREFIX + source.npcId;
    if (world.entities[id]) continue;
    place(world, space, { id, recordId: id, name: source.name + '의 유품', kind: 'resource', nodeId: space.id,
      tags: ['record','quest-remains'], colors: {}, stock: {}, properties: { integrity: 100, portable: 1, mass: 1, hardness: 4 },
    }, source.pos ?? space.spawn);
  }
}
/** Shared local access check for evidence and service actions; never accepts a remote or hidden target. */
export function canInspectQuestEntity(run: RunState, world: InteractionWorld, actor: WorldEntity): boolean {
  const player = world.entities.player;
  const pos = actor.pos ?? (actor.carriedBy === player?.id ? player.pos : undefined);
  return !!(player?.pos && pos && !run.ended && !run.field?.encounter && (player.properties.integrity ?? 0) > 0 &&
    !actionRestriction(player) && actor.nodeId === player.nodeId && (!actor.carriedBy || actor.carriedBy === player.id) &&
    distance(pos, player.pos) <= 1 && hasSight(world, player, actor));
}
function recordReports(q: JourneyQuest, actor: WorldEntity) {
  return !!actor.recordId && q.reportRecords?.includes(actor.recordId);
}
function questAccessible(run: RunState, q: JourneyQuest, actor: WorldEntity, accepting: boolean) {
  return questActorNpc(run, actor) === (accepting ? q.npcId : q.turnInNpcId ?? q.npcId) || recordReports(q, actor);
}
export function questMarker(run: RunState, npcId?: string) {
  if (!npcId) return '';
  const state = run.field?.journey;
  const available = JOURNEY_QUESTS.filter(q => (state?.accepted[q.id] ? q.turnInNpcId ?? q.npcId : q.npcId) === npcId && questAvailable(run, q));
  return available.some(q => state?.accepted[q.id] && questGoalsReady(run, q)) ? '✓' : available.some(q => !state?.accepted[q.id]) ? '!' : '';
}
export function questTopics(run: RunState, actor: WorldEntity): NonNullable<FieldSpeech['topics']> {
  const npcId = questActorNpc(run, actor), written = !actor.npcId;
  const topics: NonNullable<FieldSpeech['topics']> = [];
  for (const q of JOURNEY_QUESTS.filter(q => questAvailable(run, q))) {
    const accepted = !!run.field?.journey?.accepted[q.id];
    if (accepted) for (const g of q.goals) {
      const testimony = g.testimony && TIME_TESTIMONIES[g.testimony];
      if (testimony && g.key === npcId && !goalProgress(run,g)) topics.push({
        label: written ? testimony.label + ' · 남은 메모' : testimony.label, lines: [],
        action: 'quest:testimony:' + q.id + ':' + g.testimony, confirmLabel: written ? '메모를 읽는다' : '이야기를 듣는다',
      });
    }
    if (!questAccessible(run, q, actor, !accepted)) continue;
    if (!accepted) { topics.push({ label: q.title, lines: written ? [q.reminder] : q.offer, action: 'quest:accept:' + q.id,
      confirmLabel: written ? '조사를 이어간다' : q.completeOnAccept && questGoalsReady(run,q) ? '준비를 마친다' : '부탁을 받는다' }); continue; }
    if (questGoalsReady(run, q)) {
      if (q.choices?.length && !questReady(run,q)) topics.push(...q.choices.filter(c => !c.requiresChaos || chaosStoryAvailable(run)).map(c => ({
        label: c.label, lines: [], action: 'quest:choose:' + q.id + ':' + c.id, confirmLabel: written ? '수첩에 적는다' : '이렇게 말한다',
      })));
      else topics.push({label:q.title+' ✓',lines:[],action:'quest:finish:'+q.id,confirmLabel:written?'조사 기록을 정리한다':'이야기한다'});
    } else topics.push({label:q.title,lines:[q.reminder]});
  }
  return topics;
}
function grantCard(run: RunState, id: string, first = false) {
  const definition = useDataStore().cards.get(id); if (!definition) return;
  const card = instantiateCard(definition), collection = run.transform?.field ? run.transform.stashCollection : run.collection;
  collection.push(card);
  if (first && !run.transform?.field && run.field?.skills && !run.field.skills.slots.corner) run.field.skills.slots.corner = card.instanceId;
}
function awardQuest(run: RunState, world: InteractionWorld, recipient: WorldEntity, q: JourneyQuest, choiceStock: Record<string,number> = {}): FieldResult {
  const written = !recipient.npcId, target = written ? world.entities.player! : recipient;
  const effects: PrimitiveEffect[] = q.goals.filter(g => goalApplies(run,g) && g.kind === 'deliver').map(g => written ?
    {kind:'stock',resourceId:g.key,amount:-(g.amount??1),side:'actor'} : {kind:'transfer',resourceId:g.key,quantity:g.amount??1,from:'actor',to:'target'});
  for (const stock of [q.reward.stock ?? {},choiceStock]) for (const [resourceId,amount] of Object.entries(stock)) effects.push({kind:'stock',resourceId,amount,side:'actor'});
  const finish = written ? q.reportText ?? '남겨진 기록과 준비를 정리했다. 다음 일을 이어갈 수 있다.' : q.finish;
  effects.push({kind:'signal',message:finish});
  const result = resolveInteraction(world,'player',target.id,{id:q.id,label:q.title,description:'',duration:0,effects});
  if (!result.ok) return result;
  ensureJourney(run).completed[q.id] = run.field!.elapsedSeconds + 1;
  useRunStore().gainXp(q.reward.xp ?? 0);
  if (q.reward.life) useRunStore().addLifeXp(q.reward.life);
  if (q.reward.card) grantCard(run,q.reward.card);
  const relation = recipient.agent?.relations.player;
  if (relation) { relation.trust=Math.min(1,relation.trust+.04); relation.regard=Math.min(1,relation.regard+.06); }
  return {ok:true,message:q.reward.card?(useDataStore().cards.get(q.reward.card)?.name??'새 기술')+' 획득':'부탁 완료 · 경험 +'+(q.reward.xp??0),
    speech:{actorId:recipient.id,name:recipient.name,lines:[finish]}};
}
export function performQuest(run: RunState, world: InteractionWorld, actorId: string, action: string) {
  const [,verb,id,choiceId] = action.split(':'), q=JOURNEY_QUESTS.find(q=>q.id===id), actor=world.entities[actorId];
  const testimonyGoal = q?.goals.find(g=>g.testimony===choiceId), testimony=choiceId&&TIME_TESTIMONIES[choiceId];
  const access = q && actor && (verb==='testimony' ? testimonyGoal?.key===questActorNpc(run,actor) : questAccessible(run,q,actor,verb==='accept'));
  if (!q || !actor || !access || !canInspectQuestEntity(run,world,actor) ||
    actor.npcId && ((actor.properties.integrity??0)<=0 || actor.routine?.travel || actionRestriction(actor) || (actor.agent?.relations.player?.trust??0)<-.25) ||
    !questAvailable(run,q)) return {ok:false,message:'지금은 기록을 확인하거나 이야기를 나눌 수 없다.'};
  const state=ensureJourney(run), written=!actor.npcId;
  if (verb==='testimony') {
    if (!state.accepted[q.id] || !testimony || !testimonyGoal || state.testimonies![choiceId!]) return {ok:false,message:'지금 확인할 증언이 아니다.'};
    const result=resolveInteraction(world,'player',actor.id,{id:'testimony:'+choiceId,label:testimony.label,description:'',duration:0,
      effects:[{kind:'signal',message:testimony.lines[0]??testimony.label}]});
    if (!result.ok) return result;
    state.testimonies![choiceId!] = {at:run.field!.elapsedSeconds+1,source:actor.id,written};
    return {ok:true,message:'증언을 수첩에 남겼다.',speech:{actorId,name:actor.name,
      lines:written?['접힌 메모에 남은 대목을 옮겨 적었다.',...testimony.lines]:[...testimony.lines]}};
  }
  if (verb==='accept') {
    if (state.accepted[q.id]) return {ok:false,message:'이미 받은 부탁이다.'};
    state.accepted[q.id]=run.field!.elapsedSeconds+1;
    if (q.lessonCard) grantCard(run,q.lessonCard,true);
    if (q.completeOnAccept && questReady(run,q)) {
      const result=awardQuest(run,world,actor,q);
      if (!result.ok) delete state.accepted[q.id];
      return result;
    }
    return {ok:true,message:q.lessonCard?(useDataStore().cards.get(q.lessonCard)?.name??'새 기술')+' 획득':'부탁을 수첩에 적었다.',
      speech:{actorId,name:actor.name,lines:written?['남겨진 메모에서 다음 일을 확인했다.',q.reminder]:[q.reminder]}};
  }
  if (verb==='choose') {
    const choice=q.choices?.find(c=>c.id===choiceId);
    if (!choice || choice.requiresChaos&&!chaosStoryAvailable(run) || !state.accepted[q.id] || !questGoalsReady(run,q) || state.decisions![q.id]) return {ok:false,message:'먼저 확인할 일이 남아 있다.'};
    state.decisions![q.id]=choice.id;
    const result=awardQuest(run,world,actor,q,choice.stock);
    if (!result.ok) delete state.decisions![q.id];
    return result.ok?{...result,speech:{actorId,name:actor.name,lines:[written?'수첩에 적었다: '+choice.label:choice.reply,...(result.speech?.lines??[])]}}:result;
  }
  if (verb!=='finish' || !state.accepted[q.id] || !questReady(run,q)) return {ok:false,message:'아직 마치지 못한 일이 있다.'};
  return awardQuest(run,world,actor,q);
}
/** Called only after the actual final victory. */
export function completeBossQuests(run: RunState, world: InteractionWorld, bossId: string) {
  if (!run.field || run.ended || !world.entities.player || !run.bossesCleared.includes(bossId)) return;
  for (const q of JOURNEY_QUESTS) if (q.completeOnBoss===bossId && run.field.journey?.accepted[q.id] && questAvailable(run,q) && questReady(run,q))
    awardQuest(run,world,world.entities.player,q);
}
