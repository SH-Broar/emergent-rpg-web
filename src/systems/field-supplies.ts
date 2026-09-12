import { noteJourney } from './field-journey';
import type { RunState } from '@/data/schemas';
import type { WorldEntity,InteractionAction,InteractionWorld } from './world/types';
import { resolveInteraction } from './world/engine';
import { actionRestriction } from './world/status';
import { distance,hasSight } from './world/spatial';
export const SUPPLY_NAMES:Record<string,string>={'field-smoke':'연막 포자','field-salve':'수액 연고','field-spark':'전하 소금','field-wrap':'보강 붕대','field-springseed':'샘의 씨앗'};
export const SUPPLY_RECIPES=[
 {id:'smoke',name:'연막 포자',input:{'i-life-mush':1,'raw-fiber':1},output:{'field-smoke':2},effect:'시야를 가려 추격을 끊는다.'},
 {id:'salve',name:'수액 연고',input:{'raw-fiber':2,water:1},output:{'field-salve':1},effect:'체력 12 회복 · 재생 3턴'},
 {id:'spark',name:'전하 소금',input:{'i-life-charge':1,'i-life-ore':1},output:{'field-spark':2},effect:'전격 피해 · 젖은 대상에게 강하다.'},
 {id:'wrap',name:'보강 붕대',input:{'raw-fiber':1,'i-life-ore':1},output:{'field-wrap':1},effect:'방어 12 · 2턴간 유지'}
] as const;
export function supplyAction(actor:WorldEntity,target:WorldEntity,id:string):InteractionAction|undefined {
 if(!SUPPLY_NAMES[id]||(actor.stock[id]??0)<1)return;
 const effects:InteractionAction['effects']=[{kind:'stock',resourceId:id,amount:-1,side:'actor'}];
 if(id==='field-smoke')effects.push({kind:'influence',property:'smoke',amount:4});
 if(id==='field-spark')effects.push({kind:'influence',property:'charge',amount:14/(target.properties.maxHp??100)*100});
 if(id==='field-salve'){
  if(target.kind!=='actor'||(target.properties.integrity??100)>=100)return;
  effects.push({kind:'influence',property:'integrity',amount:12/(target.properties.maxHp??100)*100},{kind:'influence',property:'status:regen',amount:3});
 }
 if(id==='field-wrap'){
  if(target.kind!=='actor')return;
  effects.push({kind:'influence',property:'guard',amount:12},{kind:'influence',property:'status:ward',amount:2});
 }
 if(id==='field-springseed'){
  if(target.kind==='actor'||!target.properties.soil||target.production||target.properties.waterSource||Object.values(target.stock).some(n=>n>0))return;
  effects.push({kind:'influence',property:'waterSource',amount:1});
 }
 return {id:'supply:'+id,label:id==='field-springseed'?'심기':id==='field-smoke'||id==='field-spark'?'뿌리기':'사용',description:'',duration:0,reach:id==='field-smoke'||id==='field-spark'?3:1,requires:{min:{integrity:1}},effects};
}
export function supplyStation(e:WorldEntity){return e.workRecipe||e.tags.includes('workshop')||e.tags.includes('brazier')||e.agent?.profession==='Craftsman';}
export function craftSupply(run:RunState,world:InteractionWorld,stationId:string,recipeId:string){
 const actor=world.entities.player,station=world.entities[stationId],recipe=SUPPLY_RECIPES.find(r=>r.id===recipeId);
 if(!actor||!station||!recipe||!supplyStation(station)||station.nodeId!==actor.nodeId||!actor.pos||!station.pos||distance(actor.pos,station.pos)>1||!hasSight(world,actor,station)||(station.properties.integrity??0)<=0||actionRestriction(actor)||(station.kind==='actor'&&!!actionRestriction(station))||run.ended||run.field?.encounter)return {ok:false,message:'작업대나 화로 가까이에서 만들 수 있다.'};
 const effects:InteractionAction['effects']=[...Object.entries(recipe.input).map(([resourceId,n])=>({kind:'stock' as const,side:'actor' as const,resourceId,amount:-n})),...Object.entries(recipe.output).map(([resourceId,n])=>({kind:'stock' as const,side:'actor' as const,resourceId,amount:n}))];
 const result=resolveInteraction(world,actor.id,station.id,{id:'craft-supply:'+recipe.id,label:recipe.name,description:'',duration:0,requires:{min:{integrity:1}},effects});
 if(result.ok){noteJourney(run,'crafted');for(const [id,n]of Object.entries(recipe.output))noteJourney(run,'crafted:'+id,n);}
 return {ok:result.ok,message:result.ok?recipe.name+' 완성':result.reason??'재료가 부족하다.'};
}
