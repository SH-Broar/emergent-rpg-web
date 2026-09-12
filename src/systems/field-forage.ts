import type { Node,RunState } from '@/data/schemas';
import type { FieldSpace } from './field-types';
import type { InteractionWorld,WorldEntity } from './world/types';
import { activityForNode,cropForActivity } from './life-catalog';
import { useDataStore } from '@/stores/data';
import { distance,walkable,positionKey } from './world/spatial';
import { inward } from './field-geography';
export const SPRING_SEED_PLACES=['n-lar-inner-pool','n-limun-ruins'] as const;
export function resourceGauge(e:WorldEntity){
 if(!e.tags.includes('forage')&&!e.renewable)return;
 const capacity=e.properties.harvestCapacity??e.renewable?.capacity??1;
 const remaining=e.renewable?e.stock[e.renewable.resourceId]??0:Object.values(e.stock).reduce((a,b)=>a+b,0);
 return {remaining,capacity:Math.max(capacity,remaining),ratio:Math.min(1,remaining/Math.max(1,capacity))};
}
/** A patch is several independent inventories; depletion, destruction and renewal remain real world state. */
export function ensureForage(run:RunState,world:InteractionWorld,space:FieldSpace,node:Node){
 if(space.forageVersion||space.dungeon||space.road||space.residence)return;
 space.forageVersion=1;
 const rare=(SPRING_SEED_PLACES as readonly string[]).includes(node.id);
 if(node.kind!=='gather'&&!rare)return;
 const activity=activityForNode(node.id,node.region),crop=cropForActivity(activity),resource=activity.lowerItemId??crop?.lowerItemId??'i-crop-grain';
 const original=world.entities['life:'+node.id];
 const base=activity.type==='repeat'&&original&&!original.production?original:undefined;
 const occupied=new Set(Object.values(world.entities).filter(e=>e.nodeId===space.id&&e.pos&&!e.carriedBy&&e.id!==base?.id&&e.kind!=='terrain'&&(e.properties.integrity??100)>0).map(e=>positionKey(e.pos!)));
 for(const e of space.exits){occupied.add(positionKey(e.pos));const d=inward(space,e.pos);occupied.add(positionKey({x:e.pos.x+d.x,y:e.pos.y+d.y}));}occupied.add(positionKey(space.spawn));
 const free=(x:number,y:number)=>x>0&&y>0&&x<space.width-1&&y<space.height-1&&!occupied.has(x+','+y)&&walkable(world,space.id,{x,y},base?.id);
 const groups=[[[0,0],[1,0],[0,1],[1,1]],[[0,0],[1,0],[2,0]],[[0,0],[0,1],[0,2]],[[0,0],[1,0]],[[0,0]]];
 let positions:{x:number;y:number}[]=[];
 for(const offsets of groups){for(let y=1;y<space.height-1&&!positions.length;y++)for(let x=1;x<space.width-1&&!positions.length;x++)if(offsets.every(([dx,dy])=>free(x+dx!,y+dy!)))positions=offsets.map(([dx,dy])=>({x:x+dx!,y:y+dy!}));if(positions.length)break;}
 const mineral=['iron','electric'].includes(activity.element),name=useDataStore().items.get(resource)?.name??'들풀';
 for(const [i,pos]of positions.entries()){
  const id=base&&i===0?base.id:space.id+':forage:'+i;
  let e=world.entities[id];
  if(!e){e={id,name:mineral?name+' 광맥':name+' 군락',kind:'resource',nodeId:space.id,pos,colors:{[activity.element]:50},tags:['forage',mineral?'mineral':'brush','region:'+node.region],properties:{integrity:100,harvestCapacity:2,flammability:mineral?0:2},stock:{[resource]:2},renewable:{resourceId:resource,capacity:2,interval:100,nextTurn:world.turn+100},fieldUpdatedAt:run.field?.elapsedSeconds??0};world.entities[id]=e;}
  e.pos=pos;e.properties.harvestCapacity=2;if(!e.tags.includes('forage'))e.tags.push('forage');
  if(e.renewable){e.renewable.interval=100;e.renewable.nextTurn=Math.max(e.renewable.nextTurn,world.turn+100);}occupied.add(positionKey(pos));
 }
 if(rare&&!world.entities[space.id+':spring-seed']){
  const candidates=[];for(let y=1;y<space.height-1;y++)for(let x=1;x<space.width-1;x++)if(free(x,y))candidates.push({x,y});
  const pos=candidates.sort((a,b)=>distance(b,space.spawn)-distance(a,space.spawn))[0];
  if(pos){const id=space.id+':spring-seed';world.entities[id]={id,name:'샘의 씨앗',kind:'resource',nodeId:space.id,pos,colors:{water:70,earth:30},tags:['forage','rare-source','storage'],properties:{integrity:100,harvestCapacity:1},stock:{'field-springseed':1}};}
 }
}
