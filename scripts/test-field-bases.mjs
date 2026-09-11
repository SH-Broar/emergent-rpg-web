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




  const bases=await server.ssrLoadModule('/src/systems/field-bases.ts');
  const skills=await server.ssrLoadModule('/src/systems/field-skills.ts');
  const forms=await server.ssrLoadModule('/src/systems/field-transformation.ts');
  const combat=await server.ssrLoadModule('/src/systems/field-combat.ts');
  const worldSync=await server.ssrLoadModule('/src/systems/world-interaction.ts');
  const progression=await server.ssrLoadModule('/src/systems/progression.ts');
  const {useMetaStore}=await server.ssrLoadModule('/src/stores/meta.ts');
  const calendar=await server.ssrLoadModule('/src/data/npc-calendar.ts');
  const results=[],clone=x=>JSON.parse(JSON.stringify(x));
  function reset(){
    run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:100,maxMp:3,timeLimit:1});
    const a=field.ensureField(run.data);generation.ensureFieldSpace(run.data,a.world,bases.playerHomeId("n-iluneon-square"));return a;
  }
  function locate(id){
    run.data.currentNodeId=id;run.data.interactionWorld.entities.player.nodeId=id;
    const a=field.ensureField(run.data);a.player.pos={...a.space.spawn};return a;
  }
  function enter(id){
    const a=field.ensureField(run.data),exit=a.space.exits.find(e=>e.to===id);assert(exit,id);
    a.player.pos={...exit.pos};return field.travelField(id);
  }
  function kill(){run.data.hp=0;run.data.interactionWorld.entities.player.properties.integrity=0;field.advanceFieldTime(30);}
  function tamamo(a){
    // An isolated arena lets these tests assert priority against a prepared lethal spell.
    a.world.entities={player:a.player};a.space.width=9;a.space.height=9;a.space.tiles=Array.from({length:9},()=>Array(9).fill('grass'));a.space.exits=[];
    a.player.pos={x:4,y:4};
    const e=generation.spawnCreature(run.data,a.world,a.space,data.bosses.get('bs-arc-tamamo'),0,'boss');
    e.pos={x:4,y:3};return e;
  }
  for(const [seconds,expected] of [[0,75600],[43170,75600],[43200,118800],[75570,118800],[75600,162000],[129600,205200]]){
    assert.equal(bases.wakeTime(seconds),expected);
  }
  results.push('noon, 23:59:30, midnight, 08:59:30 and exact 09:00 recovery boundaries across days');

  let a=reset();const initial=bases.playerHomeId('n-iluneon-square');
  assert(run.data.field.bases.owned['n-iluneon-square']);
  assert(bases.configurationFailure(run.data));
  const profession=run.data.profession;assert(run.setProfession('artisan'));assert.equal(run.data.profession,profession);
  const slots=clone(run.data.field.skills.slots);assert(skills.equipFieldSkill(run.data,'triangle'));assert.deepEqual(run.data.field.skills.slots,slots);
  locate('n-iluneon-square::commons');assert(enter(initial).ok);
  assert.equal(bases.configurationFailure(run.data),undefined);assert.equal(run.setProfession('artisan'),undefined);assert.equal(run.data.profession,'artisan');
  assert.equal(skills.equipFieldSkill(run.data,'triangle'),undefined);
  assert.equal(run.data.field.bases.lastHouse,initial);
  results.push('starting home is free and reachable; manual equipment and profession changes require a real base');

  a=locate('n-moss::commons');const own=bases.playerHomeId('n-moss'),door=a.world.entities[a.space.id+':field:base-build'];
  assert(door);assert.equal(enter(own).ok,false);assert(field.travelField(own).speech);
  const stock=clone(a.player.stock);assert.equal(field.performFieldService(door.id,'base:build').ok,false);assert.deepEqual(a.player.stock,stock);
  for(const [id,n]of Object.entries(bases.HOME_COST))a.player.stock[id]=(a.player.stock[id]??0)+n;
  worldSync.syncPlayerFromWorld(run.data,a.world);
  assert.equal(field.performFieldService(door.id,'base:build').ok,true);
  const afterBuild=clone(a.player.stock);assert.equal(field.performFieldService(door.id,'base:build').ok,false);assert.deepEqual(a.player.stock,afterBuild);
  assert(enter(own).ok);assert.equal(run.data.field.bases.lastHouse,own);
  a=field.ensureField(run.data);assert.equal(a.space.width,6);assert.equal(a.space.height,6);
  run.saveActiveRun();run.$reset();assert(run.loadActiveRun());assert(run.data.field.bases.owned['n-moss']);
  results.push('construction uses an atomic material transaction once, opens a 6x6 home and survives save/load');

  a=locate('n-moss::commons');const inn=bases.innId('n-moss'),counter=a.world.entities[a.space.id+':field:base-rent'];
  assert.equal(enter(inn).ok,false);run.data.gold=9;assert.equal(field.performFieldService(counter.id,'base:rent').ok,false);assert.equal(run.data.gold,9);
  run.data.gold=20;const purchasedAt=run.data.field.elapsedSeconds;
  assert.equal(field.performFieldService(counter.id,'base:rent').ok,true);assert.equal(run.data.gold,10);assert.equal(run.data.field.bases.rentals['n-moss'],purchasedAt+86400);
  assert(enter(inn).ok);assert.equal(bases.configurationFailure(run.data),undefined);
  run.data.field.elapsedSeconds=purchasedAt+86400;assert(bases.configurationFailure(run.data));assert(run.setProfession('grower'));
  assert.equal(run.data.field.bases.lastHouse,own,'a rented room does not replace a visited house');
  results.push('inn costs 10 gold, expires exactly 24 hours after payment and locks configuration even inside the room');

  a=reset();const npc=data.npcs.get('npc-cassis'),home=calendar.homeId(npc);
  locate(calendar.courtId(npc.homeNodeId));assert(enter(home).ok);assert.equal(run.data.field.bases.lastHouse,home);assert(bases.configurationFailure(run.data));
  locate('n-iluneon-square');run.data.lives=0;const cards=clone(run.data.collection),gold=run.data.gold,start=run.data.field.elapsedSeconds;
  kill();assert.equal(run.data.currentNodeId,home);assert.equal(run.data.field.elapsedSeconds,bases.wakeTime(start));assert.equal(run.data.hp,run.data.maxHp);assert.equal(run.data.mp,3);assert.equal(run.data.ended,false);assert.equal(run.data.lives,0);
  assert.equal(run.data.gold,gold);assert.deepEqual(run.data.collection,cards);
  run.saveActiveRun();run.$reset();assert(run.loadActiveRun());
  for(let i=0;i<3;i++)kill();assert.equal(run.data.field.bases.knockouts,4);assert(!run.data.ended);assert(run.active);
  results.push('latest visited NPC house wins; zero-life legacy saves and repeated deaths retain inventory, gold and active journey');

  a=reset();const plot=Object.values(a.world.entities).find(e=>e.tags.includes('field-plot'));
  assert(plot);plot.production={startedTurn:0,duration:10,output:{'i-crop-grain':2},settled:false};
  const count=Object.keys(a.world.spaces).length,dead=Object.values(a.world.entities).find(e=>e.npcId);dead.properties.integrity=0;
  const began=performance.now();kill();const ms=performance.now()-began;
  assert(plot.production.settled);assert(plot.stock['i-crop-grain']>=2);assert.equal(dead.properties.integrity,0);
  assert(Object.keys(a.world.spaces).length<=count+2,'overnight schedules do not generate distant regions');
  assert.equal(run.data.currentDay,calendar.worldDate(run.data.field.elapsedSeconds).day);
  results.push('overnight crops, calendar and existing resident travel settle without resurrection or distant map generation ('+Math.round(ms)+'ms)');

  for(const entry of ['tap','instant','pending','intro']){
    a=reset();const boss=tamamo(a);
    engine.influenceEntity(a.world,a.player,'form:race-form-fox',1,'tamamo');forms.reconcileFieldTransformation(run.data,a.world);
    const card=run.data.collection.find(c=>c.id==='c-fox-apprentice-fire'),glyph=skills.SKILL_GESTURES.find(g=>skills.equippedSkill(run.data,g)?.id===card.id);
    const before=clone(run.data.collection),goldBefore=run.data.gold,bossHp=boss.properties.integrity;
    if(entry==='pending'){boss.creature.engaged=true;run.data.field.skills.pending={card:{...clone(card),effects:[{kind:'damage',value:99999}]},nodeId:a.space.id,cells:[{pos:{...boss.pos},multiplier:1}],due:0,paid:1,power:1};field.advanceFieldTime(30);}
    if(entry==='instant'){boss.creature.engaged=true;field.performFieldGesture(glyph,boss.id,boss.pos,{quality:1,drawn:true});}
    if(entry==='tap')field.performFieldGesture('tap',boss.id,boss.pos);
    if(entry==='intro'){run.data.field.encounter={actorId:boss.id,name:boss.name,lines:['…']};combat.resolveFieldEncounter(run.data,true);field.advanceFieldTime(0);}
    assert.equal(run.data.currentNodeId,initial,entry);assert.equal(run.data.field.bases.knockouts,1,entry);assert(run.data.transform,entry);
    assert.equal(boss.properties.integrity,bossHp,entry);assert.equal(run.data.gold,goldBefore,entry);assert(!boss.creature.defeated,entry);assert(!run.data.arcsCleared.includes('bs-arc-tamamo'),entry);assert.deepEqual(run.data.collection,before,entry);
  }
  results.push('fox submission precedes taps, instant skills, saved pending spells and encounter confirmation; no boss kill or reward');

  a=reset();const final=[...data.bosses.values()].find(b=>b.kind!=='arc');assert(final);
  const enemy=generation.spawnCreature(run.data,a.world,a.space,final,0,'boss');enemy.properties.integrity=0;
  run.data.field.elapsedSeconds=90000;const history=useMetaStore().runHistory.length;
  field.advanceFieldTime(30);assert.equal(run.data.endReason,'boss-cleared');assert.equal(run.data.field.clearedAt,90030);
  const record=useMetaStore().runHistory[0];assert.equal(record.elapsedSeconds,90030);assert.equal(record.days,2);assert.equal(useMetaStore().runHistory.length,history+1);
  progression.absorbRunIntoMeta(run.data);assert.equal(useMetaStore().runHistory.length,history+1);
  const stored=[...saved.values()].some(value=>value.includes('"elapsedSeconds":90030'));assert(stored,'clear duration is persisted immediately');
  results.push('final boss records exact elapsed time immediately and the ending screen cannot award or record twice');

  console.log(JSON.stringify({status:'PASS',scenarios:results.length,results},null,2));
} finally {globalThis.window=oldWindow;globalThis.localStorage=oldStorage;globalThis.fetch=oldFetch;await server.close();}
