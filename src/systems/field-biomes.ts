import type { Node } from '@/data/schemas';
import type { FieldTile } from './field-types';
export type Landform='plaza'|'grove'|'ridge'|'coast'|'canyon'|'plain'|'alpine'|'cloister'|'cavern'|'works';
const REGIONS:Record<string,Landform>={iluneon:'plaza','lar-forest':'grove','moss-north':'ridge','moss-south':'coast',manonickla:'canyon',riagralta:'plain',alimes:'alpine',luna:'cloister',tacomi:'plaza','demon-windfall':'canyon',martin:'coast',enicham:'works',reshud:'plain',yusezria:'grove',triflower:'ridge','falcon-garden':'coast',tradepost:'plain',diropel:'grove','coral-coast':'coast',oldshrine:'cloister','starlight-plateau':'alpine','mushroom-cave':'cavern','fishing-village':'coast','mine-shaft':'cavern','demon-castle':'cloister'};
export function landform(node:Node):Landform {return /협곡|절곡/.test(node.label)?'canyon':REGIONS[node.region??'']??'plain';}
export function regionDimensions(node:Node,npcCount=0){
 const kind=landform(node),town=node.kind==='village';
 if(town)return kind==='canyon'||kind==='coast'?{width:12,height:8}:{width:npcCount>5?12:10,height:10};
 if(npcCount>3)return {width:9,height:9};
 const large=['combat','elite','boss'].includes(node.kind),extra=large?1:0;
 const sizes:Record<Landform,[number,number]>={plaza:[6,6],grove:[7,8],ridge:[8,7],coast:[10,6],canyon:[10,6],plain:[8,7],alpine:[6,10],cloister:[8,8],cavern:[9,6],works:[8,8]};
 const [width,height]=sizes[kind];return {width:width+extra,height:height+extra};
}
/** Landforms have traversable centres; existing exit carving connects every authored road. */
export function regionTerrain(node:Node,width:number,height:number,seed:number):FieldTile[][] {
 const kind=landform(node),town=node.kind==='village',cx=Math.floor(width/2),cy=Math.floor(height/2);
 return Array.from({length:height},(_,y)=>Array.from({length:width},(_,x):FieldTile=>{
  if(!x||!y||x===width-1||y===height-1)return 'wall';
  if(town){
   if(kind==='coast'&&y===height-2&&x>cx)return 'water';
   if(kind==='canyon')return y===1||y===height-2?'stone':'sand';
   return Math.abs(x-cx)<=1&&Math.abs(y-cy)<=1?'stone':x===cx||y===cy?'path':(x+y)%3===0?'wood':'grass';
  }
  switch(kind){
   case 'canyon': {const bend=seed%2?1:0;return (y===1||y===height-2)&&x%4!==bend?'wall':y===cy||y===cy-1?'sand':'stone';}
   case 'alpine':return (x===1&&y%4<2||x===width-2&&y%4>=2)?'wall':x===cx?'path':(x+y)%3===0?'grass':'stone';
   case 'ridge':return (x%4===1&&y%3===1)?'wall':(x+y+seed)%5===0?'sand':'stone';
   case 'coast':return y>=height-3&&x>1&&x<width-2?'water':y===height-4?'sand':x%3===0?'stone':'sand';
   case 'grove':return ((x<=2&&y<=2)||(x>=width-3&&y>=height-3))&&((x+y+seed)%3!==0)?'wall':(x+y)%7===0?'soil':'grass';
   case 'cavern':return (x===3||x===width-4)&&y!==cy&&y!==cy-1?'wall':(x+y+seed)%5===0?'soil':'stone';
   case 'cloister':return x%3===1&&y%3===1?'wall':x===cx||y===cy?'path':(x+y)%2===0?'wood':'stone';
   case 'works':return x%3===1&&y%3===1?'wall':x===cx||y===cy?'path':'stone';
   case 'plain':return x===width-2&&y%3!==0?'water':(x+y+seed)%9===0?'soil':'grass';
   case 'plaza':return x===cx||y===cy?'path':(x+y)%4===0?'stone':'grass';
  }
 }));
}
export const regionRocks=(node:Node)=>['ridge','alpine','canyon','cavern'].includes(landform(node))?3:1;
