import type { RunState } from '@/data/schemas';
import { useDataStore } from '@/stores/data';
import { actionRestriction } from './world/status';
import { resolveInteraction } from './world/engine';
import { distance, hasSight } from './world/spatial';
import type { FieldSpeech, FieldResult } from './field-types';
import type { WorldEntity } from './world/types';

export const HOME_COST: Readonly<Record<string,number>> = {'raw-fiber':12,'raw-stone':8,'i-material-common':4};
/** Construction accepts local mineral stock; fine ore supplies two masonry units. */
export const HOME_STONE_MATERIALS = [
 {id:'raw-stone',units:1},{id:'i-life-ore',units:1},{id:'i-life-ore-fine',units:2},
] as const;
export function homeBuildQuote(stock:Readonly<Record<string,number>>) {
 const costs:Record<string,number>={'raw-fiber':HOME_COST['raw-fiber']!,'i-material-common':HOME_COST['i-material-common']!};
 let remaining=HOME_COST['raw-stone']!;
 for(const material of HOME_STONE_MATERIALS) {
  const available=Math.max(0,Math.floor(stock[material.id]??0));
  const count=Math.min(available,Math.ceil(remaining/material.units));
  if(count>0){costs[material.id]=count;remaining=Math.max(0,remaining-count*material.units);}
 }
 return {costs,stoneMissing:remaining,ready:remaining===0&&Object.entries(costs).every(([id,n])=>(stock[id]??0)>=n)};
}
export const INN_PRICE = 10;
export const DAY_SECONDS = 86400;
export const MAJOR_TOWNS = ['n-iluneon-square','n-moss','n-manonickla','n-alimes','n-tacomi','n-martin-port'];
export const playerHomeId = (node:string) => node+'::player-home';
export const innId = (node:string) => node+'::inn';
export function initialHomeNode(run:RunState):string {
 const data=useDataStore(),map=data.nodeMaps.get(data.timelines.get(run.timelineId)?.nodeMapId??'');
 return map?.nodes.some(n=>n.id==='n-iluneon-square')?'n-iluneon-square':map?.startNodeId??run.currentNodeId.split('::')[0]!;
}
export function baseTown(run:RunState,nodeId:string):boolean {return MAJOR_TOWNS.includes(nodeId)||nodeId===initialHomeNode(run);}
export function ensureBases(run:RunState) {
 const field=run.field!;field.bases??={owned:{[initialHomeNode(run)]:true},rentals:{},lastHouse:run.currentNodeId.includes('::home:')?run.currentNodeId:playerHomeId(initialHomeNode(run)),knockouts:0};
 return field.bases;
}
export function baseEntryFailure(run:RunState,id:string):string|undefined {
 const bases=ensureBases(run),node=id.split('::')[0]!;
 if(id.endsWith('::player-home')&&!bases.owned[node])return '먼저 집을 지어야 한다.';
 if(id.endsWith('::inn')&&(bases.rentals[node]??0)<=run.field!.elapsedSeconds)return '숙박권이 필요하다.';
}
export function configurationFailure(run:RunState):string|undefined {
 if(!run.field)return;
 if(run.ended||run.hp<=0)return '지금은 변경할 수 없다.';
 const world=run.interactionWorld,player=world?.entities.player;
 if(!player||player.nodeId!==run.currentNodeId)return '거점 안에서 변경할 수 있다.';
 const blocked=actionRestriction(player);if(blocked)return blocked;
 if(run.field.encounter||run.field.skills?.pending||Object.values(world!.entities).some(e=>e.nodeId===player.nodeId&&e.creature&&(e.properties.integrity??100)>0&&hasSight(world!,player,e)))return '위험이 지나간 뒤 변경할 수 있다.';
 const base=run.field.bases,node=player.nodeId.split('::')[0]!;
 if(player.nodeId.endsWith('::player-home')&&base?.owned[node])return;
 if(player.nodeId.endsWith('::inn')&&(base?.rentals[node]??0)>run.field.elapsedSeconds)return;
 return '내 집이나 숙박 중인 여관에서 변경할 수 있다.';
}
export function rememberHouse(run:RunState,id:string) {
 if(id.includes('::home:')||id.endsWith('::player-home'))ensureBases(run).lastHouse=id;
}
/** The journey starts at noon. 00:00–08:59 wakes at 21:00 that day; otherwise next day 09:00. */
export function wakeTime(elapsed:number):number {
 const absolute=elapsed+43200,day=Math.floor(absolute/DAY_SECONDS),hour=(absolute%DAY_SECONDS)/3600;
 return (hour<9?day*DAY_SECONDS+21*3600:(day+1)*DAY_SECONDS+9*3600)-43200;
}
export function elapsedLabel(seconds:number):string {
 const minutes=Math.floor(Math.max(0,seconds)/60);
 return Math.floor(minutes/1440)+'일 '+Math.floor(minutes/60)%24+'시간 '+minutes%60+'분';
}
export function baseOffer(run:RunState,target:WorldEntity):FieldSpeech|undefined {
 const action=target.tags.includes('base:build')?'base:build':target.tags.includes('base:rent')?'base:rent':undefined;
 if(!action)return;
 const own=ensureBases(run).owned[target.nodeId.split('::')[0]!];
 if(action==='base:build'&&own)return;
 return {actorId:target.id,name:target.name,lines:[action==='base:build'?'이곳에 내 집을 지을 수 있다.':'하루 동안 쓸 방을 빌린다.'],topics:[{label:action==='base:build'?'집 짓기':'하루 숙박',lines:[action==='base:build'?'풀섬유 12 · 석재 8 · 일반 소재 4\n원석·광석은 1, 좋은 광석은 2로 센다.':'10 G · 결제부터 24시간'],confirmLabel:action==='base:build'?'소재를 써서 짓기':'10 G 지불',action}]};
}
export function purchaseBase(run:RunState,actorId:string,action:string):FieldResult {
 const world=run.interactionWorld!,player=world.entities.player!,target=world.entities[actorId];
 const fail=(message:string):FieldResult=>({ok:false,message});
 if(!target||!target.tags.includes(action)||!['base:build','base:rent'].includes(action)||!target.pos||!player.pos||target.nodeId!==player.nodeId||distance(target.pos,player.pos)>1||!hasSight(world,player,target)||(target.properties.integrity??100)<=0||actionRestriction(player))return fail('가까이에서 이용할 수 있다.');
 if(run.ended||run.field?.encounter||run.field?.skills?.pending||Object.values(world.entities).some(e=>e.nodeId===player.nodeId&&e.creature&&(e.properties.integrity??100)>0&&hasSight(world,player,e)))return fail('지금은 이용할 수 없다.');
 const node=target.nodeId.split('::')[0]!,bases=ensureBases(run);
 if(!baseTown(run,node))return fail('이곳에는 집을 지을 수 없다.');
 if(action==='base:build'){
  if(bases.owned[node])return fail('이미 내 집이 있다.');
  const quote=homeBuildQuote(player.stock);
  if(!quote.ready)return fail('풀섬유 12 · 석재 8 · 일반 소재 4 필요');
  const result=resolveInteraction(world,player.id,target.id,{id:'base-build',label:'집 짓기',description:'',duration:0,effects:Object.entries(quote.costs).map(([resourceId,n])=>({kind:'stock' as const,resourceId,amount:-n,side:'actor' as const}))});
  if(!result.ok)return fail(result.reason??result.message);
  bases.owned[node]=true;
  return {ok:true,message:'집이 완성되었다. 문으로 들어가자.'};
 }
 if((bases.rentals[node]??0)>run.field!.elapsedSeconds)return fail('아직 숙박권이 남아 있다.');
 if(run.gold<INN_PRICE)return fail('10 G가 필요하다.');
 run.gold-=INN_PRICE;bases.rentals[node]=run.field!.elapsedSeconds+DAY_SECONDS;
 return {ok:true,message:'방을 빌렸다. 하루 동안 사용할 수 있다.'};
}
