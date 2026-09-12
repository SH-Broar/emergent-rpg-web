import type { RunState } from '@/data/schemas';
import type { FieldSpeech } from './field-types';
import type { InteractionWorld, WorldEntity, PrimitiveEffect } from './world/types';
import { useDataStore } from '@/stores/data';
import { useRunStore } from '@/stores/run';
import { instantiateCard } from './deck';
import { resolveInteraction } from './world/engine';
import { actionRestriction } from './world/status';
import { distance, hasSight } from './world/spatial';
import { JOURNEY_QUESTS, type JourneyQuest, type JourneyGoal } from '@/data/journey-quests';

export interface JourneyState {
  accepted: Record<string, number>;
  completed: Record<string, number>;
  counts: Record<string, number>;
  visited: Record<string, boolean>;
}
export function ensureJourney(run:RunState):JourneyState {
  return run.field!.journey??={accepted:{},completed:{},counts:{},visited:{}};
}
export function noteJourney(run:RunState,key:string,amount=1) {
  if(!run.field)return;
  const state=ensureJourney(run);state.counts[key]=(state.counts[key]??0)+amount;
}
export function questAvailable(run:RunState,q:JourneyQuest) {
  const state=run.field?.journey;
  return !state?.completed[q.id] && (!q.after||q.after.every(id=>!!state?.completed[id]));
}
export function goalProgress(run:RunState,g:JourneyGoal):number {
  const state=run.field?.journey;
  if(g.kind==='visit')return state?.visited[g.key]||run.nodeStates[g.key]?.visited?1:0;
  if(g.kind==='talk')return (run.field?.spoken['npc:'+g.key]??0)>0?1:0;
  if(g.kind==='deliver')return run.interactionWorld?.entities.player?.stock[g.key]??0;
  if(g.kind==='dungeon')return run.field?.completedDungeons.length??0;
  return state?.counts[g.key]??0;
}
export const questReady = (run:RunState,q:JourneyQuest) => q.goals.every(g=>goalProgress(run,g)>=(g.amount??1));
export function currentJourney(run:RunState) {
  return JOURNEY_QUESTS.find(q=>q.main && questAvailable(run,q));
}
export function questMarker(run:RunState,npcId?:string) {
  if(!npcId)return '';
  const state=run.field?.journey;
  const available=JOURNEY_QUESTS.filter(q=>(state?.accepted[q.id]?(q.turnInNpcId??q.npcId):q.npcId)===npcId&&questAvailable(run,q));
  return available.some(q=>state?.accepted[q.id]&&questReady(run,q))?'✓':available.some(q=>!state?.accepted[q.id])?'!':'';
}
export function questTopics(run:RunState,actor:WorldEntity):NonNullable<FieldSpeech['topics']> {
  return JOURNEY_QUESTS.filter(q=>(run.field?.journey?.accepted[q.id]?(q.turnInNpcId??q.npcId):q.npcId)===actor.npcId&&questAvailable(run,q)).map(q=>{
    const accepted=!!run.field?.journey?.accepted[q.id];
    if(!accepted)return {label:q.title,lines:q.offer,action:'quest:accept:'+q.id,confirmLabel:'부탁을 받는다'};
    if(questReady(run,q))return {label:q.title+' ✓',lines:[],action:'quest:finish:'+q.id,confirmLabel:'이야기한다'};
    return {label:q.title,lines:[q.reminder]};
  });
}
function grantCard(run:RunState,id:string,first=false) {
  const definition=useDataStore().cards.get(id);if(!definition)return;
  const card=instantiateCard(definition);
  // A restored body receives this card from its sealed collection.
  const collection=run.transform?.field?run.transform.stashCollection:run.collection;
  collection.push(card);
  if(first&&!run.transform?.field&&run.field?.skills&&!run.field.skills.slots.corner)run.field.skills.slots.corner=card.instanceId;
}
export function performQuest(run:RunState,world:InteractionWorld,actorId:string,action:string) {
  const [,verb,id]=action.split(':'),q=JOURNEY_QUESTS.find(q=>q.id===id),actor=world.entities[actorId],player=world.entities.player;
  if(!q||!actor||!player||actor.npcId!==(verb==='finish'?(q.turnInNpcId??q.npcId):q.npcId)||!actor.pos||!player.pos||actor.nodeId!==player.nodeId||actor.routine?.travel||distance(actor.pos,player.pos)>1||!hasSight(world,player,actor)||(actor.properties.integrity??0)<=0||actionRestriction(actor)||actionRestriction(player)||(actor.agent?.relations.player?.trust??0)<-.25||!questAvailable(run,q))return {ok:false,message:'지금은 이야기를 나눌 수 없다.'};
  const state=ensureJourney(run),stamp=run.field!.elapsedSeconds+1;
  if(verb==='accept'){
    if(state.accepted[q.id])return {ok:false,message:'이미 받은 부탁이다.'};
    state.accepted[q.id]=stamp;
    if(q.lessonCard)grantCard(run,q.lessonCard,true);
    return {ok:true,message:q.lessonCard?'밀어내는 빛을 받았다.':'부탁을 수첩에 적었다.',speech:{actorId,name:actor.name,lines:[q.reminder]}};
  }
  if(verb!=='finish'||!state.accepted[q.id]||!questReady(run,q))return {ok:false,message:'아직 마치지 못한 일이 있다.'};
  const effects:PrimitiveEffect[]=q.goals.filter(g=>g.kind==='deliver').map(g=>({kind:'transfer',resourceId:g.key,quantity:g.amount??1,from:'actor',to:'target'}));
  for(const [resourceId,amount] of Object.entries(q.reward.stock??{}))effects.push({kind:'stock',resourceId,amount,side:'actor'});
  effects.push({kind:'signal',message:q.finish});
  const result=resolveInteraction(world,player.id,actor.id,{id:q.id,label:q.title,description:'',duration:0,effects});
  if(!result.ok)return result;
  state.completed[q.id]=stamp;
  useRunStore().gainXp(q.reward.xp??0);
  if(q.reward.life)useRunStore().addLifeXp(q.reward.life);
  if(q.reward.card)grantCard(run,q.reward.card);
  const relation=actor.agent?.relations.player;
  if(relation){relation.trust=Math.min(1,relation.trust+.04);relation.regard=Math.min(1,relation.regard+.06);}
  return {ok:true,message:q.reward.card?(useDataStore().cards.get(q.reward.card)?.name??'새 기술')+' 획득':'부탁 완료 · 경험 +'+(q.reward.xp??0),speech:{actorId,name:actor.name,lines:[q.finish]}};
}
