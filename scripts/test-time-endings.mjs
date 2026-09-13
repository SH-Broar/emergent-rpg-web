import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const saved = new Map();
const original = { window: globalThis.window, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
globalThis.window = { setTimeout: () => 0 };
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key,value) => saved.set(key,value), removeItem: key => saved.delete(key) };
const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const failures = [];
function check(label, body) { try { body(); console.log('PASS '+label); } catch(error) { failures.push(label+': '+error.message); console.error('FAIL '+label+': '+error.message); } }
try {
  setActivePinia(createPinia());
  const { useRunStore } = await server.ssrLoadModule('/src/stores/run.ts');
  const { useDataStore } = await server.ssrLoadModule('/src/stores/data.ts');
  const { useMetaStore } = await server.ssrLoadModule('/src/stores/meta.ts');
  const { loadAllData } = await server.ssrLoadModule('/src/data/loader.ts');
  const story = await server.ssrLoadModule('/src/systems/time-story.ts');
  const field = await server.ssrLoadModule('/src/systems/field-simulation.ts');
  const generation = await server.ssrLoadModule('/src/systems/field-generation.ts');
  const journey = await server.ssrLoadModule('/src/systems/field-journey.ts');
  const progression = await server.ssrLoadModule('/src/systems/progression.ts');
  const endings = await server.ssrLoadModule('/src/data/time-endings.ts');
  const engine = await server.ssrLoadModule('/src/systems/world/engine.ts');
  const combat = await server.ssrLoadModule('/src/systems/field-combat.ts');
  const status = await server.ssrLoadModule('/src/systems/world/status.ts');
  globalThis.fetch = async url => new Response(readFileSync(join(root,'public',String(url).replace(/^\//,'')),'utf8'));
  const data = useDataStore(); data.data = await loadAllData('/');
  const run = useRunStore(), meta = useMetaStore();
  const timeline = [...data.timelines.values()].find(t => data.nodeMaps.get(t.nodeMapId)?.nodes.some(n => n.id === 'n-iluneon-square'));
  const active = [{ id:'ch-fractured-time', intensity:1 }];
  function start(earned=true, selected=true) {
    meta.storyEndings = { seen: earned ? ['stillness'] : [], chaosUnlocked: earned };
    run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:1000,maxMp:3,timeLimit:300,activeChaos:selected ? active : []});
    const a = field.ensureField(run.data), npcs = story.TIME_ALLIES.map(id => a.world.entities['npc:'+id]);
    assert(npcs.every(Boolean));
    a.world.entities = { player:a.player, ...Object.fromEntries(npcs.map(npc => [npc.id,npc])) };
    a.space.width=11; a.space.height=11; a.space.tiles=Array.from({length:11},()=>Array(11).fill('grass')); a.space.exits=[];
    a.player.pos={x:5,y:5}; a.player.colors={}; a.player.properties.guard=0; a.player.properties.hardness=0;
    for (const [i,npc] of npcs.entries()) {
      npc.nodeId=a.space.id; npc.pos={x:5+i,y:4}; npc.properties={integrity:100,maxHp:100,defeatProtected:1}; npc.colors={};
      if(npc.routine){npc.routine.travel=undefined;npc.routine.goal=a.space.id;npc.routine.route=[];}
      npc.agent.relations.player={trust:0,regard:0};
    }
    journey.ensureJourney(run.data).decisions['time-17']='both'; run.data.arcsCleared=['bs-arc-dun','bs-arc-tifre'];
    return {...a,dun:npcs[0],tifre:npcs[1]};
  }
  function joinAlly(a,npc) { const prior={...a.player.pos}; a.player.pos={x:npc.pos.x,y:npc.pos.y+1}; assert(story.recruitTimeAlly(run.data,a.world,npc.id).ok); a.player.pos=prior; }
  function completeStory(side='dun',choice=side) {
    const q=journey.ensureJourney(run.data);
    for(let n=1;n<=20;n++)q.completed['time-'+String(n).padStart(2,'0')]=1;
    q.decisions['time-13']=side;q.decisions['time-17']=choice;run.data.bossesCleared=['bs-act-1-anchor'];
    const world=run.data.interactionWorld,space=world.spaces[run.data.currentNodeId];
    const defeated=generation.spawnCreature(run.data,world,space,data.bosses.get('bs-act-1-anchor'),99,'boss');
    defeated.properties.integrity=0;defeated.creature.defeated=true;
  }
  check('eligibility requires a new run after an earned ending and selected Chaos',()=>{
    start(false,true); assert(!story.chaosStoryAvailable(run.data));
    meta.storyEndings={seen:['stillness'],chaosUnlocked:true};run.data.activeChaos=active;assert(!story.chaosStoryAvailable(run.data));
    start(true,false);run.data.activeChaos=active;assert(!story.chaosStoryAvailable(run.data));
    start(true,true);assert(story.chaosStoryAvailable(run.data));run.data.activeChaos=[];assert(!story.chaosStoryAvailable(run.data));
  });
  check('actual NPC recruitment validates range, life, status, trust and arc victory',()=>{
    const a=start();const recruit=()=>story.recruitTimeAlly(run.data,a.world,a.dun.id);
    a.dun.pos={x:1,y:1};assert(!recruit().ok);a.dun.pos={x:5,y:4};
    a.dun.properties.integrity=0;assert(!recruit().ok);a.dun.properties.integrity=100;
    a.dun.properties['status:sleep']=1;assert(!recruit().ok);delete a.dun.properties['status:sleep'];
    a.dun.agent.relations.player.trust=-.5;assert(!recruit().ok);a.dun.agent.relations.player.trust=0;
    run.data.arcsCleared=[];assert(!recruit().ok);run.data.arcsCleared=['bs-arc-dun'];
    assert(recruit().ok);assert(!recruit().ok);a.dun.properties.integrity=0;assert(!story.livingTimeAlly(run.data,'npc-kumamimi'));
  });
  check('ending branches, no early unlock, persistent result and duplicate absorption',()=>{
    let a=start(false,false);completeStory('dun');story.resolveTimeEnding(run.data,a.world);assert.equal(run.data.timeStory.ending.id,'stillness');
    story.recordTimeEnding(run.data,meta);assert(!meta.storyEndings.chaosUnlocked);
    run.endRun('boss-cleared');progression.absorbRunIntoMeta(run.data);assert(meta.storyEndings.chaosUnlocked);
    assert(meta.storyEndings.seen.includes('stillness'));assert(meta.unlockedChaosIds.includes('ch-fractured-time'));
    const snapshot=JSON.stringify(meta.$state);progression.absorbRunIntoMeta(run.data);assert.equal(JSON.stringify(meta.$state),snapshot);
    const persisted=JSON.parse(saved.get('rdc-meta-v1'));assert(persisted.storyEndings.seen.includes('stillness'));assert.equal(persisted.runHistory.at(-1).storyEnding,'stillness');
    a=start(false,false);completeStory('tifre');story.resolveTimeEnding(run.data,a.world);assert.equal(run.data.timeStory.ending.id,'severance');
    a=start();joinAlly(a,a.dun);joinAlly(a,a.tifre);completeStory('dun','both');story.resolveTimeEnding(run.data,a.world);assert.equal(run.data.timeStory.ending.id,'together');
    a=start();joinAlly(a,a.dun);joinAlly(a,a.tifre);completeStory('tifre','both');a.dun.properties.integrity=0;story.resolveTimeEnding(run.data,a.world);assert.equal(run.data.timeStory.ending.id,'together');assert.equal(run.data.timeStory.ending.witnesses.dun.state,'recovering');assert(!run.data.timeStory.ending.reason);
    a=start();completeStory();delete run.data.field.journey.completed['time-19'];story.resolveTimeEnding(run.data,a.world);assert(!run.data.timeStory.ending);
  });
  check('solo, noncompanions in the arena and withdrawn companions allow the third method',()=>{
    const scenarios=[
      ['solo',a=>{a.dun.nodeId='n-emberforge-lair';a.tifre.nodeId='n-oldshrine-altar';},'absent','absent'],
      ['Dun only',a=>{joinAlly(a,a.dun);a.tifre.nodeId='n-oldshrine-altar';},'present','absent'],
      ['Tifre only',a=>{joinAlly(a,a.tifre);a.dun.nodeId='n-emberforge-lair';},'absent','present'],
      ['legacy Dun defeat',a=>{joinAlly(a,a.tifre);a.dun.properties.integrity=0;},'recovering','present'],
      ['noncompanions in arena',()=>{},'absent','absent'],
      ['legacy both defeated',a=>{a.dun.properties.integrity=0;a.tifre.properties.integrity=0;},'recovering','recovering'],
      ['missing',a=>{delete a.world.entities[a.dun.id];delete a.world.entities[a.tifre.id];},'unknown','unknown'],
    ];
    for(const [name,arrange,dun,tifre] of scenarios){
      const a=start();arrange(a);completeStory('dun','both');story.resolveTimeEnding(run.data,a.world);
      const ending=run.data.timeStory.ending;assert.equal(ending.id,'together',name);
      assert.equal(ending.witnesses.dun.state,dun,name);assert.equal(ending.witnesses.tifre.state,tifre,name);
      const pages=endings.endingPresentation(ending.id,ending.witnesses).pages;
      if(dun!=='present')assert(!pages.some(p=>p.speaker==='던'),name+' has no absent/dead Dun speaking');
      if(tifre!=='present')assert(!pages.some(p=>p.speaker==='티프레'),name+' has no absent/dead Tifre speaking');
      if(dun==='recovering'||tifre==='recovering')assert(pages.some(p=>p.text.includes('몸을 추스르고 있다')));
    }
  });
  check('all ending editions avoid absent or dead speakers and preserve old-save compatibility',()=>{
    for(const id of ['stillness','severance','together']){
      for(const dun of ['present','absent','recovering','dead','unknown'])for(const tifre of ['present','absent','recovering','dead','unknown']){
        const edition=endings.endingPresentation(id,{dun:{state:dun,joined:true},tifre:{state:tifre,joined:true}});
        assert(edition.pages.length>=5);
        if(dun!=='present')assert(!edition.pages.some(p=>p.speaker==='던'));
        if(tifre!=='present')assert(!edition.pages.some(p=>p.speaker==='티프레'));
        if(dun!=='present')assert(!edition.pages.some(p=>p.text.includes('던이 닻')||p.text.includes('던은 대장간으로')));
        if(tifre!=='present')assert(!edition.pages.some(p=>p.text.includes('티프레가 닻')||p.text.includes('티프레는 연결')));
      }
      const old=endings.endingPresentation(id);assert.equal(old.variant,'동행 기록 없음');
      assert(!old.pages.some(p=>p.speaker==='던'||p.speaker==='티프레'));
    }
  });
  check('victory cast snapshots persist in history and never change with later NPC mutations',()=>{
    const a=start();joinAlly(a,a.dun);a.tifre.properties.integrity=0;completeStory('dun','both');story.resolveTimeEnding(run.data,a.world);
    const snapshot=JSON.stringify(run.data.timeStory.ending.witnesses);
    const text=JSON.stringify(endings.endingPresentation(run.data.timeStory.ending.id,run.data.timeStory.ending.witnesses));
    a.dun.properties.integrity=0;a.tifre.properties.integrity=100;
    assert.equal(JSON.stringify(run.data.timeStory.ending.witnesses),snapshot);
    assert.equal(JSON.stringify(endings.endingPresentation(run.data.timeStory.ending.id,run.data.timeStory.ending.witnesses)),text);
    run.endRun('boss-cleared');progression.absorbRunIntoMeta(run.data);
    const history=JSON.parse(saved.get('rdc-meta-v1')).runHistory[0];assert.equal(history.storyEnding,'together');
    assert.equal(JSON.stringify(history.storyWitnesses),snapshot);
    assert.equal(JSON.stringify(endings.endingPresentation(history.storyEnding,history.storyWitnesses)),text);
  });
  check('optional companions reduce combat pressure without being required for the ending',()=>{
    const a=start();a.tifre.nodeId='n-oldshrine-altar';a.dun.nodeId='n-emberforge-lair';
    const target=generation.spawnCreature(run.data,a.world,a.space,data.bosses.get('bs-arc-dun'),0,'boss');
    target.pos={x:7,y:4};target.creature.engaged=true;const hp=target.properties.integrity;
    story.tickTimeAllies(run.data,a.world);assert.equal(target.properties.integrity,hp);assert.equal(a.player.properties.guard,0);
    a.dun.nodeId=a.space.id;a.tifre.nodeId=a.space.id;joinAlly(a,a.dun);joinAlly(a,a.tifre);
    story.tickTimeAllies(run.data,a.world);assert(target.properties.integrity<hp);assert(a.player.properties.guard>0);
  });
  check('old zero-HP active saves migrate to recovery without rejoining; other ally cooldown survives',()=>{
    const a=start();joinAlly(a,a.dun);joinAlly(a,a.tifre);run.data.timeStory.allies['npc-kumamimi'].supportAt=123;a.tifre.properties.integrity=0;
    run.saveActiveRun();run.$reset();assert(run.loadActiveRun());assert(story.chaosStoryAvailable(run.data));assert.equal(run.data.timeStory.allies['npc-kumamimi'].supportAt,123);
    const loaded=field.ensureField(run.data);assert(!story.livingTimeAlly(run.data,'npc-toramimi'));assert(loaded.world.entities[a.tifre.id].properties.integrity>0);assert(run.data.timeStory.recovering['npc-toramimi']>run.data.field.elapsedSeconds);assert(!run.data.timeStory.allies['npc-toramimi']);assert.equal(loaded.world.entities[a.tifre.id].nodeId,loaded.world.entities[a.tifre.id].agent.homeNodeId);
  });
  check('protected story bodies survive attacks, status damage and environmental injury while ordinary NPCs remain mortal',()=>{
    const causes=[
      ['attack',(a,npc)=>combat.hit(a.world,a.player,npc,200)],
      ['poison',(a,npc)=>{combat.applyStatus(a.world,npc,'poison:200',a.player);combat.tickStatuses(a.world,npc,1);}],
      ['environment',(a,npc)=>engine.influenceEntity(a.world,npc,'integrity',-200)],
      ['fire',(a,npc)=>{npc.properties.integrity=1;npc.properties.heat=10;npc.properties.burning=8;npc.properties.flammability=10;engine.tickMaterials(a.world,'only',new Set([npc.id]));}],
    ];
    for(const [cause,hurt] of causes)for(const npcId of story.TIME_ALLIES){
      const a=start(),npc=a.world.entities['npc:'+npcId];joinAlly(a,npc);
      const target=generation.spawnCreature(run.data,a.world,a.space,data.bosses.get('bs-arc-dun'),0,'boss');
      target.pos={x:7,y:4};target.creature.engaged=true;
      hurt(a,npc);assert(npc.properties.integrity>0,cause+' HP');assert.equal(npc.properties.defeatPending,1,cause+' defeat signal');
      assert(status.actionRestriction(npc),cause+' pending action guard');
      story.tickTimeAllies(run.data,a.world);assert.equal(run.data.timeStory.allies[npcId].supportAt,undefined,cause+' no support while down');
      field.ensureField(run.data);assert(!run.data.timeStory.allies[npcId],cause+' left party');assert(run.data.timeStory.recovering[npcId]>run.data.field.elapsedSeconds);
      assert.equal(npc.nodeId,npc.agent.homeNodeId);assert(npc.properties.integrity>0);assert(!a.world.entities['quest-remains:'+npcId]);
      assert(!story.recruitTimeAlly(run.data,a.world,npc.id).ok,cause+' recovering cannot rejoin');
      assert(!a.world.events.some(e=>e.targetId===npc.id&&e.property==='integrity'&&e.after<=0),cause+' no death fact');
    }
    const a=start(),ordinary=structuredClone(JSON.parse(JSON.stringify(a.dun)));
    ordinary.id='npc:test-ordinary';ordinary.npcId='test-ordinary';delete ordinary.properties.defeatProtected;a.world.entities[ordinary.id]=ordinary;
    engine.influenceEntity(a.world,ordinary,'integrity',-200);assert.equal(ordinary.properties.integrity,0);
    story.reconcileTimePeople(run.data,a.world);assert.equal(ordinary.properties.integrity,0);
  });
  check('withdrawal recovers in world time and requires a new nearby recruitment interaction',()=>{
    const a=start();joinAlly(a,a.dun);engine.influenceEntity(a.world,a.dun,'integrity',-200);
    field.ensureField(run.data);const until=run.data.timeStory.recovering['npc-kumamimi'];
    field.advanceFieldTime(570,false);assert(run.data.field.elapsedSeconds<until);assert(run.data.timeStory.recovering['npc-kumamimi']);
    assert(!story.isTimeAlly(run.data,a.dun));field.advanceFieldTime(30,false);
    assert.equal(run.data.timeStory.recovering['npc-kumamimi'],undefined);assert.equal(a.dun.properties.integrity,100);
    assert(!story.isTimeAlly(run.data,a.dun));assert(!story.recruitTimeAlly(run.data,a.world,a.dun.id).ok,'remote recovery does not recruit');
    const home=generation.ensureFieldSpace(run.data,a.world,a.dun.nodeId);
    run.data.currentNodeId=home.id;a.player.nodeId=home.id;
    generation.placeFieldEntity(a.world,home,a.player,{x:a.dun.pos.x,y:a.dun.pos.y+1});
    a.dun.routine=undefined;a.dun.agent.relations.player.trust=0;
    assert.equal(Math.abs(a.player.pos.x-a.dun.pos.x)+Math.abs(a.player.pos.y-a.dun.pos.y),1);
    assert(field.performFieldService(a.dun.id,'story:recruit').ok);assert(story.isTimeAlly(run.data,a.dun));
  });
  check('carried objects follow an ally through exits, retreat, save/load and recovery before being put down',()=>{
    const a=start();joinAlly(a,a.dun);
    const held={id:'test:water-jug',name:'물통',kind:'resource',nodeId:a.dun.nodeId,pos:{x:4,y:4},properties:{integrity:100,portable:1,mass:1},stock:{water:2},colors:{},tags:['container']};
    a.world.entities[held.id]=held;
    const carry={id:'test-carry',label:'들기',description:'',duration:0,effects:[{kind:'carry',held:true}]};
    assert(engine.resolveInteraction(a.world,a.dun.id,held.id,carry).ok);
    const from=a.space.id,destination=generation.ensureFieldSpace(run.data,a.world,'n-iluneon-guild');
    run.data.currentNodeId=destination.id;a.player.nodeId=destination.id;generation.placeFieldEntity(a.world,destination,a.player,destination.spawn);
    story.arriveTimeAllies(run.data,a.world,destination,from,{x:5,y:5});
    assert.equal(held.nodeId,a.dun.nodeId);assert.equal(held.carriedBy,a.dun.id);
    engine.influenceEntity(a.world,a.dun,'integrity',-200);field.ensureField(run.data);
    assert.equal(held.nodeId,a.dun.agent.homeNodeId);assert.equal(held.carriedBy,a.dun.id);
    run.saveActiveRun();run.$reset();assert(run.loadActiveRun());field.advanceFieldTime(600,false);
    const world=run.data.interactionWorld,npc=world.entities[a.dun.id],jug=world.entities[held.id];
    assert.equal(jug.nodeId,npc.nodeId);assert.equal(jug.carriedBy,npc.id);assert.equal(jug.stock.water,2);
    const space=world.spaces[npc.nodeId],pos=[{x:npc.pos.x+1,y:npc.pos.y},{x:npc.pos.x-1,y:npc.pos.y},{x:npc.pos.x,y:npc.pos.y+1},{x:npc.pos.x,y:npc.pos.y-1}]
      .find(p=>space.tiles[p.y]?.[p.x]&&space.tiles[p.y][p.x]!=='wall'&&!Object.values(world.entities).some(e=>e.nodeId===npc.nodeId&&e.pos?.x===p.x&&e.pos?.y===p.y&&e.properties.solid));
    assert(pos);const drop={id:'test-drop',label:'놓기',description:'',duration:0,effects:[{kind:'carry',held:false,pos}]};
    const result=engine.resolveInteraction(world,npc.id,jug.id,drop);assert(result.ok,result.reason);assert(!jug.carriedBy);assert.deepEqual(jug.pos,pos);
  });
  check('a one-turn paralyze blocks ally support for that turn',()=>{
    const a=start();joinAlly(a,a.dun);const boss=data.bosses.get('bs-arc-dun');const threat=generation.spawnCreature(run.data,a.world,a.space,boss,0,'boss');
    threat.pos={x:8,y:5};threat.creature.engaged=true;threat.properties['status:sleep']=3;a.dun.properties['status:paralyze']=1;
    field.advanceFieldTime(30,false);assert.equal(run.data.timeStory.allies['npc-kumamimi'].supportAt,undefined,'paralyzed Dun supported during the blocked turn');
  });
  check('ranged ally support obeys ghost immunity',()=>{
    const a=start();joinAlly(a,a.tifre);const boss=data.bosses.get('bs-arc-dun');const target=generation.spawnCreature(run.data,a.world,a.space,boss,0,'boss');
    target.pos={x:7,y:4};target.creature.engaged=true;target.properties['status:ghost']=2;const before=target.properties.integrity;
    story.tickTimeAllies(run.data,a.world);assert.equal(target.properties.integrity,before,'ranged Tifre support damaged a ghost');
  });
  check('a nearby living ally crosses the exit using the same persistent body',()=>{
    const a=start();joinAlly(a,a.dun);const identity=a.dun,from=a.space.id,departure={x:5,y:5};
    const destination=generation.ensureFieldSpace(run.data,a.world,'n-iluneon-guild');
    run.data.currentNodeId=destination.id;a.player.nodeId=destination.id;
    generation.placeFieldEntity(a.world,destination,a.player,destination.spawn);
    story.arriveTimeAllies(run.data,a.world,destination,from,departure);
    assert.equal(a.dun.nodeId,destination.id);assert.strictEqual(story.livingTimeAlly(run.data,'npc-kumamimi'),identity);
    assert(a.dun.pos);assert.notDeepEqual(a.dun.pos,a.player.pos);
  });
  check('area arrival does not summon a remote restrained ally',()=>{
    const a=start();joinAlly(a,a.dun);a.dun.nodeId='n-emberforge-lair';a.dun.properties['status:anchored']=2;const before=a.dun.nodeId;
    story.arriveTimeAllies(run.data,a.world,a.space,a.space.id,a.player.pos);assert.equal(a.dun.nodeId,before,'a remote anchored NPC teleported to the player');
  });
} finally { globalThis.window=original.window;globalThis.localStorage=original.localStorage;globalThis.fetch=original.fetch;await server.close(); }
if(failures.length)throw new Error(failures.length+' invariant failures\n'+failures.join('\n'));
