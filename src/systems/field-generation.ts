import { ensureForage } from './field-forage';
import { regionRocks } from './field-biomes';
import { connectionVector, inward } from './field-geography';
import { ensureBases, baseTown, playerHomeId, innId } from './field-bases';
import { homeId, courtId, commonId } from '@/data/npc-calendar';
import type { RunState, Node, Monster, Boss } from '@/data/schemas';
import type { GridPos } from '@/data/schemas/base';
import { useDataStore } from '@/stores/data';
import type { FieldSpace } from './field-types';
import type { InteractionWorld, WorldEntity } from './world/types';
import { createSocialProfile } from './world/social';
import { walkable, fieldPath, distance } from './world/spatial';
import { ensureLifeSite } from './world/life-world';
import { effectiveContent } from './map';
import { boundaryFor, carvePath, fieldConnection, fieldDimensions, fieldTheme, readRoad, roadId, terrainFor } from './field-geography';

export const FIELD_ITEMS: Record<string, { name: string; glyph: string; color: string }> = {
  'field-springseed': { name: '샘의 씨앗', glyph: '✧', color: '#bfe9f1' },
  'field-wrap': { name: '보강 붕대', glyph: '▤', color: '#c5c1a8' },
  'field-smoke': { name: '연막 포자', glyph: '◌', color: '#c0b0d2' },
  'field-salve': { name: '수액 연고', glyph: '◈', color: '#bdd39c' },
  'field-spark': { name: '전하 소금', glyph: 'ϟ', color: '#f3d77d' },
  water: { name: '물', glyph: '◉', color: '#80d5ef' },
  'field-seed': { name: '들곡 씨앗', glyph: '⌁', color: '#dec58c' },
  'raw-fiber': { name: '풀섬유', glyph: '≋', color: '#a8c986' },
  'raw-stone': { name: '원석', glyph: '◆', color: '#b3bdce' },
  'i-crop-grain': { name: '들곡', glyph: '♧', color: '#e1ca80' },
  'i-life-char': { name: '숯', glyph: '⬟', color: '#dc9e81' },
  'i-life-charge': { name: '모은 전하', glyph: 'ϟ', color: '#c6b0f5' },
};
export function fieldItemName(id: string): string { return FIELD_ITEMS[id]?.name ?? useDataStore().items.get(id)?.name ?? id; }
export function fieldMap(run: RunState) {
  const data = useDataStore();
  return data.nodeMaps.get(data.timelines.get(run.timelineId)?.nodeMapId ?? '');
}
export function baseNode(run: RunState, spaceId = run.currentNodeId): Node | undefined {
  return fieldMap(run)?.nodes.find(n => n.id === (run.interactionWorld?.spaces?.[spaceId]?.nodeId ?? spaceId.split('::')[0]));
}
function hash(text: string): number { let n = 2166136261; for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }
function openPosition(world: InteractionWorld, space: FieldSpace, preferred: GridPos, id?: string): GridPos {
  const points:GridPos[]=[];
  for(let y=1;y<space.height-1;y++)for(let x=1;x<space.width-1;x++)points.push({x,y});
  points.sort((a,b)=>Math.abs(a.x-preferred.x)+Math.abs(a.y-preferred.y)-Math.abs(b.x-preferred.x)-Math.abs(b.y-preferred.y));
  const entity=id?world.entities[id]:undefined;
  const occupied=new Set(Object.values(world.entities).filter(e=>e.nodeId===space.id&&e.pos&&!e.carriedBy&&e.id!==id&&(e.properties.integrity??100)>0&&e.kind!=='terrain'&&!e.tags.includes('ground')).map(e=>e.pos!.x+','+e.pos!.y));
  const reserved=new Set(space.exits.flatMap(e=>{const d=inward(space,e.pos);return [e.pos,{x:e.pos.x+d.x,y:e.pos.y+d.y}];}).map(p=>p.x+','+p.y));
  const free=(p:GridPos)=>walkable(world,space.id,p,id);
  const empty=(p:GridPos)=>!occupied.has(p.x+','+p.y)&&!reserved.has(p.x+','+p.y);
  if(!entity||id==='player')return points.find(free)??{...space.spawn};
  const others=Object.values(world.entities).filter(e=>e.nodeId===space.id&&e.pos&&!e.carriedBy&&e.id!=='player'&&e.id!==id);
  const fits=(p:GridPos)=>{
    if(distance(p,space.spawn)===0)return false;
    const prior=entity.pos;entity.pos=p;
    const accessible=!!fieldPath(world,space.id,space.spawn,p,'player',true)
      &&space.exits.every(e=>!!fieldPath(world,space.id,space.spawn,e.pos,'player'))
      &&others.every(e=>!!fieldPath(world,space.id,space.spawn,e.pos!,'player',true));
    entity.pos=prior;return accessible;
  };
  const preferredPoints=[...points.filter(p=>space.tiles[p.y]![p.x]!=='path'),...points.filter(p=>space.tiles[p.y]![p.x]==='path')];
  // Use an empty cell before any legacy overflow. A full player-built room keeps its objects selectable.
  return preferredPoints.find(p=>empty(p)&&free(p)&&fits(p))
    ??preferredPoints.find(p=>empty(p)&&free(p)&&(entity.properties.solid??0)===0&&entity.kind!=='actor')
    ??preferredPoints.find(p=>free(p)&&fits(p))??{...space.spawn};
}
export function placeFieldEntity(world: InteractionWorld, space: FieldSpace, entity: WorldEntity, preferred: GridPos): WorldEntity {
  entity.nodeId = space.id;
  world.entities[entity.id] = entity;
  entity.pos = openPosition(world, space, preferred, entity.id);
  return entity;
}
function object(world: InteractionWorld, space: FieldSpace, suffix: string, name: string, pos: GridPos, tags: string[], properties: Record<string, number>, stock: Record<string, number> = {}): WorldEntity {
  const existing=world.entities[`${space.id}:field:${suffix}`];if(existing)return existing;
  return placeFieldEntity(world, space, { id: `${space.id}:field:${suffix}`, name, kind: 'resource', nodeId: space.id, colors: {}, tags, stock, properties: { integrity: 100, ...properties } }, pos);
}
export const fieldCreatureHp=(hp:number,rank:string)=>Math.max(10,Math.round(hp/(rank==='boss'?4:rank==='elite'?1.5:1)));
export function spawnCreature(run: RunState, world: InteractionWorld, space: FieldSpace, definition: Monster | Boss, index: number, rank: 'normal' | 'elite' | 'boss'): WorldEntity {
  const existing=world.entities[`${space.id}:creature:${index}`];if(existing)return existing;
  const maxHp = fieldCreatureHp(definition.hp,rank);
  const drop = 'drop' in definition ? definition.drop : undefined;
  const e: WorldEntity = {
    id: `${space.id}:creature:${index}`, name: definition.name, kind: 'actor', nodeId: space.id,
    colors: {}, stock: {}, tags: ['monster', rank, ...(rank !== 'normal' ? ['humanoid'] : [])],
    properties: { integrity: 100, maxHp, hardness: Math.max(0, (definition.defense ?? 0) / 3), flammability: 1, moisture: 0, solid: 1 },
    creature: { balanceVersion:1, definitionId: definition.id, species:'species' in definition?definition.species:undefined, rank, maxHp, attack: Math.max(2, definition.attack), range: rank === 'normal' ? 1 : 2,
      reward: { gold: drop?.gold ?? (rank === 'normal' ? 3 : 12), shards: drop?.timeShards ?? (rank === 'normal' ? 1 : 5), itemId: baseNode(run, space.id)?.region ? fieldMap(run)?.regions.find(r => r.id === baseNode(run, space.id)?.region)?.specialtyItemId : undefined } },
  };
  const locations = [{ x:space.width-3,y:2 },{ x:space.width-2,y:space.height-3 },{ x:space.width-4,y:space.height-2 }];
  return placeFieldEntity(world, space, e, locations[index % locations.length]!);
}
function residents(run: RunState, world: InteractionWorld, space: FieldSpace, node: Node) {
  const data = useDataStore();
  const pool = new Set(node.contentRef?.npcIdPool ?? []);
  const npcs = [...data.npcs.values()].filter(n => n.homeNodeId === node.id || pool.has(n.id));
  for (const [i, npc] of npcs.entries()) {
    const id = `npc:${npc.id}`;
    if (world.entities[id] || run.field?.residentsVersion) continue;
    const colors = npc.colorValues ? Object.fromEntries(Object.entries(npc.colorValues).map(([k, v]) => [k, v <= 1 ? v * 100 : v])) : {};
    const body = data.races.get(npc.raceId)?.baseStats;
    placeFieldEntity(world, space, {
      id, npcId: npc.id, name: npc.name, kind: 'actor', nodeId: space.id, ownerId: id, colors, tags: ['person', 'resident', ...(npc.tags ?? [])], stock: { 'i-crop-grain': 1 },
      properties: { integrity: 100, lifeLevel: 1, practice: 0, laborPower: body ? body.vigor + body.attack / 4 : 12, hardness: body ? body.defense / 2 : 0 },
      agent: createSocialProfile(npc.raceId, npc.role || 'traveler', { homeNodeId: node.id, turn: run.visitedNodes.length }),
    }, { x: 5 + i % 4, y: 4 + Math.floor(i / 4) * 3 });
  }
}
function connectExits(space: FieldSpace, node: Node, run: RunState) {
  const map = fieldMap(run);
  const entries = [...node.neighbors.map(to => ({ to, requirement: undefined as string | undefined })), ...(node.conditionalNeighbors ?? []).filter(c => !node.neighbors.includes(c.nodeId)).map(c => ({ to: c.nodeId, requirement: c.requires }))];
  entries.forEach(entry => {
    const destination=map?.nodes.find(n=>n.id===entry.to);if(!destination)return;
    const {dx,dy}=connectionVector(node,destination);
    const pos = boundaryFor(space,dx,dy,space.exits.map(e=>e.pos));
    if (!pos) return;
    const connection=fieldConnection(map!,node,destination);
    space.exits.push({ ...entry, to:connection.to, destination:destination.id, roads:connection.count, pos, label:destination.label });
    // Every exit is connected to the central cross, including authored conditional routes.
    carvePath(space,pos,space.spawn);
  });
}
export function ensureFieldSpace(run: RunState, world: InteractionWorld, id: string): FieldSpace {
  world.spaces ??= {};
  const old=world.spaces[id];if(old&&(old.layoutVersion===4||old.residence)){connectNeighborhood(run,world,old);connectBases(run,world,old);repairFieldPlacements(world,old);ensurePractice(world,old);const node=baseNode(run,old.id);if(node){ensureRegionalProps(world,old,node);ensureForage(run,world,old,node);}return old;}
  if(id.includes('::home:')||id.endsWith('::residents')||id.endsWith('::commons')||id.endsWith('::player-home')||id.endsWith('::inn'))return createResidence(run,world,id);
  const data=useDataStore(),map=fieldMap(run);
  if(!map)throw new Error('플레이할 장소가 없습니다.');
  const road=readRoad(id,map),split=id.split('::dungeon:');
  const node=road?(road.index<road.count/2?road.from:road.to):map.nodes.find(n=>n.id===split[0]);
  if(!node)throw new Error('연결되지 않은 장소: '+id);
  const floor=Number(split[1]??0),dungeon=floor>=1&&floor<=3;
  const npcs=[...data.npcs.values()].filter(n=>n.homeNodeId===node.id||node.contentRef?.npcIdPool?.includes(n.id));
  const {width,height}=road?{width:6,height:6}:dungeon?{width:10,height:9}:fieldDimensions(node,npcs.length);
  const spawn={x:dungeon?2:Math.floor(width/2),y:Math.floor(height/2)};
  const space:FieldSpace={id,nodeId:node.id,name:road?road.from.label+' — '+road.to.label+' · '+(road.index+1)+'/'+road.count:dungeon?node.label+' · 지하 '+floor+'층':node.label,
    width,height,tiles:terrainFor(node,width,height,dungeon),spawn,exits:[],layoutVersion:4,theme:dungeon?'cave':fieldTheme(node),cleared:old?.cleared,
    ...(dungeon?{dungeon:{origin:node.id,floor,totalFloors:3}}:{}),...(road?{road:{from:road.from.id,to:road.to.id,index:road.index,count:road.count}}:{})};
  world.spaces[id]=space;space.tiles[spawn.y]![spawn.x]='path';
  if(road){
    const forward=road.from.neighbors.includes(road.to.id)?undefined:road.from.conditionalNeighbors?.find(e=>e.nodeId===road.to.id)?.requires;
    const backward=road.to.neighbors.includes(road.from.id)?undefined:road.to.conditionalNeighbors?.find(e=>e.nodeId===road.from.id)?.requires;
    const {dx,dy}=connectionVector(road.from,road.to);
    space.exits=[{pos:boundaryFor(space,-dx,-dy,[]),to:road.index===0?road.from.id:roadId(road.from.id,road.to.id,road.index-1),label:road.from.label,destination:road.from.id,requirement:backward},
      {pos:boundaryFor(space,dx,dy,[]),to:road.index===road.count-1?road.to.id:roadId(road.from.id,road.to.id,road.index+1),label:road.to.label,destination:road.to.id,requirement:forward}];
    for(const exit of space.exits)carvePath(space,exit.pos,spawn);
  }else if(dungeon){
    space.exits=[{pos:{x:0,y:spawn.y},to:floor===1?node.id:node.id+'::dungeon:'+(floor-1),label:floor===1?'지상':'윗층'}];
    if(floor<3)space.exits.push({pos:{x:width-1,y:spawn.y},to:node.id+'::dungeon:'+(floor+1),label:'아랫층',requirement:'room-clear'});
    for(const exit of space.exits)carvePath(space,exit.pos,spawn);
  }else connectExits(space,node,run);
  connectNeighborhood(run,world,space);
  // Rebuild geometry once, retaining every actual object, crop, inventory and creature state.
  const existing=Object.values(world.entities).filter(e=>e.nodeId===id&&!e.carriedBy);
  const positions=new Map(existing.map(e=>[e.id,e.pos]));for(const e of existing)e.pos=undefined;
  for(const e of existing){
    const p=positions.get(e.id),n=hash(e.id);
    placeFieldEntity(world,space,e,old&&p?{x:Math.round(p.x/(old.width-1)*(width-1)),y:Math.round(p.y/(old.height-1)*(height-1))}:{x:1+n%(width-2),y:1+Math.floor(n/7)%(height-2)});
  }
  const at=(x:number,y:number):GridPos=>({x:Math.max(1,Math.min(width-2,Math.round(x*(width-1)/14))),y:Math.max(1,Math.min(height-2,Math.round(y*(height-1)/12)))});
  if(!old){
    const town=space.theme==='town',seed=hash(id);
    if(!dungeon&&!road)residents(run,world,space,node);
    if(!road&&!dungeon&&(node.kind==='rest'||node.kind==='village'))object(world,space,'building','쉼터',at(3,2),['building','shelter'],{solid:1,hardness:8});
    if(!road&&!dungeon&&(node.kind==='workshop'||node.kind==='village')){
      const bench=object(world,space,'workbench','작업대',at(3,10),['workshop'],{solid:1,hardness:4,work:0,workRequired:3},{'raw-fiber':2});
      bench.workRecipe={required:3,inputs:{'raw-fiber':2},outputs:{'i-life-char':2,'field-seed':1},repeat:true};
    }
    if(!road&&!dungeon&&(node.kind==='village'||node.kind==='gather'))for(let i=0;i<(node.kind==='village'?2:1);i++){
      const plot=object(world,space,'soil-'+i,'빈 밭',at(5+i*2,10),['field-plot','food','shared'],{soil:1,flammability:1,moisture:0});plot.kind='plot';
      space.tiles[plot.pos!.y]![plot.pos!.x]='soil';
    }
    if(!dungeon&&(!town||node.kind==='village'&&!road)){
      const shrub=object(world,space,'brush',space.theme==='coast'?'바닷풀':'섬유풀',at(12,10),['brush','renewable'],{flammability:3,moisture:1},{'raw-fiber':2});
      shrub.renewable={resourceId:'raw-fiber',capacity:2,interval:100,nextTurn:world.turn+100};
    }
    if(town||dungeon||seed%3===0){
      const barrel=object(world,space,'barrel','물통',at(10,3),['barrel','storage','shared'],{portable:1,mass:2,solid:1,moisture:2,hardness:1,spillOnBreak:1},{water:8});barrel.colors={water:50,earth:10};
    }
    if(dungeon||!town||node.kind==='village')for(let i=0;i<(dungeon?2:regionRocks(node));i++)object(world,space,'stone'+(i?'-'+i:''),space.theme==='volcanic'?'현무암':'바위',at(11-i*3,9-i*2),['stone','shared'],{portable:1,mass:3,solid:1,hardness:8});
    if(space.theme==='volcanic'||dungeon||node.kind==='workshop')object(world,space,'brazier','화로',at(2,2),['brazier','storage','shared'],{heat:4,solid:1,hardness:4},{'i-life-char':4});
    if(!dungeon&&(node.kind==='village'||space.theme==='coast')){
      const well=object(world,space,'well','샘',at(2,4),['well','storage','shared'],{solid:1,moisture:5,hardness:8},{water:30});
      well.renewable={resourceId:'water',capacity:30,interval:1,nextTurn:world.turn+1};
    }
    if(node.kind==='village'&&!road&&!dungeon)object(world,space,'bundle','여행자의 꾸러미',at(4,5),['bundle','storage','shared'],{portable:1,mass:1},{'field-seed':2,'i-crop-grain':1});
    const content=effectiveContent(node,run),region=map.regions.find(r=>r.id===node.region),authored=data.monsters.get(content.enemyGroupId??'');
    const monsters=(region?.enemyPool??[]).map(x=>data.monsters.get(x)).filter((x):x is Monster=>!!x&&x.tier!=='elite');
    const elites=(region?.eliteEnemyPool??[]).map(x=>data.monsters.get(x)).filter((x):x is Monster=>!!x);
    const normal=authored&&authored.tier!=='elite'?authored:monsters[seed%Math.max(1,monsters.length)]??[...data.monsters.values()].find(m=>m.tier!=='elite');
    const elite=authored?.tier==='elite'?authored:elites[seed%Math.max(1,elites.length)]??[...data.monsters.values()].find(m=>m.tier==='elite');
    if(!dungeon&&!road&&['combat','elite','boss','boss-gate'].includes(node.kind)){
      if(normal&&!run.nodeStates[node.id]?.combatCleared)spawnCreature(run,world,space,normal,0,'normal');
      object(world,space,'entrance','던전 입구',at(12,10),['dungeon-entry'],{solid:1,hardness:100});
    }
    if(dungeon){
      const boss=data.bosses.get(content.bossId??(node.isBossGate||node.kind==='boss'?data.timelines.get(run.timelineId)?.bossId??'':''));
      if(floor===3&&boss)spawnCreature(run,world,space,boss,0,'boss');else if(floor>=2&&elite)spawnCreature(run,world,space,elite,0,'elite');
      if(normal&&floor<3)for(let i=floor===1?0:1;i<2;i++)spawnCreature(run,world,space,normal,i,'normal');
      if(floor===3&&!boss&&!elite&&normal)spawnCreature(run,world,space,normal,0,'normal');
      object(world,space,'cache','오래된 보관함',at(12,10),['storage','shared'],{solid:1,portable:1,mass:3,hardness:3},{'i-crop-grain':3,water:3,'i-life-char':2});
    }
  }
  if(!dungeon&&!road){
    const services:Record<string,string>={shop:'상점',workshop:'공방',village:'마을',activity:'활동',event:'사건'};
    if(services[node.kind]){const site=object(world,space,'service',node.kind==='event'?node.label:services[node.kind]!,at(4,2),['building','service:'+node.kind],{solid:1,hardness:8});site.kind='facility';}
    if(node.kind!=='event'&&node.contentRef?.eventIdPool?.length)object(world,space,'story','이야기',at(12,2),['story','service:event'],{solid:1});
    if(node.kind==='gather'){const site=ensureLifeSite(run,world,node.id,node.region);if(!site.pos)placeFieldEntity(world,space,site,at(4,5));}
  }
  for(const actor of Object.values(world.entities).filter(e=>e.npcId&&e.nodeId===id&&!e.pos&&!e.routine?.travel))placeFieldEntity(world,space,actor,space.spawn);
 for(const e of Object.values(world.entities).filter(e=>e.nodeId===id)){e.fieldUpdatedAt??=run.field?.elapsedSeconds??0;e.fieldNpcAt??=e.fieldUpdatedAt;}
  repairFieldPlacements(world,space);
  ensurePractice(world,space);
  ensureRegionalProps(world,space,node);
  ensureForage(run,world,space,node);
  return space;
}

