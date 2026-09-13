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
  const forms=await server.ssrLoadModule('/src/systems/field-transformation.ts');
  const combat=await server.ssrLoadModule('/src/systems/field-combat.ts');
  const rules=await server.ssrLoadModule('/src/systems/world/form-rules.ts');
  const status=await server.ssrLoadModule('/src/systems/world/status.ts');
  const rng=await server.ssrLoadModule('/src/systems/rng.ts');
  const legacy=await server.ssrLoadModule('/src/systems/combat.ts');
  const items=await server.ssrLoadModule('/src/systems/item.ts');
  const workshop=await server.ssrLoadModule('/src/systems/skill-workshop.ts');
  const pools=await server.ssrLoadModule('/src/systems/form-pool.ts');
  const {createSSRApp}=await import('vue'),{renderToString}=await import('@vue/server-renderer');
  const {default:Glyph}=await server.ssrLoadModule('/src/components/FieldEntityGlyph.vue');
  const results=[],clone=x=>JSON.parse(JSON.stringify(x));
  function reset(){
    run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:100,maxMp:3,timeLimit:300});
    run.data.level=12; // These fixtures exercise equipped high-level skills; novice gates are covered in test-field-journey.
    field.ensureField(run.data);
    run.data.currentNodeId='n-iluneon-square::player-home';
    run.data.interactionWorld.entities.player.nodeId=run.data.currentNodeId;
    const a=field.ensureField(run.data);
    a.world.entities={player:a.player};a.space.width=9;a.space.height=9;a.space.tiles=Array.from({length:9},()=>Array(9).fill('grass'));a.space.exits=[];
    a.player.pos={x:4,y:4};a.player.properties.hardness=3;a.player.properties.laborPower=17;
    a.player.colors={};run.data.colors={fire:0,electric:0,earth:0,iron:0,water:0,wind:0,light:0,dark:0};run.data.relics=[];
    return a;
  }
  function target(a,id='dummy',pos={x:4,y:3}){
    a.world.entities[id]={id,name:id,kind:'actor',nodeId:a.space.id,pos,colors:{},stock:{},tags:[],properties:{integrity:100,maxHp:100}};
    return a.world.entities[id];
  }
  function transform(a){
    engine.influenceEntity(a.world,a.player,'form:race-form-fox',1,'tamamo');
    forms.reconcileFieldTransformation(run.data,a.world);
    return run.data.transform;
  }
  function healer(a){
    const e=target(a,'npc:npc-cassis',{x:5,y:4});
    e.npcId='npc-cassis';e.name='카시스';e.tags=[...data.npcs.get('npc-cassis').tags];
    return e;
  }
  function originalCard(){
    const card={...clone(data.cards.get('c-strike')),instanceId:'invested-copy',enhanceLevel:7,awakened:true,enchantment:'ember',skillUpgrades:{efficiency:1,recovery:2,reach:1},bonusDamage:3};
    run.data.collection.push(card);run.data.deck.push(card);
    assert.equal(skills.equipFieldSkill(run.data,'triangle',card.instanceId),undefined);
    return run.data.collection.at(-1);
  }
  // Real authored attack, telegraph and contact resolution.
  let a=reset(),boss=generation.spawnCreature(run.data,a.world,a.space,data.bosses.get('bs-arc-tamamo'),0,'boss');
  boss.pos={x:4,y:1};boss.properties.integrity=40;boss.properties.attacksMade=2;boss.creature.engaged=true;
  let attack=combat.planAttack(a.world,boss,a.player);
  assert.equal(attack.name,'수행의 낙인');assert.equal(attack.castTurns,2);assert.equal(attack.transform.raceId,'race-form-fox');
  assert(attack.cells.length>=16);assert(attack.cells.length<80,'safe cells remain');
  boss.creature.pending=attack;rng.setRng(()=>0);
  combat.resolveAttack(a.world,boss);assert(!a.player.form,'first mark does not immediately transform');assert.equal(a.player.properties['status:feral'],3,'first mark inflicts feral');
  boss.creature.pending=clone(attack);a.player.properties['status:feral']=3;
  a.player.pos={x:3,y:5};combat.resolveAttack(a.world,boss);assert(!a.player.form,'leaving the telegraph evades transformation');
  a.player.pos={x:4,y:4};boss.creature.pending=clone(attack);
  boss.creature.recovery=0; // Next independent contact trial starts after the evaded swing's recovery.
  rng.setRng(()=>.5);run.data.level=20;field.ensureField(run.data);combat.resolveAttack(a.world,boss);assert(!a.player.form);
  assert(a.world.events.some(e=>e.message==='변신 저항'));
  boss.creature.pending=clone(attack);run.data.level=1;field.ensureField(run.data);combat.resolveAttack(a.world,boss);
  forms.reconcileFieldTransformation(run.data,a.world);assert.equal(run.data.raceId,'race-form-fox');
  assert(rules.transformationChance(1)>rules.transformationChance(10));assert(rules.transformationChance(10)>rules.transformationChance(20));
  assert(rules.transformationChance(100)>=.1);
  results.push('authored slow raid pattern, feral gate, evasion and decreasing level probability');

  a=reset();const original=originalCard(),originalCollection=clone(run.data.collection),originalDeck=clone(run.data.deck),oldSlots=clone(run.data.field.skills.slots);
  const body=clone(a.player.properties),hp=run.data.hp,mp=run.data.mp,clock=run.data.field.elapsedSeconds;
  run.data.field.skills.readyAt[skills.skillFamily(original)]=7;
  run.data.field.skills.pending={card:clone(original),nodeId:a.space.id,cells:[{pos:{x:4,y:3},multiplier:1}],due:2,paid:1,power:2};
  run.data.field.skills.nextPower={multiplier:2,expires:9};run.data.field.skills.manaDue=[{amount:3,due:3}];
  let t=transform(a);
  assert.deepEqual(t.stashCollection,originalCollection);assert.deepEqual(t.stashDeck,originalDeck);
  assert.deepEqual(t.field.skills.slots,oldSlots);assert.equal(t.field.skills.pending,undefined);assert.equal(run.data.field.skills.pending,undefined);
  assert.equal(run.data.field.skills.nextPower,undefined);assert.equal(run.data.field.skills.manaDue,undefined);
  assert.equal(run.data.hp,hp);assert.equal(run.data.mp,mp);assert.equal(run.data.field.elapsedSeconds,clock);
  assert.equal(a.player.agent.species,'race-form-fox');assert.equal(Object.keys(run.data.field.skills.slots).length,5);
  assert(skills.skillFailure(run.data,a.world,original,[{pos:{x:4,y:3},multiplier:1}]).includes('봉인'));
  const victim=target(a);skills.resolveFieldSkill(run.data,a.world,original,[{pos:victim.pos,multiplier:1}],1);assert.equal(victim.properties.integrity,100);
  assert.equal(pools.isFormPoolActive(),false,'ordinary rewards remain obtainable, including while transformed');
  const beforeReapply=JSON.stringify(run.data.transform);transform(a);assert.equal(JSON.stringify(run.data.transform),beforeReapply);
  results.push('species and body change, original skills sealed, investments snapshotted once, paid preparations cancelled');

  run.saveActiveRun();run.$reset();assert(run.loadActiveRun());
  a=field.ensureField(run.data);a.player=a.world.entities.player;
  assert.equal(a.player.agent.species,'race-form-fox');assert.deepEqual(run.data.transform.stashCollection,originalCollection);
  const art=await renderToString(createSSRApp(Glyph,{entity:a.player}));
  assert(art.includes('data-form="two-tail-fox"'));assert.equal((art.match(/data-tail=/g)??[]).length,2);
  combat.clearCombatStatuses(a.player,true);field.advanceFieldTime(60);assert(run.data.transform,'time and rest do not cure the species');
  assert.equal(legacy.revertTransformationState(),false,'legacy card/item cleanse cannot bypass NPC cure');
  assert(run.data.transform);assert.equal(skills.skillUnavailable(data.cards.get('c-release-change'))!==undefined,true);
  const mirror={...clone(data.items.get('i-truename-mirror')),instanceId:'test-mirror'};run.data.items.push(mirror);
  assert(items.useItem(mirror).includes('찾아야'));assert(run.data.transform);assert(run.data.items.some(i=>i.instanceId==='test-mirror'),'ineffective mirror is not consumed');
  results.push('real save roundtrip, humanoid two-tail rendering, persistent species and blocked legacy cleanse');

  const acquired={...clone(data.cards.get('c-strike')),instanceId:'earned-during-form'};run.data.collection.push(acquired);
  assert(skills.equipFieldSkill(run.data,'square',acquired.instanceId)?.includes('봉인'));
  const smith=target(a,'bench',{x:3,y:4});smith.kind='facility';smith.tags=['workshop'];
  const material={...clone(acquired),instanceId:'form-upgrade-material'};run.data.collection.push(material);
  assert.equal(workshop.upgradeSkill(run.data,run.data.collection[0].instanceId,[material.instanceId],'power'),undefined);
  assert.equal(run.data.collection[0].enhanceLevel,1);assert(!run.data.collection.some(c=>c.instanceId===material.instanceId));
  let npc=healer(a);
  assert(field.speechFor(run.data,npc).topics.some(t=>t.action==='restore-form'));
  const staleId=npc.id,snapshot=()=>JSON.stringify({transform:run.data.transform,collection:run.data.collection,race:run.data.raceId});
  let before=snapshot();npc.properties.integrity=0;
  assert.equal(forms.cureFieldTransformation(run.data,a.world,npc.id).ok,false);assert.equal(snapshot(),before);
  field.ensureField(run.data);assert.equal(npc.properties.integrity,0,'loading area does not revive the healer');
  npc.properties.integrity=100;npc.nodeId='away';assert.equal(forms.cureFieldTransformation(run.data,a.world,npc.id).ok,false);
  npc.nodeId=a.space.id;npc.pos={x:7,y:7};assert.equal(forms.cureFieldTransformation(run.data,a.world,npc.id).ok,false);
  npc.pos={x:5,y:4};npc.properties['status:sleep']=2;assert.equal(forms.cureFieldTransformation(run.data,a.world,npc.id).ok,false);
  npc.properties['status:sleep']=0;npc.tags=[];assert.equal(forms.cureFieldTransformation(run.data,a.world,npc.id).ok,false);
  delete a.world.entities[staleId];assert.equal(field.performFieldService(staleId,'restore-form').ok,false);assert.equal(snapshot(),before);
  npc=healer(a);
  assert.equal(field.performFieldService(npc.id,'restore-form').ok,true);
  assert.equal(run.data.transform,undefined);assert.equal(run.data.raceId,'human');assert.equal(a.player.agent.species,'human');
  assert.deepEqual(run.data.collection.slice(0,originalCollection.length),originalCollection);
  assert(run.data.collection.some(c=>c.instanceId==='earned-during-form'));assert(run.data.collection.every(c=>c.source!=='form'));
  assert.deepEqual(run.data.deck,originalDeck);assert.deepEqual(run.data.field.skills.slots,oldSlots);
  assert.equal(a.player.properties.hardness,body.hardness);assert.equal(a.player.properties.laborPower,body.laborPower);
  assert.equal(run.data.field.skills.readyAt[skills.skillFamily(original)],7,'absolute cooldown is retained');
  assert.equal(run.data.field.skills.pending,undefined);
  before=snapshot();assert.equal(field.performFieldService(npc.id,'restore-form').ok,false);assert.equal(snapshot(),before);
  results.push('living adjacent capable NPC only, no resurrection or remote cure, stale choice validation, exact investments and earned loot restored once');

  for(const id of data.races.get('race-form-fox').fieldSkills){
    a=reset();transform(a);target(a);
    const card=run.data.collection.find(c=>c.id===id),glyph=skills.SKILL_GESTURES.find(g=>skills.equippedSkill(run.data,g)?.id===id);
    assert(card&&glyph);const result=field.performFieldGesture(glyph,'dummy',{x:4,y:3},{drawn:true,quality:1});
    assert(result.ok,id+': '+result.message);assert.equal(run.data.mp,3-skills.skillMana(card));
    assert(skills.skillRemaining(run.data,card)>0);field.advanceFieldTime(30);
  }
  results.push('all five form skills execute through gestures with mana and turn cooldowns');

  a=reset();const old=originalCard(),stash=clone(run.data.collection);
  run.data.transform={formRaceId:'race-form-fox',originalRaceId:'human',stashDeck:clone(run.data.deck),stashCollection:stash,stashDeckSize:run.data.deckSize,releaseStack:3};
  run.data.raceId='race-form-fox';run.data.collection=[{...clone(data.cards.get('c-release-change')),instanceId:'legacy-release'}];run.data.deck=clone(run.data.collection);
  field.ensureField(run.data);assert(run.data.transform.field);assert.equal(run.data.collection.filter(c=>c.source==='form').length,5);
  assert(!run.data.collection.some(c=>c.id==='c-release-change'));assert.deepEqual(run.data.transform.stashCollection,stash);
  assert(forms.cureFieldTransformation(run.data,a.world,healer(a).id).ok);assert(run.data.collection.some(c=>c.instanceId===old.instanceId));
  assert(Object.keys(run.data.field.skills.slots).length>0,'legacy saves without original slots receive a usable restored loadout');
  results.push('legacy transformed saves migrate without destroying the original collection');

  a=reset();let normal=generation.spawnCreature(run.data,a.world,a.space,[...data.monsters.values()].find(m=>!m.splitCount),1,'normal');
  normal.properties.integrity=0;let xp=run.data.xp??0;field.advanceFieldTime(30);assert.equal(run.data.xp,xp+1);
  field.advanceFieldTime(30);assert.equal(run.data.xp,xp+1,'defeat XP awarded once');
  const elite=generation.spawnCreature(run.data,a.world,a.space,[...data.monsters.values()].find(m=>!m.splitCount),2,'elite');
  elite.properties.integrity=0;const level=run.data.level??1;field.advanceFieldTime(30);assert.equal(run.data.level,level+1);assert.equal(a.player.properties.level,level+1);
  results.push('field normal and elite defeats restore original XP rewards without duplication');
  a=reset();
  boss=generation.spawnCreature(run.data,a.world,a.space,data.bosses.get('bs-arc-tamamo'),5,'boss');
  boss.pos={x:4,y:1};boss.properties.integrity=40;boss.creature.phase=1;boss.creature.engaged=true;boss.properties.attacksMade=2;
  a.player.properties['status:feral']=4;boss.creature.pending=combat.planAttack(a.world,boss,a.player);boss.creature.pending.remaining=1;boss.creature.intent=boss.creature.pending.cells.map(c=>c.pos);
  run.saveActiveRun();field.advanceFieldTime(30);const outcome=!!run.data.transform;
  run.$reset();assert(run.loadActiveRun());field.advanceFieldTime(30);assert.equal(!!run.data.transform,outcome,'saved pending cast cannot reroll the outcome');
  a=reset();transform(a);const lives=run.data.lives;run.data.hp=0;a.player.properties.integrity=0;
  field.advanceFieldTime(30);assert.equal(run.data.lives,lives);assert.equal(run.data.field.bases.knockouts,1);assert(run.data.transform,'waking at home does not cure the species');
  results.push('actual field turn resolves saved transformation metadata with deterministic contact outcome');

  a=reset();transform(a);let formFire=run.data.collection.find(c=>c.id==='c-fox-apprentice-fire');
  const smith2=target(a,'growth-bench',{x:3,y:4});smith2.kind='facility';smith2.tags=['workshop'];
  const scaling=await server.ssrLoadModule('/src/systems/enhance.ts');
  for(let level=0;level<30;level++){
    if(level===5){const spec=[...data.items.values()].find(i=>i.category==='specialty'&&i.element==='fire');
      for(let j=0;j<2;j++)run.data.items.push({...clone(spec),instanceId:'spec-'+j});
      run.data.items.push({...clone(data.items.get('i-material-rare')),instanceId:'rare'});
      assert.equal(workshop.awakenFieldSkill(run.data,formFire.instanceId),undefined);
    }
    formFire=run.data.collection.find(c=>c.instanceId===formFire.instanceId);
    const quote=workshop.upgradeQuote(formFire,'power'),ids=[];
    for(let j=0;j<quote.cards;j++){const id='fuel-'+level+'-'+j;ids.push(id);run.data.collection.push({...clone(data.cards.get('c-strike')),instanceId:id});}
    assert.equal(workshop.upgradeSkill(run.data,formFire.instanceId,ids,'power'),undefined);
  }
  assert.equal(formFire.enhanceLevel,30);assert(scaling.scaledValue(6,formFire)>=36,'form can grow far beyond its initial damage');
  run.data.timeShards=100;run.data.items.push(...[0,1].map(i=>({...clone(data.items.get('i-material-common')),instanceId:'enchant-'+i})));
  assert.equal(workshop.enchantSkill(run.data,formFire.instanceId,'ember'),undefined);
  assert.equal(workshop.upgradeSkill(run.data,formFire.instanceId,[],'power'),'최대 강화');
  const learned=clone(formFire),loadout=clone(run.data.field.skills.slots);run.data.field.skills.readyAt[skills.skillFamily(formFire)]=999;
  assert(forms.cureFieldTransformation(run.data,a.world,healer(a).id).ok);
  run.saveActiveRun();run.$reset();assert(run.loadActiveRun());a=field.ensureField(run.data);transform(a);
  assert.deepEqual(run.data.collection.find(c=>c.instanceId===learned.instanceId),learned);
  assert.deepEqual(run.data.field.skills.slots,loadout);assert.equal(run.data.field.skills.readyAt[skills.skillFamily(formFire)],999);
  assert.equal(run.data.collection.filter(c=>c.instanceId===learned.instanceId).length,1);
  results.push('hidden profession grows to attack +30 with awakening and enchantment; investments and cooldowns survive cure, save and re-transformation without copies');
  a=reset();skills.grantStartingFieldSkills(run.data,data.cards);
  run.data.collection=run.data.collection.filter(c=>c.id!=='c-human-riposte');
  for(let cycle=0;cycle<2;cycle++){
    const transformed=transform(a);assert.equal(transformed.field.skills.preparationVersion,1);
    assert(forms.cureFieldTransformation(run.data,a.world,healer(a).id).ok);
    assert.equal(run.data.field.skills.preparationVersion,1);
    assert.equal(run.data.field.formTraining['race-form-fox'].skills.preparationVersion,1);
    assert(!run.data.collection.some(c=>c.id==='c-human-riposte'),'spent starting cards cannot return through repeated transformation and cure');
  }
  results.push('preparation migration marker survives both sealed and learned bodies; repeated cure cannot regenerate spent starter cards');
  console.log(JSON.stringify({status:'PASS',scenarios:results.length,results},null,2));
} finally {globalThis.window=oldWindow;globalThis.localStorage=oldStorage;globalThis.fetch=oldFetch;await server.close();}
