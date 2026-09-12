import type { RunState } from '@/data/schemas';
import type { InteractionWorld,WorldEntity } from './world/types';
import { actionRestriction,status } from './world/status';
import { distance,hasSight } from './world/spatial';
import { isFoodResource } from './world/resources';
import { nextCreaturePosition,planAttack } from './field-combat';

/** Planning never moves an entity or spends a turn. The plan survives saving and player movement. */
export function prepareCreatureIntent(run:RunState,world:InteractionWorld,e:WorldEntity) {
 const c=e.creature,player=world.entities.player;
 if(!c||!e.pos||!player?.pos||e.nodeId!==player.nodeId||(e.properties.integrity??100)<=0)return;
 c.recovery=0;c.tempoStep=0;
 const blocked=actionRestriction(e);
 if(blocked){c.nextAction={kind:'wait',label:blocked};return;}
 if(c.pending){c.nextAction=undefined;c.intent=c.pending.cells.map(c=>({...c.pos}));return;}
 if(c.nextAction&&c.nextAction.kind!=='wait'&&!(c.nextAction.kind==='encounter'&&c.engaged))return;
 c.nextAction=undefined;c.intent=undefined;
 const food=!c.angry&&c.rank==='normal'?Object.values(world.entities).filter(t=>t.nodeId===e.nodeId&&t.pos&&!t.carriedBy&&t.kind!=='actor'&&(t.properties.integrity??100)>0&&Object.entries(t.stock).some(([id,n])=>n>0&&isFoodResource(id))&&distance(e.pos!,t.pos)<=5&&hasSight(world,e,t)).sort((a,b)=>distance(e.pos!,a.pos!)-distance(e.pos!,b.pos!))[0]:undefined;
 if(food){
  if(distance(e.pos,food.pos!)<=1)c.nextAction={kind:'eat',label:'먹기',targetId:food.id,resourceId:Object.keys(food.stock).find(id=>food.stock[id]!>0&&isFoodResource(id))};
  else {const pos=nextCreaturePosition(world,e,food.pos!);c.nextAction=pos?{kind:'move',label:'먹이로 이동',pos:{...pos}}:{kind:'wait',label:'길 막힘'};}
  return;
 }
 if(!hasSight(world,e,player)||distance(e.pos,player.pos)>(world.spaces![e.nodeId]?.dungeon?12:6)){c.nextAction={kind:'wait',label:'경계'};return;}
 if(c.rank==='boss'&&!c.engaged){c.nextAction={kind:(c.challengeAfter??0)>run.field!.elapsedSeconds?'wait':'encounter',label:(c.challengeAfter??0)>run.field!.elapsedSeconds?'경계':'대화'};return;}
 const attack=planAttack(world,e,player);
 if(attack){
  const delay=Math.min(2,status(e,'drowsy')+status(e,'slowed'));attack.remaining+=delay;
  c.pending=attack;c.intent=attack.cells.map(c=>({...c.pos}));return;
 }
 const pos=nextCreaturePosition(world,e,player.pos);
 c.nextAction=pos?{kind:'move',label:'이동',pos:{...pos}}:{kind:'wait',label:'길 막힘'};
}
export function creatureIntent(e:WorldEntity):{glyph:string;label:string} {
 const c=e.creature;if(!c)return {glyph:'',label:''};
 if(c.nextAction?.kind==='wait')return {glyph:'…',label:c.nextAction.label};
 if(c.pending)return {glyph:'⚔'+c.pending.remaining,label:c.pending.name+' · '+c.pending.remaining+'턴'};
 const next=c.nextAction;
 if(next?.kind==='move'&&next.pos&&e.pos){
  const x=Math.sign(next.pos.x-e.pos.x),y=Math.sign(next.pos.y-e.pos.y);
  return {glyph:y<0?x<0?'↖':x>0?'↗':'↑':y>0?x<0?'↙':x>0?'↘':'↓':x<0?'←':'→',label:next.label};
 }
 return {glyph:next?.kind==='eat'?'◉':next?.kind==='encounter'?'●':'…',label:next?.label??'경계'};
}