/** Small connected spaces keep the original node geography and existing objects intact. */
export function connectNeighborhood(run:RunState,_world:InteractionWorld,space:FieldSpace){
 if(space.housingVersion||space.road||space.dungeon||space.residence)return;
 space.housingVersion=1;
 const node=baseNode(run,space.id);if(!node)return;
 const inhabitants=[...useDataStore().npcs.values()].filter(n=>n.homeNodeId===node.id);
 const links=[...(inhabitants.length?[{to:courtId(node.id),label:'집들이 모인 길'}]:[]),...(node.kind==='village'?[{to:commonId(node.id),label:'공동 마당'}]:[])];
 for(const link of links){
   const pos=[[0,1],[1,0],[0,-1],[-1,0]].map(([x,y])=>boundaryFor(space,x!,y!,space.exits.map(e=>e.pos))).find(Boolean);
   if(!pos)continue;space.exits.push({...link,pos});carvePath(space,pos,space.spawn);
 }
}
function createResidence(run:RunState,world:InteractionWorld,id:string):FieldSpace {
 const data=useDataStore(),base=id.split('::')[0]!,node=fieldMap(run)?.nodes.find(n=>n.id===base);
 if(!node)throw Error('거주지의 지역이 없다: '+id);
 const npc=id.includes('::home:')?data.npcs.get(id.split('::home:')[1]!):undefined;
 if(id.includes('::home:')&&(!npc||npc.homeNodeId!==base))throw Error('거주자가 없다: '+id);
 const kind=npc?'home':id.endsWith('::player-home')?'player-home':id.endsWith('::inn')?'inn':id.endsWith('::commons')?'commons':'court';
 const parent=npc?courtId(base):kind==='player-home'||kind==='inn'?commonId(base):base,parentSpace=ensureFieldSpace(run,world,parent);
 const entry=parentSpace.exits.find(e=>e.to===id);if(!entry)throw Error('거주지의 입구가 없다: '+id);
 const residents=[...data.npcs.values()].filter(n=>n.homeNodeId===base);
 const width=kind==='court'&&residents.length>4?8:6,height=6;
 const space:FieldSpace={id,nodeId:base,name:npc?npc.name+'의 집':kind==='player-home'?node.label+' · 내 집':kind==='inn'?node.label+' · 여관':kind==='commons'?node.label+' · 공동 마당':node.label+' · 주거지',width,height,spawn:{x:Math.floor(width/2),y:3},
 tiles:Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>x===0||y===0||x===width-1||y===height-1?'wall':['home','player-home','inn'].includes(kind)?'wood':'grass')),
 exits:[],layoutVersion:4,housingVersion:1,theme:'town',residence:{parent,kind,npcId:npc?.id}};
 world.spaces![id]=space;
 const incoming=inward(parentSpace,entry.pos),back=boundaryFor(space,incoming.x,incoming.y,[]);
 space.exits.push({to:parent,label:parentSpace.name,pos:back});carvePath(space,back,space.spawn);
 if(kind==='court')for(const [i,resident]of residents.entries()){
   const directions=[[0,-1],[-1,0],[1,0],[0,1]],used=space.exits.map(e=>e.pos);
   const pos=[...directions.slice(i%4),...directions.slice(0,i%4)].map(([x,y])=>boundaryFor(space,x!,y!,used)).find(Boolean);
   if(!pos)continue;
   space.exits.push({to:homeId(resident),label:resident.name+'의 집',pos});carvePath(space,pos,space.spawn);
   const door:WorldEntity={id:id+':door:'+resident.id,name:resident.name+'의 집',kind:'facility',nodeId:id,pos,colors:{},tags:['building','home-door'],properties:{integrity:100},stock:{},ownerId:'npc:'+resident.id};world.entities[door.id]=door;
 }
 if(kind==='player-home'||kind==='inn'){
   const bed=object(world,space,'bed','침상',{x:1,y:1},['shelter','bed'],{hardness:2,flammability:1});bed.ownerId=kind==='player-home'?'player':'local-community';
   const chest=object(world,space,'cabinet','내 보관함',{x:4,y:1},['storage','cabinet'],{solid:1,portable:1,mass:2,hardness:2});chest.ownerId='player';
   const desk=object(world,space,'desk','준비대',{x:1,y:4},['table','base:configure'],{solid:1,hardness:2});desk.ownerId=bed.ownerId;
 }else if(npc){
   const owner='npc:'+npc.id;
   const rest=object(world,space,'bed',npc.tags?.includes('construct')?'충전 자리':npc.tags?.includes('dryad')?'뿌리 내리는 자리':npc.tags?.some(t=>['mermaid','siren','slime'].includes(t))?'물가의 침상':'침상',{x:1,y:1},['shelter','bed'],{hardness:2,flammability:1,...(npc.tags?.includes('construct')?{conductivity:1}:npc.tags?.includes('dryad')?{soil:1,moisture:2}:npc.tags?.some(t=>['mermaid','siren','slime'].includes(t))?{moisture:4}:{})});rest.ownerId=owner;
   const cabinet=object(world,space,'cabinet','작은 보관함',{x:width-2,y:1},['storage','cabinet'],{solid:1,portable:1,mass:2,hardness:2},{'i-crop-grain':2,'raw-fiber':2});cabinet.ownerId=owner;
   const table=object(world,space,'table',npc.role==='Craftsman'?'손때 묻은 작업대':npc.tags?.includes('mage')?'술법 연구대':'낮은 탁자',{x:1,y:height-2},npc.role==='Craftsman'?['workshop']:['table'],{solid:1,hardness:3,work:0},{'raw-fiber':2});table.ownerId=owner;
   if(npc.role==='Craftsman')table.workRecipe={required:3,inputs:{'raw-fiber':2},outputs:{'i-material-common':1},repeat:true};
 }else{
   object(world,space,'table','나눔 식탁',{x:1,y:1},['storage','shared','food','table'],{solid:1,hardness:2},{'i-crop-grain':4,water:4});
   object(world,space,'seat','그늘 아래 의자',{x:width-2,y:1},['shelter','shared','seat'],{hardness:2});
   if(kind==='commons'){
     const plot=object(world,space,'soil','공동 텃밭',{x:1,y:height-2},['field-plot','shared'],{soil:1,moisture:2});plot.kind='plot';space.tiles[plot.pos!.y]![plot.pos!.x]='soil';
     const bench=object(world,space,'bench','공동 작업대',{x:width-2,y:height-2},['workshop','shared'],{solid:1,hardness:3,work:0},{'raw-fiber':4});bench.workRecipe={required:3,inputs:{'raw-fiber':2},outputs:{'i-material-common':1},repeat:true};
   }
 }
 connectBases(run,world,space);
 for(const e of Object.values(world.entities).filter(e=>e.nodeId===id)){e.fieldUpdatedAt??=run.field?.elapsedSeconds??0;e.fieldNpcAt??=e.fieldUpdatedAt;}
 repairFieldPlacements(world,space);
 return space;
}

