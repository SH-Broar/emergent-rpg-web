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

  const residents=await server.ssrLoadModule('/src/systems/field-residents.ts');
  const calendar=await server.ssrLoadModule('/src/data/npc-calendar.ts');
  const geography=await server.ssrLoadModule('/src/systems/field-geography.ts');
  const sync=await server.ssrLoadModule('/src/systems/world-interaction.ts');
  const results=[],copy=x=>JSON.parse(JSON.stringify(x));
  function reset(){run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:100,maxMp:3});return field.ensureField(run.data);}
  let a=reset(),map=generation.fieldMap(run.data);
  for(const event of calendar.RESIDENT_EVENTS){assert(data.npcs.has(event.npcId));assert(map.nodes.some(n=>n.id===event.nodeId));assert(event.start<event.end);}
  const coordinates=JSON.stringify(map.nodes),npcDefs=[...data.npcs.values()].filter(n=>map.nodes.some(p=>p.id===n.homeNodeId));
  assert.equal(Object.values(a.world.entities).filter(e=>e.npcId).length,npcDefs.length);
  let houses=0;
  for(const npc of npcDefs){
    const home=generation.ensureFieldSpace(run.data,a.world,calendar.homeId(npc)),court=a.world.spaces[calendar.courtId(npc.homeNodeId)];
    assert.deepEqual([home.width,home.height],[6,6]);assert.equal(home.residence.npcId,npc.id);houses++;
    const entry=court.exits.find(e=>e.to===home.id),back=home.exits.find(e=>e.to===court.id);
    const d=geography.inward(court,entry.pos),b=geography.inward(home,back.pos);assert.equal(d.x+b.x,0);assert.equal(d.y+b.y,0);
    for(const exit of home.exits)assert(spatial.fieldPath(a.world,home.id,home.spawn,exit.pos,'player'));
    for(const e of Object.values(a.world.entities).filter(e=>e.nodeId===home.id&&!e.npcId)){assert.equal(e.ownerId,'npc:'+npc.id);assert(spatial.fieldPath(a.world,home.id,home.spawn,e.pos,'player',true));}
  }
  assert.equal(JSON.stringify(map.nodes),coordinates);
  const court=a.world.spaces[calendar.courtId('n-iluneon-square')],hako=data.npcs.get('npc-hako'),house=a.world.spaces[calendar.homeId(hako)];
  run.data.currentNodeId=court.id;a.player.nodeId=court.id;
  const door=court.exits.find(e=>e.to===house.id);a.player.pos=copy(door.pos);
  assert(field.travelField(house.id).ok);const back=house.exits[0];a.player.pos=copy(back.pos);assert(field.travelField(court.id).ok);
  const homeObject=Object.values(a.world.entities).find(e=>e.nodeId===house.id&&e.tags.includes('storage'));homeObject.stock={water:1};homeObject.properties.integrity=0;
  generation.ensureFieldSpace(run.data,a.world,house.id);assert.deepEqual(homeObject.stock,{water:1});assert.equal(homeObject.properties.integrity,0);
  results.push(houses+' individual 6x6 homes, owned usable furniture, reciprocal direction and no regeneration');

  a=reset();const custom={id:'kept-object',name:'남겨 둔 물건',kind:'resource',nodeId:a.space.id,pos:{x:2,y:2},colors:{},stock:{water:3},tags:[],properties:{integrity:37}};a.world.entities[custom.id]=custom;
  const shape=[a.space.width,a.space.height],oldExits=copy(a.space.exits.filter(e=>e.destination));delete a.space.housingVersion;a.space.exits=oldExits;
  generation.ensureFieldSpace(run.data,a.world,a.space.id);assert.deepEqual([a.space.width,a.space.height],shape);assert.deepEqual(a.world.entities[custom.id],custom);
  assert(a.space.exits.some(e=>e.to.endsWith('::residents')));assert(a.space.exits.some(e=>e.to.endsWith('::commons')));
  const common=generation.ensureFieldSpace(run.data,a.world,calendar.commonId(a.space.nodeId));
  assert(Object.values(a.world.entities).some(e=>e.nodeId===common.id&&e.tags.includes('field-plot')));assert(Object.values(a.world.entities).some(e=>e.nodeId===common.id&&e.workRecipe));
  results.push('old maps gain residences without changing dimensions, objects, geography or existing exits; village commons support rest, food, work and crops');

  const actor=a.world.entities['npc:npc-hako'];actor.properties.integrity=0;field.ensureField(run.data);assert.equal(actor.properties.integrity,0);
  delete a.world.entities[actor.id];field.ensureField(run.data);assert(!a.world.entities[actor.id]);
  run.saveActiveRun();run.$reset();assert(run.loadActiveRun());field.ensureField(run.data);assert(!run.data.interactionWorld.entities[actor.id]);
  results.push('dead or removed identities stay absent across map entry, schedule updates and real save/load');

  a=reset();let person=a.world.entities['npc:npc-hako'];
  const home=generation.ensureFieldSpace(run.data,a.world,calendar.homeId(hako));
  // Isolate navigation from other residents intentionally occupying the same corridors.
  a.world.entities=Object.fromEntries(Object.entries(a.world.entities).filter(([id,e])=>!e.npcId||id===person.id));
  run.data.field.elapsedSeconds=10*3600;person.routine=undefined;
  const start=copy(person.pos);residents.tickResidentSchedules(run.data,a.world,new Set([person.id]));
  assert.equal(person.nodeId,a.space.id);assert(spatial.distance(start,person.pos)<=1,'visible movement stays orthogonal');
  for(let i=0;i<100&&person.nodeId!==home.id;i++){run.data.field.elapsedSeconds+=30;residents.tickResidentSchedules(run.data,a.world,new Set([person.id]));}
  assert.equal(person.nodeId,home.id,'resident walks home using actual exits');
  assert.equal(person.routine.activity,'집에서 쉬는 중');
  results.push('visible schedule moves one orthogonal cell at a time and follows house entrances');

  a=reset();person=a.world.entities['npc:npc-cayo'];person.nodeId='n-manonickla';person.pos=undefined;person.routine=undefined;
  const loaded=Object.keys(a.world.spaces).length;
  run.data.field.elapsedSeconds=10*3600;residents.tickResidentSchedules(run.data,a.world,new Set());
  const trip=copy(person.routine.travel);assert(trip);run.data.field.elapsedSeconds+=30;residents.tickResidentSchedules(run.data,a.world,new Set());assert.equal(person.nodeId,'n-manonickla');
  person.properties['status:anchored']=2;const arrival=person.routine.travel.arrivesAt;run.data.field.elapsedSeconds+=30;residents.tickResidentSchedules(run.data,a.world,new Set());assert.equal(person.nodeId,'n-manonickla');assert.equal(person.routine.travel.arrivesAt,arrival+30);
  person.properties['status:anchored']=0;run.saveActiveRun();run.$reset();assert(run.loadActiveRun());a=field.ensureField(run.data);person=a.world.entities['npc:npc-cayo'];
  run.data.field.elapsedSeconds=person.routine.travel.arrivesAt;residents.tickResidentSchedules(run.data,a.world,new Set());assert.equal(person.nodeId,trip.to);
  assert.equal(Object.keys(a.world.spaces).length,loaded,'remote journeys do not generate their maps');
  results.push('offscreen travel waits for arrival, pauses under restraints, survives saving and avoids generating distant maps');

  a=reset();person=a.world.entities['npc:npc-hako'];a.world.entities=Object.fromEntries(Object.entries(a.world.entities).filter(([id,e])=>!e.npcId||id===person.id));
  run.data.field.elapsedSeconds=10*3600;person.pos={x:4,y:4};person.routine=undefined;
  for(const p of spatial.cardinal(person.pos))a.space.tiles[p.y][p.x]='wall';
  for(let i=0;i<20;i++){run.data.field.elapsedSeconds+=30;residents.tickResidentSchedules(run.data,a.world,new Set());}
  assert.equal(person.nodeId,a.space.id);assert.deepEqual(person.pos,{x:4,y:4});assert(!person.routine.travel);

  for(const p of spatial.cardinal(person.pos))a.space.tiles[p.y][p.x]='path';
  run.data.field.elapsedSeconds+=30;residents.tickResidentSchedules(run.data,a.world,new Set());assert(person.routine.travel);
  for(const p of spatial.cardinal(person.pos))a.space.tiles[p.y][p.x]='wall';
  run.data.field.elapsedSeconds=person.routine.travel.arrivesAt;residents.tickResidentSchedules(run.data,a.world,new Set());assert.equal(person.nodeId,a.space.id,'new obstruction cancels an already planned arrival');
  results.push('physical obstructions cannot be bypassed before departure or after a journey was planned');

  a=reset();const event=calendar.RESIDENT_EVENTS.find(e=>e.id==='echo-repair');
  const site=generation.ensureFieldSpace(run.data,a.world,event.nodeId);run.data.currentNodeId=site.id;a.player.nodeId=site.id;
  a.world.entities=Object.fromEntries(Object.entries(a.world.entities).filter(([id,e])=>!e.npcId||id==='npc:npc-echo'));
  person=a.world.entities['npc:npc-echo'];person.nodeId=site.id;person.pos={x:2,y:2};a.player.pos={x:2,y:3};site.tiles[2][2]='path';site.tiles[3][2]='path';
  run.data.field.elapsedSeconds=(3-1)*86400+10*3600-43200;
  assert(calendar.eventActive(event,run.data.field.elapsedSeconds));assert(field.speechFor(run.data,person).topics.some(t=>t.action==='resident-event:'+event.id));
  a.player.stock['raw-fiber']=1;const before=JSON.stringify(a.player.stock);
  assert.equal(field.performFieldService(person.id,'resident-event:'+event.id).ok,false);assert.equal(JSON.stringify(a.player.stock),before);
  a.player.stock['raw-fiber']=2;const xp=run.data.lifeXp??0,trust=person.agent.relations.player?.trust??0;
  const result=field.performFieldService(person.id,'resident-event:'+event.id);assert(result.ok,result.message);assert.equal(a.player.stock['raw-fiber'],0);assert.equal(a.player.stock['i-material-common'],2);assert((person.agent.relations.player?.trust??0)>trust);assert(run.data.lifeXp>xp);
  const after=JSON.stringify(a.player.stock);assert.equal(field.performFieldService(person.id,'resident-event:'+event.id).ok,false);assert.equal(JSON.stringify(a.player.stock),after);
  run.saveActiveRun();run.$reset();assert(run.loadActiveRun());a=field.ensureField(run.data);person=a.world.entities[person.id];assert.equal(field.performFieldService(person.id,'resident-event:'+event.id).ok,false);
  run.data.field.elapsedSeconds+=86400*7;assert(calendar.eventActive(event,run.data.field.elapsedSeconds));
  a.player.stock['raw-fiber']=2;person.properties.integrity=0;assert.equal(field.performFieldService(person.id,'resident-event:'+event.id).ok,false);
  person.properties.integrity=100;person.nodeId='away';assert.equal(field.performFieldService(person.id,'resident-event:'+event.id).ok,false);
  person.nodeId=event.nodeId;person.pos={x:2,y:2};a.player.pos={x:2,y:3};person.properties['status:sleep']=1;assert.equal(field.performFieldService(person.id,'resident-event:'+event.id).ok,false);
  person.properties['status:sleep']=0;run.data.field.elapsedSeconds+=4*3600;assert.equal(field.performFieldService(person.id,'resident-event:'+event.id).ok,false);
  results.push('calendar dialogue, atomic material conversion, life growth and relationship change; once per occurrence with stale/dead/away/sleeping/time checks');
  assert.equal(calendar.eventActive(calendar.RESIDENT_EVENTS.find(e=>e.id==='hako-welcome'),86400+12*3600-43200),true);
  assert.equal(calendar.eventActive(calendar.RESIDENT_EVENTS.find(e=>e.id==='hako-welcome'),2*86400+12*3600-43200),false);
  assert.equal(calendar.worldDate(0).hour,12);assert.equal(calendar.worldDate(7*86400).weekday,0);
  results.push('noon start, weekday rollover and single journey-date event windows');
  console.log(JSON.stringify({status:'PASS',houses,events:calendar.RESIDENT_EVENTS.length,scenarios:results.length,results},null,2));
} finally {globalThis.window=oldWindow;globalThis.localStorage=oldStorage;globalThis.fetch=oldFetch;await server.close();}
