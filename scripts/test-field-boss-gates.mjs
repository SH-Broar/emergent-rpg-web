import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
const root=fileURLToPath(new URL('../',import.meta.url)),saved=new Map();
const original={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
globalThis.window={setTimeout:()=>0};
globalThis.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
const server=await createServer({root,server:{middlewareMode:true,hmr:false},appType:'custom'});
const failures=[];
function check(label,body){try{body();console.log('PASS '+label);}catch(error){failures.push(label+': '+error.message);console.error('FAIL '+label+': '+error.message);}}
try{
  setActivePinia(createPinia());
  const {useRunStore}=await server.ssrLoadModule('/src/stores/run.ts');
  const {useDataStore}=await server.ssrLoadModule('/src/stores/data.ts');
  const {loadAllData}=await server.ssrLoadModule('/src/data/loader.ts');
  const field=await server.ssrLoadModule('/src/systems/field-simulation.ts');
  const generation=await server.ssrLoadModule('/src/systems/field-generation.ts');
  const combat=await server.ssrLoadModule('/src/systems/field-combat.ts');
  const ai=await server.ssrLoadModule('/src/systems/field-ai.ts');
  const engine=await server.ssrLoadModule('/src/systems/world/engine.ts');
  const journey=await server.ssrLoadModule('/src/systems/field-journey.ts');
  const {JOURNEY_QUESTS}=await server.ssrLoadModule('/src/data/journey-quests.ts');
  const {instantiateCard}=await server.ssrLoadModule('/src/systems/deck.ts');
  globalThis.fetch=async url=>new Response(readFileSync(join(root,'public',String(url).replace(/^\//,'')),'utf8'));
  const data=useDataStore();data.data=await loadAllData('/');const run=useRunStore();
  const timeline=[...data.timelines.values()].find(t=>data.nodeMaps.get(t.nodeMapId)?.nodes.some(n=>n.id==='n-anchor-point'));
  const finale=JOURNEY_QUESTS.find(q=>q.main&&q.completeOnBoss==='bs-act-1-anchor');assert(finale);
  function setup(id='bs-act-1-anchor'){
    run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-anchor-point',maxHp:1000,maxMp:3,timeLimit:300});
    const a=field.ensureField(run.data),guide=a.world.entities['npc:'+finale.npcId];assert(guide);
    a.world.entities={player:a.player,[guide.id]:guide};a.space.width=11;a.space.height=11;a.space.tiles=Array.from({length:11},()=>Array(11).fill('grass'));a.space.exits=[];
    a.player.pos={x:5,y:5};a.player.colors={};a.player.properties.hardness=0;a.player.properties.guard=0;run.data.relics=[];
    guide.nodeId=a.space.id;guide.pos={x:6,y:5};guide.properties.integrity=100;guide.agent.relations.player={trust:0,regard:0};
    if(guide.routine){guide.routine.travel=undefined;guide.routine.goal=guide.nodeId;guide.routine.route=[];}
    const boss=generation.spawnCreature(run.data,a.world,a.space,data.bosses.get(id),0,'boss');boss.pos={x:5,y:4};
    const environment={id:'test-flame',name:'타는 바닥',kind:'terrain',nodeId:a.space.id,pos:{x:5,y:3},colors:{},tags:['ground'],stock:{},properties:{integrity:100,heat:12,burning:12}};
    a.world.entities[environment.id]=environment;
    return {...a,boss,guide,environment};
  }
  function acceptFinale(a){const state=journey.ensureJourney(run.data);for(const id of finale.after??[])state.completed[id]=1;const result=journey.performQuest(run.data,a.world,a.guide.id,'quest:accept:'+finale.id);assert(result.ok,JSON.stringify(result));}
  check('entering the anchor without the final scenario leaves it waiting and blocks direct gestures',()=>{
    const a=setup();field.ensureField(run.data);assert(combat.bossEncounterFailure(run.data,a.boss));assert.equal(ai.creatureIntent(a.boss).label,'기다림');
    assert(!combat.beginBossEncounter(run.data,a.boss,true));assert(!run.data.field.encounter);
    const hp=a.boss.properties.integrity,time=run.data.field.elapsedSeconds;
    const result=field.performFieldGesture('strike',a.boss.id,a.boss.pos);assert(!result.ok);assert.match(result.message,/마지막 부탁/);
    assert.equal(a.boss.properties.integrity,hp);assert.equal(run.data.field.elapsedSeconds,time);
    assert.equal(combat.hit(a.world,a.player,a.boss,50),0);
    engine.influenceEntity(a.world,a.boss,'charge',5,a.player.id);assert.equal(a.boss.properties.integrity,hp);
  });
  check('unaccepted final-quest saves cancel already engaged combat and stale accepted dialogs',()=>{
    let a=setup();a.boss.creature.engaged=true;a.boss.creature.pending=combat.planAttack(a.world,a.boss,a.player);a.boss.creature.intent=a.boss.creature.pending.cells.map(c=>c.pos);
    run.saveActiveRun();run.$reset();assert(run.loadActiveRun());a={...field.ensureField(run.data),boss:run.data.interactionWorld.entities[a.boss.id]};
    assert.equal(a.boss.creature.engaged,false);assert.equal(a.boss.creature.pending,undefined);assert.equal(a.boss.creature.intent,undefined);
    const hp=a.boss.properties.integrity;assert(!field.performFieldGesture('strike',a.boss.id,a.boss.pos).ok);assert.equal(a.boss.properties.integrity,hp);
    run.data.field.encounter={actorId:a.boss.id,name:a.boss.name,lines:['stale']};combat.resolveFieldEncounter(run.data,true);assert(!a.boss.creature.engaged);assert(!run.data.field.encounter);
  });
  check('accepting the actual final quest enables the introduction and normal actor damage',()=>{
    const a=setup();acceptFinale(a);assert.equal(combat.bossEncounterFailure(run.data,a.boss),undefined);
    assert(combat.beginBossEncounter(run.data,a.boss,true));assert(run.data.field.encounter?.lines.length);
    combat.resolveFieldEncounter(run.data,true);assert(a.boss.creature.engaged);
    assert(combat.hit(a.world,a.player,a.boss,50)>0);
  });
  check('all bosses ignore environment fire, charge, force and direct integrity loss',()=>{
    for(const id of ['bs-act-1-anchor','bs-arc-dun','bs-arc-tifre']){
      const a=setup(id);if(id==='bs-act-1-anchor')acceptFinale(a);a.boss.creature.engaged=true;
      const hp=a.boss.properties.integrity;
      for(const source of [undefined,a.environment.id])for(const [property,amount]of [['charge',10],['force',20],['integrity',-15]]){
        engine.influenceEntity(a.world,a.boss,property,amount,source);assert.equal(a.boss.properties.integrity,hp,id+' '+property);
      }
      engine.influenceEntity(a.world,a.boss,'heat',12,a.environment.id);assert(a.boss.properties.burning>0);
      for(let n=0;n<4;n++)engine.tickMaterials(a.world);
      assert.equal(a.boss.properties.integrity,hp,id+' environmental burning');assert(!run.data.ended);
    }
  });
  check('offscreen burning cannot finish a one-HP boss during coarse settlement',()=>{
    const a=setup('bs-arc-dun');a.boss.creature.engaged=true;a.boss.properties.integrity=100/a.boss.creature.maxHp;
    a.boss.properties.burning=12;a.boss.properties.heat=12;a.boss.fieldUpdatedAt=0;
    const next=generation.ensureFieldSpace(run.data,a.world,'n-iluneon-guild');run.data.currentNodeId=next.id;
    generation.placeFieldEntity(a.world,next,a.player,next.spawn);field.advanceFieldTime(300);
    assert.equal(engine.displayedHp(a.boss.properties),1);assert(!a.boss.creature.defeated);assert(!run.data.arcsCleared.includes('bs-arc-dun'));assert(!run.data.ended);
  });
  check('environment damage still affects ordinary creatures',()=>{
    const a=setup('bs-arc-dun');const normal=generation.spawnCreature(run.data,a.world,a.space,data.monsters.get('mr-iluneon-cutpurse'),1,'normal');
    normal.pos={x:4,y:3};normal.properties.moisture=0;normal.colors={};const hp=normal.properties.integrity;
    engine.influenceEntity(a.world,normal,'heat',12,a.environment.id);engine.tickMaterials(a.world);assert(normal.properties.integrity<hp);
  });
  check('actor electrical magic and equipped spell damage remain effective against bosses',()=>{
    const a=setup('bs-arc-dun');a.boss.creature.engaged=true;a.boss.properties['status:paralyze']=99;
    const hp=a.boss.properties.integrity;engine.influenceEntity(a.world,a.boss,'charge',3,a.player.id);assert(a.boss.properties.integrity<hp);
    const card=instantiateCard(data.cards.get('c-field-pulse'));run.data.collection.push(card);run.data.field.skills.slots.corner=card.instanceId;
    const after=a.boss.properties.integrity;const cast=field.performFieldGesture('corner',a.boss.id,a.boss.pos,{drawn:true,quality:1});assert(cast.ok,JSON.stringify(cast));
    for(let n=0;n<3&&a.boss.properties.integrity===after;n++)field.advanceFieldTime(30,false);
    assert(a.boss.properties.integrity<after,'equipped spell damages boss');
  });
  check('actor-applied damage statuses affect bosses and persist through saves',()=>{
    for(const key of ['poison','burn','sap','possession']){
      let a=setup('bs-arc-dun');a.boss.creature.engaged=true;combat.applyStatus(a.world,a.boss,key+':3',a.player);
      const hp=a.boss.properties.integrity;run.saveActiveRun();run.$reset();assert(run.loadActiveRun());
      const world=run.data.interactionWorld,boss=world.entities[a.boss.id];combat.tickStatuses(world,boss,1);
      assert(boss.properties.integrity<hp,key+' from actor must damage a boss');
    }
  });
}finally{globalThis.window=original.window;globalThis.localStorage=original.localStorage;globalThis.fetch=original.fetch;await server.close();}
if(failures.length)throw new Error(failures.length+' boss invariant failures\n'+failures.join('\n'));
