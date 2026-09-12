import type { Node } from '@/data/schemas';
import type { FieldSpace,FieldTile } from './field-types';
type Palette=Record<FieldTile,string>&{grassAlt:string;stage:string;edge:string};
const palette=(grass:string,path:string,stone:string,wall:string,sand:string,wood:string,water:string,stage:string,edge:string):Palette=>({grass,grassAlt:grass,path,stone,wall,sand,wood,water,soil:'#725e44',stage,edge});
export const FIELD_PALETTES={
 meadow:palette('#415e45','#77856b','#535c59','#263b2d','#ab9368','#79644e','#608992','#334735','#192c23'),
 city:palette('#697660','#a2967c','#88867c','#4a5149','#bca783','#897458','#6b9198','#666b5b','#292f29'),
 sandstone:palette('#9a7650','#b99465','#8b6a50','#59412f','#c3a071','#8a6040','#66858b','#846348','#32271f'),
 ember:palette('#70534a','#8c6651','#625551','#362c2c','#9d7354','#765143','#637c80','#614238','#241d1c'),
 shore:palette('#83825e','#b2a181','#7c817a','#485653','#c3b18e','#84735e','#5f929e','#667c75','#263b3c'),
 forest:palette('#3d6446','#7d8060','#667569','#283d32','#a69871','#72654a','#5f8b88','#35573c','#14291e'),
 night:palette('#585e6a','#85818d','#646777','#303644','#b1a48c','#796a70','#647f9b','#464c63','#1b2232'),
 cave:palette('#626057','#817967','#646568','#343638','#97836b','#716050','#52747e','#414347','#1d2225')
};
export function fieldPalette(node?:Node,space?:FieldSpace):Palette {
 if(space?.dungeon)return FIELD_PALETTES.cave;
 const region=node?.region??'',label=node?.label??'';
 if(region==='manonickla'||/협곡|사구|석양.*절벽/.test(label))return FIELD_PALETTES.sandstone;
 if(/moss-north|triflower|demon-windfall/.test(region))return FIELD_PALETTES.ember;
 if(/mushroom|mine|castle/.test(region)||/동굴|갱도|지하/.test(label))return FIELD_PALETTES.cave;
 if(/forest|alimes|diropel|falcon-garden/.test(region))return FIELD_PALETTES.forest;
 if(/coast|fishing|moss-south|martin/.test(region))return FIELD_PALETTES.shore;
 if(/tacomi|starlight|luna/.test(region))return FIELD_PALETTES.night;
 if(node&&['village','shop','workshop'].includes(node.kind)||region==='iluneon')return FIELD_PALETTES.city;
 return FIELD_PALETTES.meadow;
}
export function paletteStyle(node?:Node,space?:FieldSpace):Record<string,string> {
 return Object.fromEntries(Object.entries(fieldPalette(node,space)).map(([key,value])=>['--field-'+key,value]));
}
