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
  const field=await mod('systems/field-simulation.ts'),generation=await mod('systems/field-generation.ts');
  const catalog=await mod('systems/life-catalog.ts'),life=await mod('systems/world/life-world.ts');
  const engine=await mod('systems/world/engine.ts'),inventory=await mod('systems/world-interaction.ts');
  const bases=await mod('systems/field-bases.ts'),delivery=await mod('systems/delivery.ts'),workshop=await mod('systems/workshop.ts');
  const forage=await mod('systems/field-forage.ts');
  const timeline=[...data.timelines.values()].find(t=>data.nodeMaps.get(t.nodeMapId)?.nodes.some(n=>n.id==='n-iluneon-square'));
  const run=useRunStore(),map=data.nodeMaps.get(timeline.nodeMapId);
  function check(name,fn){try{fn();results.push(name);console.log('PASS '+name);}catch(e){failures.push(name+': '+e.message);console.error('FAIL '+name+': '+e.message);}}
  function start(){
    run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:100,maxMp:3,timeLimit:300});
    run.data.relics=[];return field.ensureField(run.data);
  }
  function at(nodeId){
    run.data.currentNodeId=nodeId;run.data.interactionWorld.entities.player.nodeId=nodeId;
    const a=field.ensureField(run.data);return a;
  }
  function isolate(a,entities){
    a.world.entities=Object.fromEntries([a.player,...entities].map(e=>[e.id,e]));
    a.space.width=9;a.space.height=9;a.space.tiles=Array.from({length:9},()=>Array(9).fill('grass'));a.space.exits=[];
    a.player.pos={x:4,y:5};for(const [i,e]of entities.entries())e.pos={x:4+i,y:4};
  }
  function totalLife(){return ((run.data.lifeLevel??1)-1)*3+(run.data.lifeXp??0);}
  function board(nodeId='n-iluneon-square'){
    start();const a=at(nodeId),counter=Object.values(a.world.entities).find(e=>e.nodeId===a.space.id&&e.tags.includes('service:village'));
    assert(counter);isolate(a,[counter]);return {...a,counter};
  }
  function physical(){return JSON.stringify({items:run.data.items,contracts:run.data.tradeContracts,states:run.data.nodeStates,mp:run.data.mp,hp:run.data.hp,
    gold:run.data.gold,shards:run.data.timeShards,life:totalLife(),colors:run.data.colors,time:run.data.field.elapsedSeconds,
    stocks:Object.values(run.data.interactionWorld.entities).map(e=>[e.id,e.stock])});}

  check('all eight authored forage activities use real tap input, mastery yield, quality and COLOR without touching adjacent stock',()=>{
    for(const activity of catalog.LIFE_ACTIVITIES){
      start();let a,patches=[];
      for(const node of map.nodes.filter(n=>n.kind==='gather'&&catalog.activityForNode(n.id,n.region).id===activity.id)){
        a=at(node.id);patches=Object.values(a.world.entities).filter(e=>e.nodeId===node.id&&e.tags.includes('forage')&&e.renewable);if(patches.length)break;
      }
      assert(patches.length>=1,activity.id+' has an authored wild patch');const [patch,neighbor]=patches;isolate(a,patches.slice(0,2));
      run.data.lifeLevel=20;run.data.lifeXp=0;run.data.colors[activity.element]=70;
      inventory.syncPlayerToWorld(run.data,a.world);
      const crop=catalog.cropForActivity(activity),upper=crop?.upperItemId??activity.upperItemId,source=patch.renewable.resourceId;
      const held=a.player.stock[upper]??0,time=run.data.field.elapsedSeconds,other=JSON.stringify(neighbor?.stock);
      const result=field.performFieldGesture('tap',patch.id,patch.pos);assert(result.ok,activity.id+': '+result.message);
      assert.equal(patch.stock[source],0);assert.equal(a.player.stock[upper]-held,4,activity.id+' skilled yield');
      assert.equal(run.data.colors[activity.element],73);assert.equal(run.data.lifeXp,2);
      assert.equal(JSON.stringify(neighbor?.stock),other);assert.equal(run.data.field.elapsedSeconds,time+30);
      const before=physical();assert(!field.performFieldGesture('tap',patch.id,patch.pos).ok);assert.equal(physical(),before);
    }
  });
  check('extraction preserves depletion across saves and renewal remains per-patch',()=>{
    start();const node=map.nodes.find(n=>n.kind==='gather'&&catalog.activityForNode(n.id,n.region).id==='act-mine');
    let a=at(node.id);const patches=Object.values(a.world.entities).filter(e=>e.nodeId===node.id&&e.tags.includes('forage')&&e.renewable);
    const [patch,other]=patches;isolate(a,[patch,other]);
    assert(field.performFieldGesture('take',patch.id,patch.pos).ok);
    run.saveActiveRun();run.$reset();assert(run.loadActiveRun());a=field.ensureField(run.data);
    const loaded=a.world.entities[patch.id],neighbor=a.world.entities[other.id];assert.equal(loaded.stock[loaded.renewable.resourceId],0);
    generation.ensureFieldSpace(run.data,a.world,node.id);assert.equal(loaded.stock[loaded.renewable.resourceId],0);
    a.world.turn=loaded.renewable.nextTurn;neighbor.renewable.nextTurn=a.world.turn+1;neighbor.stock[neighbor.renewable.resourceId]=1;
    engine.tickMaterials(a.world,'only',new Set([loaded.id,neighbor.id]));
    assert.equal(loaded.stock[loaded.renewable.resourceId],2);assert.equal(neighbor.stock[neighbor.renewable.resourceId],1);
  });
  check('rare spring seeds remain two authored finite objects and mastery cannot multiply them',()=>{
    const a=start();const found=[];
    for(const nodeId of forage.SPRING_SEED_PLACES){
      const current=at(nodeId),seed=Object.values(current.world.entities).find(e=>e.nodeId===nodeId&&e.tags.includes('rare-source'));assert(seed);
      const before=current.player.stock['field-springseed']??0;isolate(current,[seed]);run.data.lifeLevel=50;
      assert(field.performFieldGesture('tap',seed.id,seed.pos).ok);assert.equal(current.player.stock['field-springseed']-before,1);
      assert.equal(seed.stock['field-springseed'],0);assert(!seed.renewable);found.push(seed.nodeId);
      assert(!field.performFieldGesture('tap',seed.id,seed.pos).ok);
      generation.ensureFieldSpace(run.data,current.world,nodeId);assert.equal(seed.stock['field-springseed'],0);
    }
    assert.equal(found.length,2);assert.equal(new Set(found).size,2);
  });
  check('partially depleted raw stock cannot produce the full skilled harvest twice',()=>{
    const a=start(),activity=catalog.LIFE_ACTIVITIES.find(x=>x.id==='act-mine');
    const node=map.nodes.find(n=>n.kind==='gather'&&catalog.activityForNode(n.id,n.region).id===activity.id);
    const current=at(node.id),patch=Object.values(current.world.entities).find(e=>e.nodeId===node.id&&e.tags.includes('forage')&&e.renewable);
    isolate(current,[patch]);patch.stock[patch.renewable.resourceId]=1;run.data.lifeLevel=20;inventory.syncPlayerToWorld(run.data,current.world);
    const before=current.player.stock[activity.upperItemId]??0;
    assert(field.performFieldGesture('tap',patch.id,patch.pos).ok);assert.equal(current.player.stock[activity.upperItemId]-before,3);
    assert.equal(patch.stock[patch.renewable.resourceId],0);
  });
  check('mixed and fine local ore build an actual base atomically, without initial-town raw stone',()=>{
    for(const mineral of [{'i-life-ore':8},{'raw-stone':2,'i-life-ore':2,'i-life-ore-fine':2},{'i-life-ore-fine':4}]){
      start();const a=at('n-manonickla::commons'),door=Object.values(a.world.entities).find(e=>e.nodeId===a.space.id&&e.tags.includes('base:build'));
      assert(door);isolate(a,[door]);
      a.player.stock={'raw-fiber':12,'i-material-common':4,...mineral};inventory.syncPlayerFromWorld(run.data,a.world);
      assert(bases.homeBuildQuote(a.player.stock).ready);const time=run.data.field.elapsedSeconds;
      assert(field.performFieldService(door.id,'base:build').ok);assert(run.data.field.bases.owned['n-manonickla']);
      for(const id of Object.keys(mineral))assert.equal(a.player.stock[id],0);
      assert.equal(run.data.field.elapsedSeconds,time+30);const before=physical();
      assert(!field.performFieldService(door.id,'base:build').ok);assert.equal(physical(),before);
    }
  });
  check('insufficient local masonry never consumes other construction resources',()=>{
    start();const a=at('n-manonickla::commons'),door=Object.values(a.world.entities).find(e=>e.nodeId===a.space.id&&e.tags.includes('base:build'));isolate(a,[door]);
    a.player.stock={'raw-fiber':12,'i-material-common':4,'i-life-ore':1,'i-life-ore-fine':3};inventory.syncPlayerFromWorld(run.data,a.world);
    assert.equal(bases.homeBuildQuote(a.player.stock).stoneMissing,1);const before=physical();
    assert(!field.performFieldService(door.id,'base:build').ok);assert.equal(physical(),before);
  });
  check('new field village contracts turn real processed goods into shards and survive completion reload without duplicate rewards',()=>{
    start();const village=map.nodes.find(n=>n.kind==='village'&&map.nodes.some(other=>other.region===n.region&&other.kind==='elite'));assert(village);
    const a=board(village.id),offer=delivery.availableDeliveryContracts().find(x=>x.req.itemId.startsWith('i-craft-'));assert(offer);
    assert(delivery.acceptContract(offer.node.id));const original=JSON.stringify(run.data.tradeContracts[offer.node.id]);
    assert(delivery.acceptContract(offer.node.id));assert.equal(JSON.stringify(run.data.tradeContracts[offer.node.id]),original);
    const recipe=workshop.listProcessingRecipes().find(x=>x.outputId===offer.req.itemId);assert(recipe);
    for(let i=0;i<recipe.inputCount*offer.req.count;i++)run.addItem(data.items.get(recipe.lowerId));
    const forgeNode=map.nodes.find(n=>n.kind==='workshop');at(forgeNode.id);
    for(let i=0;i<offer.req.count;i++)assert(workshop.processItem(recipe));
    const returned=at(a.space.id);returned.player.pos={x:4,y:5};inventory.syncPlayerToWorld(run.data,returned.world);
    const shards=run.data.timeShards,lifeXp=totalLife(),stock=a.counter.stock[recipe.outputId]??0;
    const result=delivery.fulfillContract(offer.node.id);assert(result);
    assert.equal(run.data.timeShards,shards+3+offer.req.tier);assert.equal(totalLife(),lifeXp+(1+offer.req.tier)*2);
    assert.equal(a.counter.stock[recipe.outputId],stock+offer.req.count);
    assert.equal(run.data.items.filter(i=>i.id===recipe.outputId).length,0);assert(run.data.nodeStates[offer.node.id].tradeCleared);
    assert(!run.data.nodeStates[offer.node.id].combatCleared,'delivery must not invent monster defeat');
    assert(a.world.events.some(f=>f.targetId===a.counter.id&&f.actorId==='player'&&f.kind==='transfer'&&f.resourceId===recipe.outputId));
    const before=physical();assert.equal(delivery.fulfillContract(offer.node.id),null);assert.equal(physical(),before);
    run.saveActiveRun();run.$reset();assert(run.loadActiveRun());field.ensureField(run.data);
    assert.equal(delivery.acceptContract(offer.node.id),undefined);assert(!delivery.availableDeliveryContracts().some(x=>x.node.id===offer.node.id));
  });
  check('field contracts reject invalid, foreign, distant, sleeping and destroyed-counter operations without spending goods',()=>{
    const a=board(),offer=delivery.availableDeliveryContracts()[0];assert(offer);
    const foreign=map.nodes.find(n=>n.kind==='combat'&&n.region!==map.nodes.find(n=>n.id===a.space.id).region);
    let before=physical();assert.equal(delivery.acceptContract('missing'),undefined);assert.equal(delivery.acceptContract(foreign.id),undefined);assert.equal(physical(),before);
    a.player.pos={x:0,y:0};before=physical();assert.equal(delivery.acceptContract(offer.node.id),undefined);assert.equal(physical(),before);
    a.player.pos={x:4,y:5};a.player.properties['status:sleep']=1;before=physical();assert.equal(delivery.acceptContract(offer.node.id),undefined);assert.equal(physical(),before);
    a.player.properties['status:sleep']=0;assert(delivery.acceptContract(offer.node.id));
    for(let i=0;i<offer.req.count;i++)run.addItem(data.items.get(offer.req.itemId));inventory.syncPlayerToWorld(run.data,a.world);
    a.counter.properties.integrity=0;before=physical();assert.equal(delivery.fulfillContract(offer.node.id),null);assert.equal(physical(),before);
    a.counter.properties.integrity=100;run.data.items=[];inventory.syncPlayerToWorld(run.data,a.world);before=physical();
    assert.equal(delivery.fulfillContract(offer.node.id),null);assert.equal(physical(),before);
  });
  console.log(JSON.stringify({passed:results.length,failed:failures.length,failures},null,2));
} finally {
  await server.close();globalThis.window=old.window;globalThis.localStorage=old.storage;globalThis.fetch=old.fetch;
}
if(failures.length)throw new Error(failures.length+' field life regression failures');
