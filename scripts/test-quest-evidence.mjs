import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {createPinia,setActivePinia} from 'pinia';
const root=fileURLToPath(new URL('../',import.meta.url)),saved=new Map();
const prior={window:globalThis.window,storage:globalThis.localStorage,fetch:globalThis.fetch};
globalThis.window={setTimeout:()=>0};
globalThis.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
const server=await createServer({root,server:{middlewareMode:true,hmr:false},appType:'custom'});
const results=[],failures=[];
const check=(name,body)=>{try{body();results.push(name);console.log('PASS '+name);}catch(e){failures.push(name+': '+e.stack);console.error('FAIL '+name+': '+e.message);}};
try{
  setActivePinia(createPinia());const mod=p=>server.ssrLoadModule('/src/'+p);
  const {useRunStore}=await mod('stores/run.ts'),{useDataStore}=await mod('stores/data.ts'),{loadAllData}=await mod('data/loader.ts');
  globalThis.fetch=async url=>new Response(readFileSync(join(root,'public',String(url).replace(/^\//,'')),'utf8'));
  const data=useDataStore();data.data=await loadAllData('/');const run=useRunStore();
  const field=await mod('systems/field-simulation.ts'),journey=await mod('systems/field-journey.ts'),reading=await mod('systems/field-readings.ts');
  const generation=await mod('systems/field-generation.ts'),selection=await mod('systems/field-selection.ts'),spatial=await mod('systems/world/spatial.ts');
  const engine=await mod('systems/world/engine.ts'),combat=await mod('systems/field-combat.ts');
  const {JOURNEY_QUESTS}=await mod('data/journey-quests.ts'),{FIELD_RECORDS}=await mod('data/field-records.ts');
  const timeline=[...data.timelines.values()].find(t=>data.nodeMaps.get(t.nodeMapId)?.nodes.some(n=>n.id==='n-iluneon-square'));
  const quest=id=>JOURNEY_QUESTS.find(q=>q.id===id);
  function setup(node='n-iluneon-square'){
    run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:node,maxHp:300,maxMp:3});run.data.relics=[];
    const a=field.ensureField(run.data);
    for(const e of Object.values(a.world.entities))if(e.creature)delete a.world.entities[e.id];
    a.space.width=12;a.space.height=12;a.space.tiles=Array.from({length:12},()=>Array(12).fill('grass'));a.space.exits=[];
    a.player.pos={x:2,y:2};return a;
  }
  function prerequisites(q){for(const id of q.after??[]){prerequisites(quest(id));journey.ensureJourney(run.data).completed[id]=1;}}
  function npc(a,id){
    const e=a.world.entities['npc:'+id];assert(e,id);e.nodeId=a.space.id;e.pos={x:3,y:2};e.routine=undefined;e.agent.relations.player={trust:0,regard:0};return e;
  }
  function near(a,e){
    const pos=spatial.cardinal(e.pos).find(p=>spatial.walkable(a.world,a.space.id,p,a.player.id));
    assert(pos);a.player.pos=pos;
  }
  function visibleTap(a,e){
    near(a,e);assert(field.visibleFieldEntities(run.data).some(x=>x.id===e.id),'visible target');
    assert(selection.fieldTargets(field.visibleFieldEntities(run.data)).some(x=>x.id===e.id),'selectable target');
    const out=field.performFieldGesture('tap',e.id,e.pos);assert(out.ok,out.message);return out;
  }
  function act(a,e,action){near(a,e);return field.performFieldService(e.id,action);}
  check('parallel regions unlock together; preference changes guidance and starting supplies once',()=>{
    const a=setup(),q=quest('time-13');prerequisites(q);const giver=npc(a,q.npcId);
    assert(act(a,giver,'quest:accept:'+q.id).ok);
    const before=a.player.stock['field-spark']??0;
    assert(act(a,giver,'quest:choose:'+q.id+':tifre').ok);
    assert.equal(a.player.stock['field-spark'],before+2);assert.equal(journey.currentJourney(run.data).id,'time-09');
    for(const id of ['time-05','time-06','time-09','time-10','time-14'])assert(journey.questAvailable(run.data,quest(id)),id);
    assert(!journey.questAvailable(run.data,quest('time-15')));assert(!act(a,giver,'quest:choose:'+q.id+':tifre').ok);
    assert.equal(a.player.stock['field-spark'],before+2);
  });
  check('greeting is insufficient; only the actual nearby testimony topic records evidence',()=>{
    const a=setup(),q=quest('time-02');prerequisites(q);assert(act(a,npc(a,q.npcId),'quest:accept:'+q.id).ok);
    const witness=npc(a,'npc-imperisia'),g=q.goals.find(g=>g.testimony),opened=visibleTap(a,witness);
    assert.equal(journey.goalProgress(run.data,g),0);assert(run.data.field.spoken[witness.id]>0);
    const topic=opened.speech.topics.find(t=>t.action==='quest:testimony:'+q.id+':'+g.testimony);assert(topic);
    a.player.pos={x:10,y:10};assert(!field.performFieldService(witness.id,topic.action).ok);assert.equal(journey.goalProgress(run.data,g),0);
    const heard=act(a,witness,topic.action);assert(heard.ok);assert(heard.speech.lines.some(l=>l.includes('탑의 시각')));
    assert.equal(journey.goalProgress(run.data,g),1);assert.equal(run.data.field.journey.testimonies[g.testimony].written,false);
    assert(!act(a,witness,topic.action).ok);
    run.saveActiveRun();run.$reset();assert(run.loadActiveRun());assert.equal(journey.goalProgress(run.data,g),1);
  });
  check('destroyed unread records remain selectable fragments and can finish locally without restoring HP',()=>{
    const q=quest('time-05'),def=FIELD_RECORDS.find(r=>r.id===q.reportRecords[0]),a=setup(def.nodeId);prerequisites(q);
    const e=a.world.entities['record:'+def.id];assert(e);engine.influenceEntity(a.world,e,'integrity',-100,a.player.id);assert.equal(e.properties.integrity,0);
    a.player.pos={x:10,y:10};assert.equal(reading.recordReading(run.data,e),undefined);assert(!run.data.field.journey.readings[def.id]);
    const opened=visibleTap(a,e);assert.match(opened.speech.name,/잔해/);assert(run.data.field.journey.readings[def.id].recovered);
    assert(opened.speech.topics.some(t=>t.action==='quest:accept:'+q.id));
    assert(act(a,e,'quest:accept:'+q.id).ok);assert(act(a,e,'quest:finish:'+q.id).ok);assert(run.data.field.journey.completed[q.id]);
    assert.equal(e.properties.integrity,0);
    run.saveActiveRun();run.$reset();assert(run.loadActiveRun());assert.equal(run.data.interactionWorld.entities[e.id].properties.integrity,0);
    assert(run.data.field.journey.readings[def.id].recovered);
  });
  check('early dead quest giver leaves physical papers; the corpse cannot accept and no NPC is revived',()=>{
    const a=setup(),q=quest('time-01');prerequisites(q);const source=npc(a,q.npcId);
    engine.influenceEntity(a.world,source,'integrity',-100,a.player.id);field.ensureField(run.data);
    assert(!act(a,source,'quest:accept:'+q.id).ok);
    const e=a.world.entities['quest-remains:'+q.npcId];assert(e);const opened=visibleTap(a,e);
    assert(opened.speech.topics.some(t=>t.action==='quest:accept:'+q.id));
    assert(act(a,e,'quest:accept:'+q.id).ok);assert.equal(source.properties.integrity,0);assert(!run.data.field.journey.completed[q.id]);
    assert(!act(a,e,'quest:finish:'+q.id).ok,'actual investigation is still required');
  });
  check('dead witness requires reading their physical testimony; greeting state is never forged',()=>{
    const a=setup(),q=quest('time-02');prerequisites(q);assert(act(a,npc(a,q.npcId),'quest:accept:'+q.id).ok);
    const source=npc(a,'npc-imperisia'),g=q.goals.find(g=>g.testimony);
    engine.influenceEntity(a.world,source,'integrity',-100,a.player.id);field.ensureField(run.data);
    const e=a.world.entities['quest-remains:'+source.npcId];const opened=visibleTap(a,e);
    assert.equal(journey.goalProgress(run.data,g),0);
    const topic=opened.speech.topics.find(t=>t.action?.startsWith('quest:testimony:'));assert(topic);
    assert(act(a,e,topic.action).ok);assert.equal(journey.goalProgress(run.data,g),1);
    assert.equal(run.data.field.journey.testimonies[g.testimony].written,true);assert.equal(run.data.field.spoken[source.id]??0,0);
    assert.equal(source.properties.integrity,0);
  });
  check('a destroyed remains object still exposes evidence without regenerating bodies or items',()=>{
    const a=setup(),q=quest('time-01');prerequisites(q);const source=npc(a,q.npcId);
    engine.influenceEntity(a.world,source,'integrity',-100,a.player.id);field.ensureField(run.data);
    const e=a.world.entities['quest-remains:'+q.npcId];engine.influenceEntity(a.world,e,'integrity',-100,a.player.id);
    const count=Object.keys(a.world.entities).length;field.ensureField(run.data);
    assert.equal(Object.keys(a.world.entities).length,count);visibleTap(a,e);assert(act(a,e,'quest:accept:'+q.id).ok);
    assert.equal(e.properties.integrity,0);assert.equal(source.properties.integrity,0);
  });
  check('final boss stays locked until physical acceptance, including when the final guide is dead',()=>{
    const a=setup('n-anchor-point'),q=quest('time-20');prerequisites(q);const source=npc(a,q.npcId);
    const boss=generation.spawnCreature(run.data,a.world,a.space,data.bosses.get('bs-act-1-anchor'),0,'boss');boss.pos={x:9,y:9};
    engine.influenceEntity(a.world,source,'integrity',-100,a.player.id);field.ensureField(run.data);
    assert(combat.bossEncounterFailure(run.data,boss));assert(!combat.beginBossEncounter(run.data,boss,true));
    const e=a.world.entities['quest-remains:'+q.npcId];const opened=visibleTap(a,e);
    assert(opened.speech.topics.some(t=>t.action==='quest:accept:time-20'));
    assert(combat.bossEncounterFailure(run.data,boss));assert(act(a,e,'quest:accept:time-20').ok);
    assert.equal(combat.bossEncounterFailure(run.data,boss),undefined);assert(combat.beginBossEncounter(run.data,boss,true));
    assert.equal(source.properties.integrity,0);
  });
  check('prepared supplies complete the readiness quest once without an empty return interaction',()=>{
    const a=setup(),q=quest('time-18');prerequisites(q);const giver=npc(a,q.npcId);a.player.stock['field-wrap']=2;
    assert(act(a,giver,'quest:accept:'+q.id).ok);assert(run.data.field.journey.completed[q.id]);
    assert.equal(a.player.stock['field-wrap'],3);assert(!act(a,giver,'quest:finish:'+q.id).ok);assert.equal(a.player.stock['field-wrap'],3);
  });
  if(failures.length)throw Error(failures.join('\n'));
  console.log(JSON.stringify({status:'PASS',groups:results.length}));
}finally{await server.close();globalThis.window=prior.window;globalThis.localStorage=prior.storage;globalThis.fetch=prior.fetch;}
