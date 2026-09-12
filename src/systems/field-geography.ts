import { regionDimensions, regionTerrain } from './field-biomes';
import type { Node, NodeMap } from '@/data/schemas';
import type { GridPos } from '@/data/schemas/base';
import type { FieldSpace, FieldTile } from './field-types';

export function fieldHash(text:string):number {let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
const spacing = new WeakMap<NodeMap,number>();
export function roadCount(map:NodeMap,from:Node,to:Node):number {
  let unit=spacing.get(map);
  if(!unit){const nodes=new Map(map.nodes.map(n=>[n.id,n]));const lengths=map.nodes.flatMap(n=>n.neighbors.map(id=>nodes.get(id)).filter((n):n is Node=>!!n).map(t=>Math.hypot(t.position.x-n.position.x,t.position.y-n.position.y))).filter(n=>n>0).sort((a,b)=>a-b);unit=lengths[Math.floor(lengths.length/2)]??1;spacing.set(map,unit);}
  return Math.max(0,Math.ceil(Math.hypot(from.position.x-to.position.x,from.position.y-to.position.y)/unit/2)-1);
}
export function roadId(a:string,b:string,index:number):string {return `road|${encodeURIComponent(a)}|${encodeURIComponent(b)}|${index}`;}
export function readRoad(id:string,map:NodeMap) {
  const [prefix,a,b,i]=id.split('|');if(prefix!=='road'||!a||!b)return;
  const from=map.nodes.find(n=>n.id===decodeURIComponent(a)),to=map.nodes.find(n=>n.id===decodeURIComponent(b));
  if(!from||!to||from.id>=to.id||!from.neighbors.includes(to.id)&&!from.conditionalNeighbors?.some(e=>e.nodeId===to.id)&&!to.neighbors.includes(from.id)&&!to.conditionalNeighbors?.some(e=>e.nodeId===from.id))return;
  const count=roadCount(map,from,to),index=Number(i);
  return Number.isInteger(index)&&index>=0&&index<count?{from,to,count,index}:undefined;
}
export function fieldConnection(map:NodeMap,from:Node,to:Node) {
  const count=roadCount(map,from,to),[a,b]=[from.id,to.id].sort();
  return {to:count?roadId(a!,b!,from.id===a?0:count-1):to.id,count};
}
export function fieldDimensions(node:Node,npcCount=0):{width:number;height:number} {return regionDimensions(node,npcCount);}
export function fieldTheme(node:Node):'town'|'forest'|'coast'|'volcanic'|'cave'|'meadow' {
  if(['village','shop','workshop'].includes(node.kind)||/식당|본부|길드|여관|광장/.test(node.label))return 'town';
  if(/mushroom|mine|castle/.test(node.region??'')||/동굴|갱도|지하/.test(node.label))return 'cave';
  if(/moss-north|triflower/.test(node.region??''))return 'volcanic';
  if(/coast|fishing|moss-south|martin/.test(node.region??'')||/해안|항구|나루|강변|호수/.test(node.label))return 'coast';
  if(/forest|alimes|diropel/.test(node.region??'')||/숲|수풀|나무/.test(node.label))return 'forest';
  return 'meadow';
}
export function terrainFor(node:Node,width:number,height:number,dungeon=false):FieldTile[][] {
 if(!dungeon)return regionTerrain(node,width,height,fieldHash(node.id));
 return Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>!x||!y||x===width-1||y===height-1?'wall':(x*7+y*3+fieldHash(node.id))%13===0?'wall':'stone'));
}
export function carvePath(space:FieldSpace,from:GridPos,to:GridPos) {
  let {x,y}=from;space.tiles[y]![x]='path';
  const horizontal=fieldHash(space.id)%2===0;
  while(x!==to.x||y!==to.y){if(horizontal&&x!==to.x||y===to.y)x+=Math.sign(to.x-x);else y+=Math.sign(to.y-y);space.tiles[y]![x]='path';}
}
export function boundaryFor(space:FieldSpace,dx:number,dy:number,used:readonly GridPos[]):GridPos {
  const horizontal=Math.abs(dx)>=Math.abs(dy);
  const points:GridPos[]=horizontal
    ? Array.from({length:space.height-2},(_,i)=>({x:dx>=0?space.width-1:0,y:i+1}))
    : Array.from({length:space.width-2},(_,i)=>({x:i+1,y:dy>=0?space.height-1:0}));
  const ideal=horizontal?(space.height-1)/2:(space.width-1)/2;
  return points.filter(p=>!used.some(q=>p.x===q.x&&p.y===q.y)).sort((a,b)=>Math.abs((horizontal?a.y:a.x)-ideal)-Math.abs((horizontal?b.y:b.x)-ideal))[0]!;
}
export function inward(space:FieldSpace,pos:GridPos):GridPos {
  return {x:pos.x===0?1:pos.x===space.width-1?-1:0,y:pos.y===0?1:pos.y===space.height-1?-1:0};
}
export function connectionVector(from:Node,to:Node) {
  const dx=to.position.x-from.position.x,dy=to.position.y-from.position.y;
  return dx||dy?{dx,dy}:{dx:from.id<to.id?1:-1,dy:0};
}
