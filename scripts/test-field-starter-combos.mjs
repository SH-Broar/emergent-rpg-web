import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root=fileURLToPath(new URL('../',import.meta.url)),saved=new Map();
const old={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
globalThis.window={setTimeout:()=>0};
globalThis.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
const server=await createServer({root,server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
  setActivePinia(createPinia());
  const mod=p=>server.ssrLoadModule('/src/'+p);
  const {loadAllData}=await mod('data/loader.ts'),{useDataStore}=await mod('stores/data.ts'),{useRunStore}=await mod('stores/run.ts');
  globalThis.fetch=async url=>new Response(readFileSync(join(root,'public',String(url).replace(/^\//,'')),'utf8'));
  const data=useDataStore();data.data=await loadAllData('/');
  const field=await mod('systems/field-simulation.ts'),skills=await mod('systems/field-skills.ts'),rules=await mod('systems/field-skill-rules.ts');
  const engine=await mod('systems/world/engine.ts');
  const {syncPlayerFromWorld}=await mod('systems/world-interaction.ts');
  const {FIELD_COMBAT_STYLES}=await mod('data/field-professions.ts'),{instantiateCard}=await mod('systems/deck.ts');
  const {starterTactics}=await mod('systems/tactical-cards.ts'),{applySeedColors}=await mod('systems/colors.ts');
  const {applyPassiveRelicsAtRunStart}=await mod('systems/relic.ts');
  const timeline=[...data.timelines.values()].find(t=>data.nodeMaps.get(t.nodeMapId)?.nodes.some(n=>n.id==='n-iluneon-square'));
  const run=useRunStore(),results=[],starts=[],economy=[];
  function start(raceId){
    const r=data.races.get(raceId);
    run.startRun({timelineId:timeline.id,raceId,season:'spring',startNodeId:'n-iluneon-square',maxHp:r.baseStats.hp+(r.startHpBonus??0),maxMp:r.baseStats.mp+(r.startMpBonus??0),timeLimit:timeline.timeLimit});
    // Current five starting decks are full. This uses the production package grant and field auto-equip.
    const cards=r.startingDeck.map(id=>data.cards.get(id)).filter(Boolean).map(instantiateCard),deckSize=r.deckSize??cards.length;
    assert(cards.length>=deckSize,'new random filler needs a separate deterministic starting test');
    run.data.collection=cards;run.data.deck=cards.slice(0,deckSize);run.data.deckSize=deckSize;
    skills.grantStartingFieldSkills(run.data,data.cards);
    const count=run.data.collection.length;skills.grantStartingFieldSkills(run.data,data.cards);assert.equal(run.data.collection.length,count,'initial grant is idempotent');
    const tactics=starterTactics();run.data.collection.push(...tactics);
    const retained=[...run.data.deck];for(let i=0;i<tactics.length;i++){const b=retained.findIndex(c=>c.rank==='basic');retained.splice(b>=0?b:retained.length-1,1);}
    run.data.deck=[...tactics,...retained].slice(0,deckSize);
    applySeedColors(r.seedColors);run.data.relics=(r.seedRelicIds??[]).map(id=>data.relics.get(id)).filter(Boolean);applyPassiveRelicsAtRunStart();
    return field.ensureField(run.data);
  }
  const slots=()=>Object.fromEntries(Object.entries(run.data.field.skills.slots).map(([g,iid])=>[g,run.data.collection.find(c=>c.instanceId===iid)?.id]));
  for(const raceId of timeline.availableRaceIds.filter(id=>FIELD_COMBAT_STYLES[id])){
    const a=start(raceId),style=FIELD_COMBAT_STYLES[raceId];
    assert.deepEqual(Object.values(slots()),style.starter);
    assert.equal(run.data.level,1);assert.equal(run.data.mp,3);
    for(const id of style.cardIds)assert(run.data.collection.some(c=>c.id===id));
    assert.deepEqual(rules.unlockedSkillGestures(1),['corner','angle']);
    const previous=JSON.stringify(run.data.field.skills.slots);skills.ensureFieldSkills(run.data);assert.equal(JSON.stringify(run.data.field.skills.slots),previous);
    starts.push({raceId,level:run.data.level,hp:run.data.hp,slots:slots(),collection:style.cardIds,practiceAvailable:Object.values(a.world.entities).some(e=>e.nodeId===a.player.nodeId&&e.tags.includes('practice'))});
  }
  results.push('All five actual Lv1 character packages own their learning path and auto-equip two different simple techniques; high glyphs remain locked');

  start('human');
  const oldCard=run.data.collection.find(c=>c.id==='c-defend'),oldInstance=oldCard.instanceId;
  oldCard.magic={strokes:2,mana:2};oldCard.enhanceLevel=4;oldCard.enchantment='shelter';
  run.data.collection=run.data.collection.filter(c=>c.id!=='c-human-riposte');
  const oldSkills=run.data.field.skills;delete oldSkills.preparationVersion;
  oldSkills.readyAt['c-defend']=7;oldSkills.slots={corner:oldInstance};
  skills.ensureFieldSkills(run.data);
  assert.deepEqual(oldSkills.slots,{corner:oldInstance});assert.equal(oldSkills.readyAt['c-defend'],7);
  assert.equal(oldCard.magic.mana,2);assert.equal(oldCard.magic.strokes,2);assert.equal(oldCard.enhanceLevel,4);assert.equal(oldCard.enchantment,'shelter');
  assert(skills.skillEffects(oldCard).some(e=>e.kind==='apply-status'&&e.params.status==='ward'));
  assert(run.data.collection.some(c=>c.id==='c-human-riposte'));
  run.data.collection=run.data.collection.filter(c=>c.id!=='c-human-riposte');
  skills.ensureFieldSkills(run.data);assert(!run.data.collection.some(c=>c.id==='c-human-riposte'),'spent materials are never regenerated after migration');
  run.saveActiveRun();run.$reset();assert(run.loadActiveRun());skills.ensureFieldSkills(run.data);
  assert.equal(run.data.field.skills.preparationVersion,1);assert.equal(run.data.field.skills.readyAt['c-defend'],7);
  assert(!run.data.collection.some(c=>c.id==='c-human-riposte'));
  results.push('Existing saves migrate card effects and missing learning cards once while keeping slots, upgrades, enchantments and cooldowns; spent cards stay spent after reload');

  function arena(raceId='human',pos={x:4,y:5}){
    start(raceId);
    run.data.currentNodeId='n-iluneon-square::player-home';run.data.interactionWorld.entities.player.nodeId=run.data.currentNodeId;
    const a=field.ensureField(run.data);
    a.world.entities={player:a.player};a.space.width=9;a.space.height=9;a.space.exits=[];a.space.tiles=Array.from({length:9},()=>Array(9).fill('grass'));
    a.player.pos={x:4,y:6};a.player.colors={};a.player.properties.guard=0;a.player.properties.hardness=0;run.data.relics=[];run.data.equipment={};run.data.field.gestureXp={};
    run.data.colors={fire:0,electric:0,earth:0,iron:0,water:0,wind:0,light:0,dark:0};
    a.target={id:'dummy',name:'stationary actor',kind:'actor',nodeId:a.space.id,pos:{...pos},tags:[],colors:{},stock:{},properties:{integrity:100,maxHp:100}};
    a.world.entities.dummy=a.target;a.steps=[];
    return a;
  }
  const glyph=id=>Object.entries(slots()).find(([,c])=>c===id)?.[0]??id;
  function act(a,id,aim=a.target.pos,targetId=a.target.id){
    if(['c-defend','c-wf-doublecast'].includes(id)){aim=a.player.pos;targetId='player';}
    const r=field.performFieldGesture(glyph(id),targetId,aim,{drawn:true,quality:1});
    a.steps.push({action:id,ok:r.ok,message:r.message,turn:run.data.field.elapsedSeconds/30,damage:100-a.target.properties.integrity,mp:run.data.mp,guard:a.player.properties.guard??0,poison:a.target.properties['status:poison']??0,burn:a.target.properties['status:burn']??0});
    return r;
  }
  function wait(a){field.advanceFieldTime(30);a.steps.push({action:'wait',turn:run.data.field.elapsedSeconds/30,damage:100-a.target.properties.integrity,mp:run.data.mp});}
  function equip(id,g,level=run.data.level){run.data.level=level;const c=run.data.collection.find(c=>c.id===id);assert(c,'card must already belong to the starting collection');assert.equal(skills.equipFieldSkill(run.data,g,c.instanceId),undefined);}
  function finish(a,name){economy.push({name,turns:run.data.field.elapsedSeconds/30,damage:100-a.target.properties.integrity,mp:run.data.mp,steps:a.steps});}

  let a=arena();assert(act(a,'strike').ok);assert(act(a,'strike').ok);assert.equal(100-a.target.properties.integrity,14);finish(a,'two basic strikes');
  a=arena();assert(act(a,'c-defend').ok);assert.equal(a.player.properties.guard,6);assert(act(a,'c-human-riposte').ok);assert.equal(100-a.target.properties.integrity,18);assert.equal(a.player.properties.guard,0);finish(a,'Lv1 guard then counter');
  a=arena();let before=JSON.stringify({mp:run.data.mp,time:run.data.field.elapsedSeconds,ready:run.data.field.skills.readyAt});
  assert(!act(a,'c-human-riposte').ok);assert.equal(JSON.stringify({mp:run.data.mp,time:run.data.field.elapsedSeconds,ready:run.data.field.skills.readyAt}),before);
  assert(act(a,'c-defend').ok);engine.influenceEntity(a.world,a.player,'force',3/(a.player.properties.maxHp??100)*100,a.target.id);assert(Math.abs(a.player.properties.guard-3)<1e-8);
  assert(act(a,'c-human-riposte').ok);assert.equal(100-a.target.properties.integrity,9);assert.equal(a.player.properties.guard,0);
  a=arena();assert(act(a,'c-defend').ok);engine.influenceEntity(a.world,a.player,'force',20/(a.player.properties.maxHp??100)*100,a.target.id);assert.equal(a.player.properties.guard,0);assert(!act(a,'c-human-riposte').ok);
  results.push('Human retained guard becomes one consumed 18-damage counter; partial block reduces it to 9 and broken guard cannot counter');

  a=arena('moth',{x:4,y:3});assert(act(a,'c-moth-snipe').ok);assert.equal(a.target.properties.integrity,100);wait(a);assert.equal(100-a.target.properties.integrity,21);finish(a,'Lv1 slow arrow through impact');
  a=arena('moth',{x:4,y:5});assert(act(a,'c-moth-flit',a.player.pos,'player').ok);assert.equal(Math.abs(a.player.pos.x-a.target.pos.x)+Math.abs(a.player.pos.y-a.target.pos.y),3);assert(act(a,'c-moth-snipe').ok);wait(a);assert.equal(100-a.target.properties.integrity,21);finish(a,'Lv1 reposition then slow arrow');
  a=arena('moth',{x:4,y:3});assert(act(a,'c-moth-snipe').ok);assert(act(a,'left',a.player.pos,'player').ok);assert(!run.data.field.skills.pending);assert.equal(a.target.properties.integrity,100);assert.equal(run.data.mp,3);assert(skills.skillRemaining(run.data,run.data.collection.find(c=>c.id==='c-moth-snipe'))>0);
  a=arena('moth',{x:4,y:3});assert(act(a,'c-moth-snipe').ok);engine.influenceEntity(a.world,a.player,'force',10,a.target.id);skills.tickFieldSkills(run.data,a.world);assert(!run.data.field.skills.pending);assert.equal(a.target.properties.integrity,100);assert.equal(run.data.mp,2);
  a=arena('moth',{x:4,y:2});assert(act(a,'c-moth-snipe',{x:4,y:3}).ok,'slow aimed magic may lead an empty next-move cell');
  assert.equal(a.target.properties.integrity,100);assert.equal(run.data.mp,2);
  assert(engine.resolveInteraction(a.world,a.target.id,a.target.id,{id:'test-next-move',label:'move',description:'',duration:0,reach:1,effects:[{kind:'relocate',pos:{x:4,y:3}}]}).ok);
  wait(a);assert.equal(100-a.target.properties.integrity,21);
  a=arena('moth',{x:4,y:3});a.target.creature={rank:'boss',definitionId:'bs-arc-dun',engaged:false,maxHp:100,attack:0,range:1,reward:{gold:0,shards:0}};
  const arrow=run.data.collection.find(c=>c.id==='c-moth-snipe');
  skills.resolveFieldSkill(run.data,a.world,arrow,[{pos:{...a.target.pos},multiplier:1.5}],1,1);
  assert.equal(a.target.properties.integrity,100,'an unengaged boss entering a prepared cell cannot bypass its encounter');
  results.push('Moth actual starter pair creates distance then a 21-damage ranged shot; movement or HP damage cancels it without refund');

  a=arena('whitefang',{x:3,y:5});assert(act(a,'c-wf-doublecast').ok);assert(act(a,'c-wf-afterimage').ok);wait(a);assert.equal(100-a.target.properties.integrity,26);finish(a,'Lv1 doublecast and afterimage');
  a=arena('whitefang',{x:3,y:5});assert(act(a,'c-wf-doublecast').ok);assert(act(a,'c-wf-afterimage').ok);a.target.pos={x:1,y:1};wait(a);assert.equal(100-a.target.properties.integrity,10);assert.equal(run.data.mp,2);
  results.push('Whitefang keeps the already working 26-damage preparation; moving out of the fixed echo leaves only the initial 10');

  a=arena('slime');assert(act(a,'c-sl-corrode').ok);assert(act(a,'c-sl-spread').ok);assert.equal(100-a.target.properties.integrity,11);finish(a,'Lv1 poison then amplification');
  a=arena('slime');equip('c-sl-chainpop','triangle',3);assert(act(a,'c-sl-corrode').ok);assert(act(a,'c-sl-spread').ok);assert(act(a,'c-sl-chainpop').ok);finish(a,'Lv3 poison amplification burst');
  assert.equal(100-a.target.properties.integrity,24);
  a=arena('slime');before=JSON.stringify({mp:run.data.mp,time:run.data.field.elapsedSeconds,ready:run.data.field.skills.readyAt});
  assert(!act(a,'c-sl-spread').ok);assert.equal(JSON.stringify({mp:run.data.mp,time:run.data.field.elapsedSeconds,ready:run.data.field.skills.readyAt}),before);
  engine.influenceEntity(a.world,a.target,'status:poison',2,'player');const c=run.data.collection.find(c=>c.id==='c-sl-spread');
  assert(skills.castFieldSkill(run.data,a.world,glyph(c.id),a.target.pos).ok);syncPlayerFromWorld(run.data,a.world);engine.influenceEntity(a.world,a.target,'status:poison',-2,'player');wait(a);assert.equal(a.target.properties.integrity,100);assert.equal(run.data.mp,2);
  results.push('Slime amplification requires an applied mark, rewards retained stacks, and can fail after paying if its mark disappears');

  a=arena('sminthus',{x:4,y:2});assert(act(a,'c-smi-firetrap',{x:4,y:4}).ok);assert(act(a,'c-smi-hook').ok);wait(a);wait(a);wait(a);finish(a,'Lv1 fire installation and hook through burn decay');
  assert.equal(100-a.target.properties.integrity,13);
  a=arena('sminthus',{x:4,y:2});equip('c-smi-bomb','circle',5);assert(act(a,'c-smi-bomb',{x:4,y:4}).ok);assert(act(a,'c-smi-hook').ok);assert.equal(100-a.target.properties.integrity,27);finish(a,'Lv5 rare bomb and hook');
  a=arena('sminthus',{x:4,y:2});assert(act(a,'c-smi-firetrap',{x:4,y:4}).ok);for(let i=0;i<4;i++)wait(a);
  assert.equal(a.target.properties.integrity,100);assert(!Object.values(a.world.entities).some(e=>e.tags.includes('casting-trace')));
  results.push('Sminthus starts with the complete installation/lure pair; rare 4-stroke bomb stays gated, and unused traces expire without free damage');

  // Applying preparation data must not rewrite the legacy deck/card battle definitions.
  assert.equal(data.cards.get('c-moth-snipe').effects[0].value,9);
  assert.equal(skills.skillEffects(data.cards.get('c-moth-snipe'))[0].value,14);
  assert.equal(data.cards.get('c-human-riposte').effects[0].value,1);
  results.push('Field-specific card overrides preserve the legacy card effect definitions');

  const report={status:'PASS',method:'Actual loader and Pinia field engine; production startup package grant and auto-equip at Lv1. Bounded combat arenas use an immobile 100-HP actor, no enemy AI, zero Color, equipment or gesture growth. Wait actions include slow casts and damage-over-time completion. These are mechanism/reward checks, not natural DPS or clear-rate estimates.',starts,economy,results};
  mkdirSync(join(root,'scratch'),{recursive:true});writeFileSync(join(root,'scratch/starter-combat-regression.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,starts:starts.map(s=>({raceId:s.raceId,slots:s.slots})),economy:economy.map(e=>({name:e.name,turns:e.turns,damage:e.damage,mp:e.mp})),results},null,2));
} finally {Object.assign(globalThis,old);await server.close();}
