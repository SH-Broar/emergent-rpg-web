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


  const skills=await server.ssrLoadModule('/src/systems/field-skills.ts');
  const status=await server.ssrLoadModule('/src/systems/world/status.ts');
  const results=[];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const snapshot=()=>JSON.stringify({hp:run.data.hp,mp:run.data.mp,time:run.data.field.elapsedSeconds,skills:run.data.field.skills,collection:run.data.collection,entities:Object.values(run.data.interactionWorld.entities).map(e=>({id:e.id,pos:e.pos,properties:e.properties,stock:e.stock})),sequence:run.data.interactionWorld.sequence});
  function reset(){
    run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:50,maxMp:3,timeLimit:300});
    const a=field.ensureField(run.data);
    a.world.entities={player:a.player};a.space.width=9;a.space.height=9;a.space.tiles=Array.from({length:9},()=>Array(9).fill('grass'));a.space.exits=[];
    a.player.pos={x:4,y:4};a.player.colors={};run.data.colors={fire:0,electric:0,earth:0,iron:0,water:0,wind:0,light:0,dark:0};run.data.relics=[];
    return a;
  }
  function add(a,id='test',effects=[{kind:'damage',value:10}],extra={}){
    const card={id,instanceId:id+':copy',name:id,rank:'common',source:'race',cost:1,trigger:'manual',effects,shape:[{dx:0,dy:-1}],targetMode:'pattern',castSpeed:'fast',...extra};
    run.data.collection.push(card);run.data.deck.push(card);
    const glyph=skills.skillFitsGesture(card,'triangle')?'triangle':skills.SKILL_GESTURES.find(g=>skills.skillFitsGesture(card,g));
    assert.equal(skills.equipFieldSkill(run.data,glyph,card.instanceId),undefined);
    return run.data.collection.at(-1);
  }
  function target(a,id='dummy',pos={x:4,y:3}){
    const e={id,name:id,kind:'actor',nodeId:a.space.id,pos,colors:{},stock:{},tags:[],properties:{integrity:100,maxHp:100}};
    a.world.entities[id]=e;return a.world.entities[id];
  }
  let a=reset(),card=add(a),enemy=target(a);
  const start=run.data.field.elapsedSeconds;
  assert.equal(field.performFieldGesture('triangle',enemy.id,enemy.pos).ok,true);
  assert.equal(enemy.properties.integrity,90);assert.equal(run.data.mp,2);assert.equal(run.data.field.elapsedSeconds,start+30);
  assert.equal(skills.skillRemaining(run.data,card),2);
  let before=snapshot();
  assert.equal(field.performFieldGesture('triangle',enemy.id,enemy.pos).ok,false);
  assert.equal(snapshot(),before,'cooldown rejection changes no resources, time or state');
  field.advanceFieldTime(60);assert.equal(skills.skillRemaining(run.data,card),0);
  assert.equal(run.data.mp,3);
  results.push('one mana, two remaining turns after use, no-spend rejection, shared two-turn mana recovery');

  a=reset();card=add(a);enemy=target(a);
  a.space.tiles[3][4]='wall';before=snapshot();
  assert.equal(field.performFieldGesture('triangle',enemy.id,enemy.pos).ok,false);
  assert.equal(snapshot(),before);
  a.space.tiles[3][4]='grass';run.data.mp=0;field.ensureField(run.data);before=snapshot();
  assert.equal(field.performFieldGesture('triangle',enemy.id,enemy.pos).ok,false);assert.equal(snapshot(),before);
  run.data.mp=3;field.ensureField(run.data);
  assert.equal(skills.skillMana({...card,cost:0}),1);
  assert(skills.skillUnavailable({...card,cost:4}));
  assert(skills.skillUnavailable({...card,effects:[...card.effects,{kind:'random-effect',value:1}]}));
  results.push('range, mana and partially unported skills reject atomically; zero-cost legacy skills consume mana');

  a=reset();card=add(a,'slow',[{kind:'damage',value:12}],{cost:2,castSpeed:'slow'});enemy=target(a);
  assert(field.performFieldGesture('triangle',enemy.id,enemy.pos).ok);
  assert.equal(enemy.properties.integrity,100);assert(run.data.field.skills.pending);
  run.saveActiveRun();run.$reset();assert(run.loadActiveRun(),'pending cast reloads through real save path');a.world=run.data.interactionWorld;a.player=a.world.entities.player;enemy=a.world.entities.dummy;
  enemy.pos={x:5,y:3};
  field.advanceFieldTime(30);assert.equal(enemy.properties.integrity,100,'locked cast misses a departing target');
  assert.equal(run.data.field.skills.pending,undefined);
  assert.equal(skills.skillRemaining(run.data,card),3);
  assert.equal(skills.equipFieldSkill(run.data,'square',card.instanceId),undefined);
  assert.equal(skills.equippedSkill(run.data,'triangle'),undefined);
  assert.equal(skills.equippedSkill(run.data,'square').instanceId,card.instanceId);
  assert.equal(skills.skillRemaining(run.data,card),3);
  run.data.collection.push({...clone(card),instanceId:'copy-two'});
  assert.equal(skills.equipFieldSkill(run.data,'star','copy-two'),undefined);
  assert.equal(skills.skillRemaining(run.data,run.data.collection.at(-1)),3);
  assert.equal(skills.equippedSkill(run.data,'square'),undefined);
  results.push('slow cast and locked cells survive serialization; swapping, copies and awakening share cooldown');

  a=reset();card=add(a,'area',[{kind:'damage',value:20}],{shape:[{dx:-1,dy:-1},{dx:0,dy:-1},{dx:1,dy:-1}],perTileMul:[.25,1,.5]});
  a.space.tiles[3][3]='wall';enemy=target(a);const side=target(a,'side',{x:5,y:3});
  const preview=skills.fieldSkillCells(a.world,a.player,card,{x:0,y:0});
  assert.deepEqual(preview.map(c=>c.multiplier),[1,.5]);
  field.performFieldGesture('triangle',enemy.id,enemy.pos);
  assert.equal(enemy.properties.integrity,80);assert.equal(side.properties.integrity,90);
  assert(a.world.events.some(e=>e.targetId==='dummy'&&e.property==='integrity'&&e.pos.x===4&&e.pos.y===3));
  results.push('authored fixed shape, per-tile multipliers and positioned damage match the preview');

  a=reset();card=add(a,'aim',[{kind:'damage',value:10}],{targetMode:'aimed',shape:[{dx:0,dy:0}],aimRange:3});
  enemy=target(a,'far',{x:4,y:1});a.space.tiles[2][4]='wall';
  assert.equal(field.performFieldGesture('triangle',enemy.id,enemy.pos).ok,false);
  a.space.tiles[2][4]='grass';assert(field.performFieldGesture('triangle',enemy.id,enemy.pos).ok);assert.equal(enemy.properties.integrity,90);
  results.push('aimed spells retain authored range and cannot pass through walls');

  a=reset();card=add(a,'guard',[{kind:'block',value:10}],{targetMode:'self',enhanceLevel:3});
  field.performFieldGesture('triangle','player',a.player.pos);
  assert.equal(a.player.properties.guard,7,'+3 scales 10 to 14 then one action turn halves guard');
  a=reset();card=add(a,'status',[{kind:'apply-status',value:2,target:'enemy',params:{status:'poison'}}]);enemy=target(a);
  field.performFieldGesture('triangle',enemy.id,enemy.pos);assert.equal(enemy.properties.integrity,98);assert.equal(status.status(enemy,'poison'),1);
  results.push('equipped instance enhancement affects real guard; poison uses shared turn and damage processing');

  a=reset();card=add(a,'water',[{kind:'terrain-water',value:3}]);enemy=target(a);
  const barrel=target(a,'barrel',{x:4,y:3});barrel.kind='prop';barrel.properties.flammability=1;
  field.performFieldGesture('triangle',enemy.id,enemy.pos);
  assert((barrel.properties.moisture??0)>0);
  results.push('terrain skills influence actors and objects through the shared material router');

  const supported=[...data.cards.values()].filter(c=>c.source!=='form'&&!skills.skillUnavailable(c)); // Form-only casts have their own lifecycle test.
  assert(supported.length>100);
  for(const def of supported){
    a=reset();card=add(a,def.id,clone(def.effects),{...clone(def),instanceId:def.id+':audit'});
    const cells=skills.fieldSkillCells(a.world,a.player,card,{x:4,y:2});
    for(const [i,c]of cells.entries()) if(spatial.distance(c.pos,a.player.pos)>0)target(a,'target-'+i,c.pos);
    const glyph=skills.SKILL_GESTURES.find(g=>skills.equippedSkill(run.data,g)?.instanceId===card.instanceId);
    const result=field.performFieldGesture(glyph,undefined,{x:4,y:2},{drawn:true,quality:1});
      assert(result.ok,def.id+': '+result.message);field.advanceFieldTime(30);
    for(const entity of Object.values(a.world.entities))for(const value of Object.values(entity.properties))assert(Number.isFinite(value),def.id+' produces only finite properties');
  }
  results.push(supported.length+' complete runtime card definitions execute without partial-effect fallbacks or invalid values');
  console.log(JSON.stringify({status:'PASS',scenarios:results.length,supportedCards:supported.length,results},null,2));
} finally {
  globalThis.window=oldWindow;globalThis.localStorage=oldStorage;globalThis.fetch=oldFetch;await server.close();
}
