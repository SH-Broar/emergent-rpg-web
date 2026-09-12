import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root=fileURLToPath(new URL('../',import.meta.url)),saved=new Map();
const old={window:globalThis.window,storage:globalThis.localStorage,fetch:globalThis.fetch};
globalThis.window={setTimeout:()=>0};
globalThis.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
const server=await createServer({root,server:{middlewareMode:true,hmr:false},appType:'custom'});
const results=[],failures=[];
try {
  setActivePinia(createPinia());
  const mod=path=>server.ssrLoadModule('/src/'+path);
  const {useRunStore}=await mod('stores/run.ts'),{useDataStore}=await mod('stores/data.ts');
  const {loadAllData}=await mod('data/loader.ts');
  globalThis.fetch=async url=>new Response(readFileSync(join(root,'public',String(url).replace(/^\//,'')),'utf8'));
  const data=useDataStore();data.data=await loadAllData('/');
  const field=await mod('systems/field-simulation.ts'),casting=await mod('systems/field-casting.ts');
  const generation=await mod('systems/field-generation.ts'),spatial=await mod('systems/world/spatial.ts');
  const combat=await mod('systems/field-combat.ts'),journey=await mod('systems/field-journey.ts');
  const social=await mod('systems/world/social.ts'),engine=await mod('systems/world/engine.ts');
  const inventory=await mod('systems/world-interaction.ts');
  const timeline=[...data.timelines.values()].find(t=>data.nodeMaps.get(t.nodeMapId)?.nodes.some(n=>n.id==='n-iluneon-square'));
  const run=useRunStore();
  function check(name,fn) {
    try {fn();results.push(name);console.log('PASS '+name);}
    catch(error){failures.push(name+': '+error.message);console.error('FAIL '+name+': '+error.message);}
  }
  function arena() {
    run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:100,maxMp:3,timeLimit:300});
    const a=field.ensureField(run.data);
    a.world.entities={player:a.player};run.data.relics=[];
    a.space.width=9;a.space.height=9;a.space.exits=[];
    a.space.tiles=Array.from({length:9},()=>Array(9).fill('grass'));
    a.player.pos={x:4,y:6};a.player.colors={};
    a.player.properties.guard=0;a.player.properties.integrity=100;
    run.data.mp=3;run.data.hp=100;run.data.field.manaStep=0;
    field.ensureField(run.data);
    return a;
  }
  function target(a,id='object',pos={x:4,y:5},properties={}) {
    return a.world.entities[id]={id,name:id,kind:'resource',nodeId:a.space.id,pos:{...pos},tags:['test-target'],colors:{},stock:{},
      properties:{integrity:100,portable:1,mass:1,...properties}};
  }
  function actor(a,id,pos,properties={}) {
    const e=target(a,id,pos,{maxHp:100,...properties});e.kind='actor';return e;
  }
  function core(a) {
    return JSON.stringify({time:run.data.field.elapsedSeconds,mp:run.data.mp,hp:run.data.hp,manaStep:run.data.field.manaStep,
      gestureXp:run.data.field.gestureXp,practiceAt:run.data.field.practiceAt,
      entities:Object.values(a.world.entities).map(e=>({id:e.id,nodeId:e.nodeId,pos:e.pos,carriedBy:e.carriedBy,properties:e.properties,stock:e.stock}))});
  }
  function reject(a,id,targetId,pos) {
    field.ensureField(run.data);
    const before=core(a),result=field.performFieldColor(id,targetId,pos);
    assert.equal(result.ok,false,'input should be rejected');
    assert.equal(core(a),before,'rejected input must not mutate physical state, resources, practice or time');
    return result;
  }
  function bomb(a,pos) {
    const card=data.cards.get('c-smi-bomb'),effect=card.effects.find(e=>e.kind==='place-installation');
    assert(card&&effect,'actual bomb card must be loaded');
    const before=new Set(Object.keys(a.world.entities));
    assert(casting.resolveCastingEffect({run:run.data,world:a.world,card,effect,cells:[{pos,multiplier:1}],targets:[],value:effect.value??0}));
    const trap=Object.values(a.world.entities).find(e=>!before.has(e.id)&&e.tags.includes('installation'));assert(trap);
    // Installation setup uses the real casting effect. All arming, contact and damage below use public field entry points.
    field.advanceFieldTime(30,false);
    return trap;
  }
  const color=(id,e)=>field.performFieldColor(id,e?.id,e?.pos??{x:4,y:5});

  check('COLOR spends real mana and 30 seconds; two paid turns restore exactly one mana',()=>{
    const a=arena(),e=target(a);const time=run.data.field.elapsedSeconds;
    assert(color('light:out',e).ok);assert.equal(run.data.mp,2);assert.equal(a.player.properties.mana,2);
    assert.equal(run.data.field.elapsedSeconds,time+30);assert.equal(run.data.field.manaStep,1);
    assert(color('light:out',e).ok);assert.equal(run.data.mp,2);assert.equal(a.player.properties.mana,2);
    assert.equal(run.data.field.elapsedSeconds,time+60);assert.equal(run.data.field.manaStep,0);assert.equal(e.properties.light,6);
    run.saveActiveRun();run.$reset();assert(run.loadActiveRun());
    const loaded=field.ensureField(run.data);
    assert.equal(run.data.mp,2);assert.equal(loaded.world.entities[e.id].properties.light,6);assert.equal(run.data.field.manaStep,0);
  });
  check('insufficient mana, missing water and inapplicable operation are atomic through the public adapter',()=>{
    let a=arena(),e=target(a);run.data.mp=0;reject(a,'electric:out',e.id,e.pos);
    a=arena();e=target(a);a.player.stock.water=0;reject(a,'water:out',e.id,e.pos);
    reject(a,'fire:in',e.id,e.pos);reject(a,'not-a-color',e.id,e.pos);
  });
  check('distance, other maps, another carrier, walls and invalid cells reject without cost',()=>{
    let a=arena(),e=target(a,'object',{x:4,y:2});reject(a,'electric:out',e.id,e.pos);
    e.nodeId='n-luna-academy';reject(a,'light:out',e.id,{x:4,y:5});
    e.nodeId=a.space.id;e.pos=undefined;e.carriedBy='other';reject(a,'light:out',e.id,{x:4,y:5});
    a=arena();e=target(a,'object',{x:4,y:3});a.space.tiles[4][4]='wall';reject(a,'light:out',e.id,e.pos);
    reject(a,'light:out',e.id,{x:-1,y:5});reject(a,'light:out',e.id,{x:1.5,y:5});
  });
  check('sleep and paralysis stop COLOR; anchored still permits non-movement work',()=>{
    let a=arena(),e=target(a);a.player.properties['status:sleep']=1;reject(a,'light:out',e.id,e.pos);
    a=arena();e=target(a);a.player.properties['status:paralyze']=1;reject(a,'light:out',e.id,e.pos);
    a=arena();e=target(a);a.player.properties['status:anchored']=2;const pos={...a.player.pos};
    assert(color('light:out',e).ok);assert.deepEqual(a.player.pos,pos);
  });
  check('self selection and empty-ground selection commit useful effects without moving the player',()=>{
    let a=arena();const pos={...a.player.pos};assert(color('iron:out',a.player).ok);assert(a.player.properties.hardness>0);
    assert.deepEqual(a.player.pos,pos);assert.equal(run.data.mp,2);
    a=arena();run.data.items.push({...data.items.get('i-life-ore'),instanceId:'color-test-ore'});
    assert(field.performFieldColor('earth:out',undefined,{x:4,y:5}).ok);
    const ground=Object.values(a.world.entities).find(e=>e.kind==='terrain'&&e.pos?.x===4&&e.pos?.y===5);
    assert(ground);assert.equal(ground.properties.solid,1);assert.equal(a.player.stock['i-life-ore'],0);
    assert(!spatial.walkable(a.world,a.space.id,ground.pos));
    assert(field.performFieldColor('earth:in',ground.id,ground.pos).ok);
    assert(spatial.walkable(a.world,a.space.id,ground.pos));
  });
  check('failed empty-ground input does not create a phantom world object',()=>{
    const a=arena();run.data.mp=0;reject(a,'electric:out',undefined,{x:3,y:5});
  });
  check('COLOR wind pushes a body onto an armed installation and triggers it once',()=>{
    const a=arena(),e=actor(a,'body',{x:4,y:4}),trap=bomb(a,{x:4,y:3});const time=run.data.field.elapsedSeconds;
    assert(color('wind:out',e).ok);assert.deepEqual(e.pos,{x:4,y:3});assert.equal(e.properties.integrity,90);
    assert.equal(trap.properties.integrity,0);assert.equal(run.data.field.elapsedSeconds,time+30);
    field.advanceFieldTime(30,false);assert.equal(e.properties.integrity,90,'spent trap cannot trigger during subsequent ticks');
    assert(a.world.events.some(f=>f.targetId===e.id&&f.message.includes('발동')));
  });
  check('COLOR wind can use a material object to trip the same geometric installation',()=>{
    const a=arena(),e=target(a,'crate',{x:4,y:4},{hardness:0}),trap=bomb(a,{x:4,y:3});
    assert(color('wind:out',e).ok);assert.deepEqual(e.pos,{x:4,y:3});
    assert.equal(trap.properties.integrity,0);assert.equal(e.properties.integrity,90);
  });
  check('ordinary step triggers an armed trap on arrival and synchronizes HP',()=>{
    const a=arena(),trap=bomb(a,{x:4,y:5});const time=run.data.field.elapsedSeconds;
    assert(field.stepField({x:4,y:5}).ok);assert.equal(trap.properties.integrity,0);
    assert.equal(run.data.hp,90);assert.equal(a.player.properties.integrity,90);
    assert.equal(run.data.field.elapsedSeconds,time+30);
  });
  check('dash triggers a trap along its actual path rather than checking only the landing cell',()=>{
    const a=arena(),trap=bomb(a,{x:4,y:5});const time=run.data.field.elapsedSeconds;
    assert(field.performFieldGesture('dash',undefined,{x:4,y:4},{quality:1,drawn:true}).ok);
    assert.deepEqual(a.player.pos,{x:4,y:4});assert.equal(trap.properties.integrity,0);
    assert.equal(run.data.hp,90);assert.equal(run.data.field.elapsedSeconds,time+30);
  });
  check('the time loop arms and triggers existing contact without direct trigger helper calls',()=>{
    const a=arena(),e=actor(a,'body',{x:4,y:4});
    const card=data.cards.get('c-smi-bomb'),effect=card.effects.find(e=>e.kind==='place-installation');
    assert(casting.resolveCastingEffect({run:run.data,world:a.world,card,effect,cells:[{pos:{x:4,y:3},multiplier:1}],targets:[],value:effect.value??0}));
    const trap=Object.values(a.world.entities).find(e=>e.tags.includes('installation'));assert(trap);
    e.pos={x:4,y:3};field.advanceFieldTime(30,false);
    assert.equal(trap.properties.integrity,0);assert.equal(e.properties.integrity,90);
  });
  check('final boss refuses COLOR before time-20 acceptance and does not spend mana or time for dialogue',()=>{
    const a=arena(),boss=generation.spawnCreature(run.data,a.world,a.space,data.bosses.get('bs-act-1-anchor'),0,'boss');
    boss.pos={x:4,y:4};const time=run.data.field.elapsedSeconds;
    const rejected=reject(a,'electric:out',boss.id,boss.pos);
    assert.match(rejected.message,/마지막 부탁/);assert(!boss.creature.engaged);assert(!run.data.field.encounter);
    journey.ensureJourney(run.data).accepted['time-20']=time+1;
    const result=color('electric:out',boss);assert(!result.ok);
    assert.equal(run.data.field.encounter.actorId,boss.id);assert.equal(run.data.mp,3);
    assert.equal(run.data.field.elapsedSeconds,time);assert.equal(boss.properties.integrity,100);
    combat.resolveFieldEncounter(run.data,false);
  });
  function person(a,id,pos) {
    const e=actor(a,id,pos);e.tags=['person'];
    e.agent=social.createSocialProfile('human','traveler',{homeNodeId:a.space.id,turn:10000});
    return e;
  }
  for (const operation of ['dark:in','earth:out','wind:out']) check(operation+' records forced changes to a person and an observed social consequence',()=>{
    const a=arena(),subject=person(a,'subject',{x:4,y:4}),witness=person(a,'witness',{x:3,y:4});
    engine.observeWorld(a.world,witness.id);const sequence=a.world.sequence;
    assert(color(operation,subject).ok);
    const facts=a.world.events.filter(f=>f.id>sequence&&f.actorId==='player'&&f.targetId===subject.id&&
      (f.kind==='move'||f.property==='status:sleep'||f.property==='status:drowsy'||f.property==='status:anchored'));
    assert(facts.length>0,'the actual forced change must be recorded with its actor and target');
    assert(facts.some(f=>f.witnesses.includes(witness.id)),'nearby person must witness the action');
    assert(witness.agent.relations.player?.trust<0,'witness must regard involuntary movement or restraint as harm');
    assert(witness.agent.beliefs.some(b=>facts.some(f=>f.id===b.factId)&&b.trustDelta<0));
    const trust=witness.agent.relations.player.trust;
    social.processSocialFacts(a.world);assert.equal(witness.agent.relations.player.trust,trust,'the same witnessed facts count only once');
  });
  check('self restraint, ordinary movement and moving an unowned object do not invent social harm',()=>{
    let a=arena(),witness=person(a,'witness',{x:3,y:5});
    engine.observeWorld(a.world,witness.id);assert(color('earth:out',a.player).ok);
    assert.equal(witness.agent.relations.player?.trust??0,0);
    a=arena();witness=person(a,'witness',{x:3,y:5});
    engine.observeWorld(a.world,witness.id);assert(field.stepField({x:4,y:5}).ok);
    assert.equal(witness.agent.relations.player?.trust??0,0);
    a=arena();witness=person(a,'witness',{x:3,y:4});const box=target(a,'box',{x:4,y:4});
    engine.observeWorld(a.world,witness.id);assert(color('wind:out',box).ok);
    assert.equal(witness.agent.relations.player?.trust??0,0);
  });
  check('helping another person wake, defend or heal does not incur coercion penalties',()=>{
    let a=arena(),subject=person(a,'subject',{x:4,y:4}),witness=person(a,'witness',{x:3,y:4});
    subject.properties['status:sleep']=2;
    engine.observeWorld(a.world,witness.id);assert(color('light:in',subject).ok);
    assert.equal(subject.properties['status:sleep'],0);assert.equal(witness.agent.relations.player?.trust??0,0);
    a=arena();subject=person(a,'subject',{x:4,y:4});witness=person(a,'witness',{x:3,y:4});
    engine.observeWorld(a.world,witness.id);assert(color('iron:out',subject).ok);
    assert(subject.properties.guard>0);assert.equal(witness.agent.relations.player?.trust??0,0);
    a=arena();subject=person(a,'subject',{x:4,y:5});witness=person(a,'witness',{x:3,y:5});
    subject.properties.integrity=50;a.player.stock['field-salve']=1;
    inventory.syncPlayerFromWorld(run.data,a.world);run.data.field.selectedItem='field-salve';
    engine.observeWorld(a.world,witness.id);
    assert(field.performFieldGesture('tend',subject.id,subject.pos,{drawn:true,quality:1}).ok);
    assert(subject.properties.integrity>50);assert.equal(a.player.stock['field-salve'],0);
    assert.equal(witness.agent.relations.player?.trust??0,0);

  });
  check('injuring an unowned person is observed as harm, while a self-applied discharge is not',()=>{
    let a=arena(),subject=person(a,'subject',{x:4,y:4}),witness=person(a,'witness',{x:3,y:4});
    engine.observeWorld(a.world,witness.id);assert(color('electric:out',subject).ok);
    assert(subject.properties.integrity<100);assert(witness.agent.relations.player?.trust<0);
    a=arena();witness=person(a,'witness',{x:3,y:5});
    engine.observeWorld(a.world,witness.id);assert(color('electric:out',a.player).ok);
    assert(run.data.hp<100);assert.equal(witness.agent.relations.player?.trust??0,0);
  });
  check('COLOR finishes a 450 max-HP monster at one HP without treating combat as coercion of a person',()=>{
    const a=arena(),definition=[...data.monsters.values()][0];
    const monster=generation.spawnCreature(run.data,a.world,a.space,definition,0,'normal');
    monster.pos={x:4,y:4};monster.properties.maxHp=450;monster.creature.maxHp=450;
    monster.properties.integrity=100/450;monster.properties.guard=0;monster.properties.hardness=0;
    const witness=person(a,'witness',{x:3,y:4});engine.observeWorld(a.world,witness.id);
    assert(color('electric:out',monster).ok,'positive HP below one percent must still be targetable');
    assert.equal(monster.properties.integrity,0);assert(monster.creature.defeated,'real monster defeat must settle during the paid turn');
    assert.equal(witness.agent.relations.player?.trust??0,0);
  });
  check('ranged COLOR discharge respects the same ghost immunity as other ranged attacks',()=>{
    const a=arena(),e=actor(a,'ghost',{x:4,y:4},{'status:ghost':2});
    const hp=e.properties.integrity;field.performFieldColor('electric:out',e.id,e.pos);
    assert.equal(e.properties.integrity,hp,'a ghost must not receive ranged discharge damage');
  });
  console.log(JSON.stringify({passed:results.length,failed:failures.length,failures},null,2));
} finally {
  await server.close();globalThis.window=old.window;globalThis.localStorage=old.storage;globalThis.fetch=old.fetch;
}
if(failures.length)throw new Error(failures.length+' public COLOR/field regression failures');
