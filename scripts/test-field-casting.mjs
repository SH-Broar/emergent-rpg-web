import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root=fileURLToPath(new URL('../',import.meta.url)),saved=new Map();
const old={window:globalThis.window,storage:globalThis.localStorage,fetch:globalThis.fetch};
globalThis.window={setTimeout:()=>0};
globalThis.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
const server=await createServer({root,server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
  setActivePinia(createPinia());const mod=p=>server.ssrLoadModule('/src/'+p);
  const {useRunStore}=await mod('stores/run.ts'),{useDataStore}=await mod('stores/data.ts');
  const {loadAllData}=await mod('data/loader.ts');
  globalThis.fetch=async url=>new Response(readFileSync(join(root,'public',String(url).replace(/^\//,'')),'utf8'));
  const data=useDataStore();data.data=await loadAllData('/');
  const field=await mod('systems/field-simulation.ts'),engine=await mod('systems/world/engine.ts');
  const casting=await mod('systems/field-casting.ts'),skills=await mod('systems/field-skills.ts');
  const {FIELD_COMBAT_STYLES}=await mod('data/field-professions.ts');
  const timeline=[...data.timelines.values()].find(t=>data.nodeMaps.get(t.nodeMapId)?.nodes.some(n=>n.id==='n-iluneon-square'));
  const selectable=timeline.availableRaceIds.filter(id=>data.races.has(id));
  assert.deepEqual(selectable,['human','moth','whitefang','slime','sminthus']);
  for(const id of selectable)for(const cardId of FIELD_COMBAT_STYLES[id].cardIds){assert(data.cards.has(cardId),id+' references an existing card '+cardId);assert.equal(skills.skillUnavailable(data.cards.get(cardId)),undefined,cardId+' is fully supported');}
  const results=['Actual loader offers the existing five starting characters; phantom and arcana are not timeline choices'];
  const run=useRunStore();
  function arena(){
    run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:100,maxMp:3,timeLimit:300});
    const a=field.ensureField(run.data);a.world.entities={player:a.player};run.data.relics=[];
    a.space.width=9;a.space.height=9;a.space.exits=[];a.space.tiles=Array.from({length:9},()=>Array(9).fill('grass'));
    a.player.pos={x:4,y:6};a.player.colors={};a.player.properties.guard=0;return a;
  }
  function actor(a,id,pos){
    return a.world.entities[id]={id,name:id,kind:'actor',nodeId:a.space.id,pos:{...pos},tags:['test-target'],colors:{},stock:{},properties:{integrity:100,maxHp:100}};
  }
  function context(a,id,effect,cells,targets=[]){
    const card=data.cards.get(id);assert(card,id+' exists');
    const e=effect??card.effects.find(e=>casting.CASTING_EFFECTS.has(e.kind));assert(e,id+' has ported effect');
    return {run:run.data,world:a.world,card,effect:e,cells:cells.map(pos=>({pos,multiplier:1})),targets:targets.map(target=>({target,multiplier:1})),value:e.value??0};
  }
  function move(a,target,pos){
    const result=engine.resolveInteraction(a.world,target.id,target.id,{id:'test:step',label:'이동',description:'',duration:0,effects:[{kind:'relocate',side:'actor',pos}]});
    assert(result.ok);casting.triggerFieldInstallations(run.data,a.world,target.id);
  }
  let a=arena(),target=actor(a,'enemy',{x:4,y:1});
  let ctx=context(a,'c-smi-bomb',undefined,[{x:4,y:3}]);
  assert.equal(casting.castingPlacementCells(a.world,a.player,[{pos:target.pos,multiplier:1}]).length,0,'cannot hide a new installation under an actor');
  assert(casting.resolveCastingEffect(ctx));
  const trap=Object.values(a.world.entities).find(e=>e.tags.includes('installation'));assert(trap);
  assert.equal(target.properties.integrity,100,'placing a trap is preparation, not immediate damage');
  assert.match(casting.fieldCastingLabel(trap,0),/폭약/);
  run.data.field.elapsedSeconds=30;move(a,target,{x:4,y:2});assert.equal(target.properties.integrity,100);
  move(a,target,{x:4,y:3});assert.equal(target.properties.integrity,90,'the actual second movement step trips the paid magical explosion');
  assert.equal(trap.properties.integrity,0);casting.triggerFieldInstallations(run.data,a.world,target.id);assert.equal(target.properties.integrity,90,'single-use contact cannot hit repeatedly');
  results.push('Empty-cell bomb preparation, arming, movement contact, direct damage and one-use discharge');

  a=arena();target=actor(a,'enemy',{x:4,y:3});
  ctx=context(a,'c-wf-afterimage',undefined,[{x:4,y:3}]);
  assert(casting.resolveCastingEffect(ctx));assert.equal(target.properties.integrity,100);
  run.data.field.elapsedSeconds=30;casting.tickFieldCasting(run.data,a.world);
  assert.equal(target.properties.integrity,92);casting.tickFieldCasting(run.data,a.world);assert.equal(target.properties.integrity,92);
  a=arena();target=actor(a,'enemy',{x:4,y:3});casting.resolveCastingEffect(context(a,'c-wf-afterimage',undefined,[{x:4,y:3}]));
  move(a,target,{x:4,y:2});run.data.field.elapsedSeconds=30;casting.tickFieldCasting(run.data,a.world);assert.equal(target.properties.integrity,100,'moving off the authored trace avoids the delayed strike');
  results.push('Delayed strike keeps fixed cells, resolves once, and can be evaded before impact');

  a=arena();const one=actor(a,'one',{x:3,y:3}),two=actor(a,'two',{x:4,y:3}),three=actor(a,'three',{x:5,y:3});
  engine.influenceEntity(a.world,one,'status:poison',3,'player');engine.influenceEntity(a.world,two,'status:poison',2,'player');
  casting.resolveCastingEffect(context(a,'c-sl-transfer',undefined,[one.pos,two.pos],[one,two]));
  assert.equal(one.properties['status:poison'],5);assert.equal(two.properties['status:poison'],5);assert.equal(three.properties['status:poison'],2,'sources are read before any copy; no order-dependent chain multiplication');
  casting.resolveCastingEffect(context(a,'c-sl-chainburst',undefined,[a.player.pos],[]));
  assert.equal(one.properties.integrity,92);assert.equal(two.properties.integrity,92);assert.equal(three.properties.integrity,92,'overlapping marked centers damage each body once');
  results.push('Status spread snapshots sources; overlapping chain centers cannot duplicate damage');

  a=arena();target=actor(a,'enemy',{x:4,y:3});engine.influenceEntity(a.world,target,'status:poison',3,'player');
  casting.resolveCastingEffect(context(a,'c-sl-spread',undefined,[target.pos],[target]));
  assert.equal(target.properties['status:poison'],6);assert.equal(target.properties.integrity,97);
  results.push('Amplification uses the existing applied mark and routes both status and damage through material influence');

  a=arena();const slow={...data.cards.get('c-magic-ember-star'),castSpeed:'slow'};
  const commitment=casting.castCommitment(slow,a.player);assert(commitment);
  engine.influenceEntity(a.world,a.player,'guard',20,'player');engine.influenceEntity(a.world,a.player,'force',10,'enemy');
  assert.equal(casting.brokenCastCommitment(commitment,a.player),undefined,'guard that fully absorbs the hit protects concentration');
  engine.influenceEntity(a.world,a.player,'force',20,'enemy');assert.match(casting.brokenCastCommitment(commitment,a.player),/피격/);
  a=arena();const positionCommitment=casting.castCommitment(slow,a.player);move(a,a.player,{x:4,y:5});assert.match(casting.brokenCastCommitment(positionCommitment,a.player),/움직/);
  assert.equal(casting.castCommitment({...slow,castSpeed:'fast'},a.player),undefined);
  results.push('Only authored slow casting commits position; actual HP damage or movement breaks it, absorbed hits do not');

  a=arena();casting.resolveCastingEffect(context(a,'c-smi-firetrap',undefined,[{x:4,y:3}]));
  const expired=Object.values(a.world.entities).find(e=>e.tags.includes('installation'));run.data.field.elapsedSeconds=150;casting.tickFieldCasting(run.data,a.world);
  assert.equal(expired.properties.integrity,0);target=actor(a,'late',{x:4,y:3});casting.triggerFieldInstallations(run.data,a.world,target.id);assert.equal(target.properties['status:burn']??0,0);
  assert(casting.castingEffectFailure({kind:'place-installation',value:2,params:{kind:'unknown'}}));
  assert(casting.castingEffectFailure({kind:'delayed-damage',value:2,params:{delay:0}}));
  results.push('Expired installations cannot activate; invalid authored duration and installation kind are rejected');

  a=arena();casting.resolveCastingEffect(context(a,'c-smi-firetrap',undefined,[{x:4,y:3}]));
  const carried=Object.values(a.world.entities).find(e=>e.tags.includes('installation'));carried.carriedBy='player';
  run.data.field.elapsedSeconds=150;casting.tickFieldCasting(run.data,a.world);assert.equal(carried.properties.integrity,0,'holding a physical installation does not freeze its lifetime');assert.equal(carried.carriedBy,undefined);assert.equal(a.world.entities[carried.id],undefined,'expired traces are purged rather than accumulating in the save');
  a=arena();target=actor(a,'boss',{x:4,y:3});target.creature={definitionId:'bs-act-1-anchor',rank:'boss',engaged:false};
  casting.resolveCastingEffect(context(a,'c-wf-afterimage',undefined,[target.pos]));
  run.data.field.elapsedSeconds=30;casting.tickFieldCasting(run.data,a.world);assert.equal(target.properties.integrity,100,'a remote spell cannot bypass the boss introduction and quest gate');
  results.push('Carrying preserves absolute expiration; delayed magic cannot bypass an unengaged boss');

  a=arena();target=actor(a,'beneficiary',{x:4,y:2});
  const empower={kind:'place-installation',value:3,params:{kind:'atk-up',duration:3}};
  casting.resolveCastingEffect(context(a,'c-smi-forge',empower,[{x:4,y:3}]));
  run.data.field.elapsedSeconds=30;move(a,target,{x:4,y:3});assert.equal(target.properties['status:strength'],3);
  move(a,target,{x:4,y:2});casting.resolveCastingEffect(context(a,'c-smi-forge',empower,[{x:4,y:3}]));
  run.data.field.elapsedSeconds=60;move(a,target,{x:4,y:3});assert.equal(target.properties['status:strength'],3,'repeat preparation refreshes instead of permanently stacking');
  run.data.field.elapsedSeconds=150;casting.tickFieldCasting(run.data,a.world);assert.equal(target.properties['status:strength'],0);
  results.push('Strength installation is a three-turn preparation with refresh, not unlimited field-life accumulation');

  console.log(JSON.stringify({status:'PASS',scenarios:results.length,selectable,packageCards:selectable.map(id=>({id,cards:FIELD_COMBAT_STYLES[id].cardIds.length})),nonSelectableLoaded:['phantom','arcana'].filter(id=>data.races.has(id)),results},null,2));
} finally {
  await server.close();globalThis.window=old.window;globalThis.localStorage=old.storage;globalThis.fetch=old.fetch;
}