/** Base doors share the town commons so the original map connections remain untouched. */
export function connectBases(run:RunState,world:InteractionWorld,space:FieldSpace) {
 if(space.residence?.kind!=='commons'||!baseTown(run,space.nodeId)||!run.field)return;
 ensureBases(run);
 if(space.basesVersion)return;
 space.basesVersion=1;
 for(const [kind,to,label]of [['build',playerHomeId(space.nodeId),'내 집'],['rent',innId(space.nodeId),'여관']]){
  const used=space.exits.map(e=>e.pos),pos=[[1,0],[-1,0],[0,1],[0,-1]].map(([x,y])=>boundaryFor(space,x!,y!,used)).find(Boolean);
  if(!pos)continue;
  space.exits.push({to:to!,label:label!,pos});carvePath(space,pos,space.spawn);
  const door=object(world,space,'base-'+kind,label!,pos,['building','base:'+kind],{hardness:3});
  door.pos={...pos};door.kind='facility';door.ownerId=kind==='build'?'player':'local-community';
 }
}

/** One migration moves only overlapping generated objects, preserving identities and production. */
export function repairFieldPlacements(world:InteractionWorld,space:FieldSpace) {
 if(space.placementVersion)return;
 space.placementVersion=1;
 const seen=new Set<string>(),entities=Object.values(world.entities).filter(e=>e.nodeId===space.id&&e.pos&&!e.carriedBy&&e.id!=='player'&&e.kind!=='terrain'&&(e.properties.integrity??100)>0);
 // Doors must stay attached to their exits even when an NPC was saved on top.
 const priority=(e:WorldEntity)=>e.tags.some(t=>t.startsWith('service:')||t.startsWith('base:')||t==='home-door'||t==='dungeon-entry')?4:e.kind==='facility'?3:e.kind==='plot'?2:e.kind==='actor'?1:0;
 entities.sort((a,b)=>priority(b)-priority(a));
 for(const e of entities){
  const key=e.pos!.x+','+e.pos!.y;
  if(seen.has(key))placeFieldEntity(world,space,e,e.pos!);
  seen.add(e.pos!.x+','+e.pos!.y);
 }
}

/** One durable practice object; breaking or moving it is a real change. */
function ensurePractice(world:InteractionWorld,space:FieldSpace){
 if(space.id!=='n-iluneon-guild'||space.practiceVersion)return;
 space.practiceVersion=1;
 const dummy=object(world,space,'practice','연습 말뚝',{x:space.width-2,y:2},['practice','wood'],{solid:1,portable:1,mass:4,hardness:1,maxHp:1000,flammability:1});
 dummy.kind='facility';
}

/** Existing saves gain the region's new props once; destroyed props are never revived. */
function ensureRegionalProps(world:InteractionWorld,space:FieldSpace,node:Node){
 if(space.biomePropsVersion||space.dungeon||space.road||space.residence)return;
 space.biomePropsVersion=1;
 if(regionRocks(node)<3)return;
 const rocks=Object.values(world.entities).filter(e=>e.nodeId===space.id&&e.tags.includes('stone'));
 for(let i=rocks.length;i<3;i++)object(world,space,'outcrop-'+i,space.theme==='volcanic'?'현무암':'바위',{x:space.width-2-i,y:space.height-2},['stone','shared'],{portable:1,mass:3,solid:1,hardness:8});
}
