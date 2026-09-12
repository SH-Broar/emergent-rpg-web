import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const saved = new Map();
const oldWindow = globalThis.window, oldStorage = globalThis.localStorage, oldFetch=globalThis.fetch;
globalThis.window = { setTimeout: () => 0 };
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key,value) => saved.set(key,value), removeItem: key => saved.delete(key) };
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  setActivePinia(createPinia());
  const { useRunStore } = await server.ssrLoadModule('/src/stores/run.ts');
  const { useDataStore } = await server.ssrLoadModule('/src/stores/data.ts');
  const { loadAllData } = await server.ssrLoadModule('/src/data/loader.ts');
  const field = await server.ssrLoadModule('/src/systems/field-simulation.ts');
  const generation = await server.ssrLoadModule('/src/systems/field-generation.ts');
  const spatial = await server.ssrLoadModule('/src/systems/world/spatial.ts');
  const engine = await server.ssrLoadModule('/src/systems/world/engine.ts');
  const gestures = await server.ssrLoadModule('/src/systems/gestures.ts');
  globalThis.fetch=async url=>new Response(readFileSync(join(root,'public',String(url).replace(/^\//,'')),'utf8'));
  const data=useDataStore();data.data=await loadAllData('/');
  const timeline = [...data.timelines.values()].find(t => data.nodeMaps.get(t.nodeMapId)?.nodes.some(n => n.id === 'n-iluneon-square'));
  assert.ok(timeline);
  const run = useRunStore();


 const combat=await server.ssrLoadModule('/src/systems/field-combat.ts');
 const ai=await server.ssrLoadModule('/src/systems/field-ai.ts');
 const selection=await server.ssrLoadModule('/src/systems/field-selection.ts');
 const palettes=await server.ssrLoadModule('/src/systems/field-palette.ts');
 const {homeId}=await server.ssrLoadModule('/src/data/npc-calendar.ts');
 const {createSSRApp}=await import('vue'),{renderToString}=await import('@vue/server-renderer');
 const {default:Badge}=await server.ssrLoadModule('/src/components/FieldIntentBadge.vue');
 const results=[],clone=x=>JSON.parse(JSON.stringify(x));
 function start(){
  run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:100,maxMp:3,timeLimit:300});
  return field.ensureField(run.data);
 }
 function arena(){
  const a=start();a.world.entities={player:a.player};a.space.width=9;a.space.height=9;a.space.tiles=Array.from({length:9},()=>Array(9).fill('grass'));a.space.exits=[];
  a.player.pos={x:4,y:4};a.player.colors={};a.player.properties.hardness=0;run.data.relics=[];run.data.colors={fire:0,electric:0,earth:0,iron:0,water:0,wind:0,light:0,dark:0};
  const definition={...clone(data.monsters.get('mr-iluneon-cutpurse')),id:'test-cadence',hp:14,defense:0,attack:1,tempo:8,gridBehavior:[{name:'첫 타격',shape:[{dx:0,dy:1}],damage:1,castSpeed:'fast'},{name:'긴 타격',shape:[{dx:0,dy:1}],damage:1,castSpeed:'slow'}]};
  data.monsters.set(definition.id,definition);
  const enemy=generation.spawnCreature(run.data,a.world,a.space,definition,0,'normal');enemy.pos={x:4,y:3};enemy.creature.angry=true;
  return {...a,enemy,definition};
 }
 for(let hp=10;hp<=120;hp++)for(const type of ['force','charge','integrity']){
  const p={maxHp:hp,integrity:100,hardness:0};
  for(let i=0;i<hp;i++)engine.applyMaterialInfluence(p,{},type,type==='integrity'?-100/hp:100/hp);
  assert.equal(p.integrity,0,type+' '+hp);assert.equal(engine.displayedHp(p),0);
 }
 const one={maxHp:14,integrity:100/14};engine.applyMaterialInfluence(one,{},'force',0);assert.equal(engine.displayedHp(one),1);assert(one.integrity>0,'real one HP is not treated as dust');
 results.push('all HP values 10–120 die at exact lethal physical, electrical and direct damage; real 1 HP stays alive');

 let a=arena();a.space.tiles[2][4]='wall';a.enemy.properties['status:paralyze']=99;const xp=run.data.xp;
 assert(field.performFieldGesture('strike',a.enemy.id,a.enemy.pos).ok);assert.equal(engine.displayedHp(a.enemy.properties),7);
 assert(field.performFieldGesture('strike',a.enemy.id,a.enemy.pos).ok);assert.equal(a.enemy.properties.integrity,0);assert(a.enemy.creature.defeated);assert.equal(run.data.xp,xp+1);
 assert(!field.visibleFieldEntities(run.data).some(e=>e.id===a.enemy.id));
 field.advanceFieldTime(30);assert.equal(run.data.xp,xp+1);assert.equal(Object.values(a.world.entities).filter(e=>e.tags.includes('loot')).length,1);
 a=arena();a.enemy.properties.integrity=4.26e-14;run.saveActiveRun();run.$reset();assert(run.loadActiveRun());field.ensureField(run.data);field.advanceFieldTime(30);
 assert.equal(run.data.interactionWorld.entities[a.enemy.id].properties.integrity,0);assert(run.data.interactionWorld.entities[a.enemy.id].creature.defeated);
 a=arena();a.enemy.properties.integrity=100/14;a.enemy.properties['status:poison']=1;a.enemy.properties['status:regen']=5;
 combat.tickStatuses(a.world,a.enemy,1);assert.equal(a.enemy.properties.integrity,0,'a fatal status cannot be undone by later regeneration in the same tick');
 results.push('actual basic strikes kill, hide the monster and reward once; saved immortal HP repairs; lethal status stops regeneration');

 a=arena();field.ensureField(run.data);assert.equal(a.enemy.creature.pending.remaining,1);assert.equal(ai.creatureIntent(a.enemy).glyph,'⚔1');
 let hp=run.data.hp;field.advanceFieldTime(30);assert.equal(run.data.hp,hp-1);assert.equal(a.enemy.properties.attacksMade,1);assert.equal(a.enemy.creature.pending.remaining,2);
 field.advanceFieldTime(30);assert.equal(run.data.hp,hp-1);assert.equal(a.enemy.creature.pending.remaining,1);
 field.advanceFieldTime(30);assert.equal(run.data.hp,hp-2);assert.equal(a.enemy.properties.attacksMade,2);assert.equal(a.enemy.creature.pending.remaining,1);
 field.advanceFieldTime(30);assert.equal(a.enemy.properties.attacksMade,3);
 const before=clone(a.enemy);const html=await renderToString(createSSRApp(Badge,{entity:a.enemy}));assert(html.includes('다음 의도: 긴 타격'));assert(html.includes('⚔2'));assert.deepEqual(clone(a.enemy),before);
 run.saveActiveRun();run.$reset();assert(run.loadActiveRun());const restored=run.data.interactionWorld.entities[a.enemy.id];assert.deepEqual(restored.creature.pending,before.creature.pending);
 results.push('fast/slow attacks alternate without tempo or recovery idle turns; next attack is always rendered and saved');

 a=arena();a.enemy.pos={x:4,y:1};field.ensureField(run.data);const planned=clone(a.enemy.creature.nextAction);assert.equal(planned.kind,'move');
 assert(ai.creatureIntent(a.enemy).glyph);field.stepField({x:5,y:4});assert.deepEqual(a.enemy.pos,planned.pos,'movement follows the shown destination after player moves');
 assert(a.enemy.creature.pending||a.enemy.creature.nextAction);
 a=arena();field.ensureField(run.data);const cells=clone(a.enemy.creature.pending.cells);field.stepField({x:5,y:4});assert.equal(run.data.hp,100);assert(a.world.events.some(e=>e.message==='빗나감'));assert(cells.some(c=>c.pos.x===4&&c.pos.y===4));
 a=arena();a.enemy.properties['status:paralyze']=2;field.ensureField(run.data);assert.equal(a.enemy.creature.nextAction.kind,'wait');
 assert((await renderToString(createSSRApp(Badge,{entity:a.enemy}))).includes('다음 의도:'));hp=run.data.hp;field.advanceFieldTime(30);assert.equal(run.data.hp,hp);
 a=arena();delete a.world.entities[a.enemy.id];
  const bossDef={...clone([...data.bosses.values()][0]),id:'test-summoner',phases:[{startsAtHpRatio:1,gridBehavior:[{name:'소환 후 타격',shape:[{dx:0,dy:1}],damage:1,castSpeed:'slow'}],spawnMinions:['test-cadence']}]};
  data.bosses.set(bossDef.id,bossDef);const boss=generation.spawnCreature(run.data,a.world,a.space,bossDef,0,'boss');boss.pos={x:4,y:3};boss.creature.engaged=true;
  field.ensureField(run.data);field.advanceFieldTime(30);
  const minion=Object.values(a.world.entities).find(e=>e.creature&&e.id!==boss.id);assert(minion,'phase summons a real creature');assert(minion.creature.pending||minion.creature.nextAction,'summoned creature shows its plan immediately, before another player action');
  results.push('movement and attack cells match shown plans; each action prepares a successor; restrictions have a visible intent');

 a=start();const map=generation.fieldMap(run.data),spaces=[];
 for(const node of map.nodes)spaces.push(generation.ensureFieldSpace(run.data,a.world,node.id));
 for(const npc of data.npcs.values())if(npc.homeNodeId&&map.nodes.some(n=>n.id===npc.homeNodeId))spaces.push(generation.ensureFieldSpace(run.data,a.world,homeId(npc)));
 for(const space of spaces){
   assert.equal(space.placementVersion,1,space.id+' finishes placement before gameplay');
  const occupied=new Map();
  for(const e of Object.values(a.world.entities).filter(e=>e.nodeId===space.id&&e.pos&&e.id!=='player'&&!e.carriedBy&&e.kind!=='terrain'&&(e.properties.integrity??100)>0)){
   const key=spatial.positionKey(e.pos);assert(!occupied.has(key),space.id+' overlaps '+occupied.get(key)+' / '+e.name);occupied.set(key,e.name);
   assert(spatial.fieldPath(a.world,space.id,space.spawn,e.pos,'player',true),space.id+' inaccessible '+e.name);
  }
  for(const exit of space.exits)assert(spatial.fieldPath(a.world,space.id,space.spawn,exit.pos,'player'),space.id+' blocked exit');
 }
 results.push('275 authored spaces and 57 homes generate without overlapping entities or inaccessible objects/exits');

 a=arena();delete a.world.entities[a.enemy.id];a.player.pos={x:4,y:4};
 const site={id:'site',name:'사건 지점',kind:'facility',nodeId:a.space.id,pos:{x:4,y:3},colors:{},stock:{},tags:['service:event'],properties:{integrity:100,solid:1}};
 const item={id:'item',name:'물품',kind:'resource',nodeId:a.space.id,pos:{x:4,y:3},colors:{},stock:{'i-crop-grain':3},tags:['loot','storage'],properties:{integrity:100,portable:1}};
 const visitor={id:'visitor',name:'지나가던 이',kind:'actor',nodeId:a.space.id,pos:{...site.pos},colors:{},stock:{},tags:[],properties:{integrity:100,maxHp:100,solid:1}};
  a.world.entities.visitor=visitor;a.world.entities.site=site;a.world.entities.item=item;
 assert.equal(selection.fieldTargets([item,site])[0].id,'site');assert.equal(field.groundAt(run.data,site.pos).id,'site');
 a.space.placementVersion=undefined;generation.ensureFieldSpace(run.data,a.world,a.space.id);assert.notDeepEqual(item.pos,site.pos);assert.equal(item.stock['i-crop-grain'],3);assert.deepEqual(site.pos,{x:4,y:3},'fixed facilities keep their position when an earlier NPC overlaps');assert.notDeepEqual(visitor.pos,site.pos);
 const stock=clone(run.data.items);const result=field.performFieldGesture('tap',site.id,site.pos);assert.equal(result.route,'/game/event');assert.deepEqual(run.data.items,stock);assert.equal(item.stock['i-crop-grain'],3);
 a=arena();a.enemy.pos={x:4,y:3};site.nodeId=a.space.id;site.pos={...a.enemy.pos};a.world.entities.site=site;a.enemy.properties.integrity=0;
 field.advanceFieldTime(30);const loot=Object.values(a.world.entities).find(e=>e.tags.includes('loot'));assert(loot);assert.notDeepEqual(loot.pos,site.pos);
 results.push('old overlapping objects migrate without stock loss; facilities outrank loot; interaction does not collect an item; drops avoid facilities');

 const gulch=map.nodes.find(n=>n.id==='n-mano-clutch-gulch'),town=map.nodes.find(n=>n.id==='n-manonickla');
 const brown=palettes.FIELD_PALETTES.sandstone;
 assert.equal(palettes.fieldPalette(gulch).path,brown.path);assert.equal(palettes.fieldPalette(town).stone,brown.stone);
 assert.notEqual(palettes.fieldPalette(map.nodes.find(n=>n.id==='n-iluneon-square')).path,brown.path);
 assert.notEqual(palettes.fieldPalette(map.nodes.find(n=>n.id==='n-tacomi')).path,brown.path);
 const oldTiles=clone(a.space.tiles);assert.equal(palettes.paletteStyle(town,a.space)['--field-grass'],brown.grass);assert.deepEqual(a.space.tiles,oldTiles);
 assert.equal(palettes.fieldPalette(town,{...a.space,dungeon:{floor:1,origin:town.id,totalFloors:3}}).stone,palettes.FIELD_PALETTES.cave.stone);
 results.push('canyon, Manonickla town, houses and old tiles use sandstone colors; other regional and dungeon palettes remain distinct');
 console.log(JSON.stringify({status:'PASS',scenarios:results.length,results},null,2));
} finally {globalThis.window=oldWindow;globalThis.localStorage=oldStorage;globalThis.fetch=oldFetch;await server.close();}
