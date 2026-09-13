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
  const workshop=await server.ssrLoadModule('/src/systems/skill-workshop.ts');
  const forge=await server.ssrLoadModule('/src/systems/workshop.ts');
  const shop=await server.ssrLoadModule('/src/systems/shop.ts');
  const chaos=await server.ssrLoadModule('/src/systems/chaos.ts');
  const { setRng }=await server.ssrLoadModule('/src/systems/rng.ts');
  const { gestureDefinition }=await server.ssrLoadModule('/src/systems/gesture-catalog.ts');
  const results=[],clone=x=>JSON.parse(JSON.stringify(x));
  let sequence=0;
  function reset(){
    run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:50,maxMp:3,timeLimit:1});
    run.data.level=12; // These fixtures exercise equipped high-level skills; novice gates are covered in test-field-journey.
    field.ensureField(run.data);
    run.data.currentNodeId='n-iluneon-square::player-home';
    run.data.interactionWorld.entities.player.nodeId=run.data.currentNodeId;
    const a=field.ensureField(run.data);
    a.world.entities={player:a.player};a.space.width=9;a.space.height=9;a.space.tiles=Array.from({length:9},()=>Array(9).fill('grass'));a.space.exits=[];
    a.player.pos={x:4,y:4};a.player.colors={};run.data.colors={fire:0,electric:0,earth:0,iron:0,water:0,wind:0,light:0,dark:0};run.data.relics=[];
    a.world.entities.forge={id:'forge',name:'공방',kind:'prop',nodeId:a.space.id,pos:{x:3,y:4},colors:{},stock:{},tags:['service:workshop'],properties:{integrity:100}};
    run.data.timeShards=100;run.data.collection=[];run.data.deck=[];run.data.field.skills={version:2,preparationVersion:1,slots:{},readyAt:{}}; // Current save; migration is tested separately.
    return a;
  }
  function add(extra={}){
    const id='test-'+(++sequence);
    const c={id,instanceId:id+':copy',name:id,rank:'common',source:'event',cost:1,trigger:'manual',effects:[{kind:'damage',value:10}],shape:[{dx:0,dy:0}],targetMode:'aimed',aimRange:3,castSpeed:'fast',...extra};
    run.data.collection.push(c);run.data.deck.push(c);return run.data.collection.at(-1);
  }
  function equip(c,g='corner'){assert.equal(skills.equipFieldSkill(run.data,g,c.instanceId),undefined);}
  function enemy(a,id='enemy',pos={x:4,y:3}){
    a.world.entities[id]={id,name:id,kind:'actor',nodeId:a.space.id,pos,colors:{},stock:{},tags:[],properties:{integrity:100,maxHp:100}};
    return a.world.entities[id];
  }
  function cast(g='corner',pos={x:4,y:3}){return field.performFieldGesture(g,undefined,pos,{drawn:true,quality:1});}
  function stock(n=8){for(let i=0;i<n;i++)run.addItem(data.items.get('i-material-common'));field.ensureField(run.data);}
  function snapshot(){return JSON.stringify({cards:run.data.collection,deck:run.data.deck,items:run.data.items,shards:run.data.timeShards,field:run.data.field});}

  let a=reset();
  const variants=['c-magic-ember','c-magic-ember-short','c-magic-ember-star'].map(id=>data.cards.get(id));
  variants.forEach(c=>assert(c));assert.deepEqual(variants.map(skills.skillStrokes),[3,2,5]);
  assert.equal(gestureDefinition('circle').strokes,4);
  assert(!skills.skillFitsGesture(variants[0],'corner'));assert(skills.skillFitsGesture(variants[1],'corner'));
  assert(!skills.skillFitsGesture(variants[2],'circle'));assert(skills.skillFitsGesture(variants[2],'star'));
  assert.equal(variants[2].shape.length,5,'star variant retains its authored area');
  let c=add(clone(variants[0]));equip(c,'triangle');let e=enemy(a);
  assert(cast('triangle').ok);const remaining=skills.skillRemaining(run.data,c);
  const easier=add(clone(variants[1]));equip(easier);assert(!skills.equippedSkill(run.data,'triangle'));
  assert.equal(skills.skillRemaining(run.data,easier),remaining);assert.equal(cast().ok,false);
  a=reset();c=add({magic:{strokes:5,glyphs:['star']}});const beforeTier=snapshot();
  assert(skills.equipFieldSkill(run.data,'circle',c.instanceId));assert.equal(snapshot(),beforeTier);
  results.push('2/3/4/5 stroke tiers, circle=4, lower-stroke variants, star-only area and family cooldown');

  a=reset();c=add();equip(c);e=enemy(a);
  const material=add({id:'unported-material',effects:[{kind:'random-effect',value:1}]}),otherCopy=add({id:c.id});
  const shards=run.data.timeShards;
  assert.equal(workshop.upgradeSkill(run.data,c.instanceId,[material.instanceId],'power'),undefined);
  assert.equal(c.enhanceLevel,1);assert(!run.data.collection.some(x=>x.instanceId===material.instanceId));assert(!run.data.deck.some(x=>x.instanceId===material.instanceId));
  assert.equal(otherCopy.enhanceLevel,undefined);assert.equal(run.data.timeShards,shards,'no salvage refund');
  assert(cast().ok);assert.equal(e.properties.integrity,89,'+1 produces 11 actual damage');
  results.push('any unused ordinary card is material; exact copy consumed once; other copies unchanged; power changes damage');

  a=reset();c=add({enhanceLevel:3});equip(c);const held=add();equip(held,'angle');const spare=add();
  for(const ids of [[spare.instanceId,spare.instanceId],[spare.instanceId,'missing'],[spare.instanceId,c.instanceId],[spare.instanceId,held.instanceId]]){
    const before=snapshot();assert(workshop.upgradeSkill(run.data,c.instanceId,ids,'power'));assert.equal(snapshot(),before);
  }
  const cursed=add({curse:true});let before=snapshot();assert(workshop.upgradeSkill(run.data,c.instanceId,[spare.instanceId,cursed.instanceId],'power'));assert.equal(snapshot(),before);
  a.player.pos={x:8,y:8};before=snapshot();assert(workshop.upgradeSkill(run.data,c.instanceId,[spare.instanceId,held.instanceId],'power'));assert.equal(snapshot(),before);
  results.push('duplicate, missing, equipped, target-self, cursed and remote material requests reject without partial costs');

  a=reset();c=add({cost:3});equip(c,'triangle');
  for(const path of ['efficiency','recovery','reach']){const m=add();assert.equal(workshop.upgradeSkill(run.data,c.instanceId,[m.instanceId],path),undefined);}
  assert.equal(skills.skillMana(c),2);assert.equal(skills.skillCooldown(c),5);assert.equal(skills.skillReach(c),4);
  assert.equal(run.data.timeShards,85);e=enemy(a,'far',{x:4,y:0});assert(cast('triangle',e.pos).ok);assert.equal(e.properties.integrity,90);
  assert.equal(skills.skillRemaining(run.data,c),5);
  assert(workshop.upgradeQuote(c,'efficiency').reason);
  const pureUtility=add({effects:[{kind:'draw',value:2}]});assert(workshop.upgradeQuote(pureUtility,'power').reason);
  results.push('efficiency, cooldown and range investments affect casts, with independent costs and caps');

  a=reset();c=add();const sibling=add({id:c.id});equip(c);stock();
  assert.equal(workshop.enchantSkill(run.data,c.instanceId,'ember'),undefined);
  assert.equal(c.enchantment,'ember');assert.equal(sibling.enchantment,undefined);
  assert.equal(run.data.items.filter(i=>i.id==='i-material-common').length,6);
  e=enemy(a);assert(cast().ok);assert.equal(e.properties.integrity,88,'damage 10 plus burn 2 on hit');
  assert.equal(e.properties['status:burn'],1);
  field.ensureField(run.data);assert.equal(run.data.items.filter(i=>i.id==='i-material-common').length,6,'world sync does not duplicate consumed material');
  field.advanceFieldTime(60);assert.equal(workshop.enchantSkill(run.data,c.instanceId,'shelter'),undefined);
  assert.equal(c.enchantment,'shelter');e.properties['status:burn']=0;
  assert(cast().ok);assert.equal(e.properties['status:burn'],0,'replacement does not stack');
  assert.equal(a.player.properties.guard,1,'enchant guard is granted before end-turn decay');
  before=snapshot();assert(workshop.enchantSkill(run.data,c.instanceId,'shelter'));assert.equal(snapshot(),before);
  c.enhanceLevel=5;assert(forge.canAwaken(c)===false);
  c.upgradeToId='growth-test-plus';data.cards.set(c.upgradeToId,{...clone(c),id:c.upgradeToId,name:'각성',rank:'rare',instanceId:undefined,magic:undefined});
  const specialty=[...data.items.values()].find(i=>i.category==='specialty');assert(specialty);
  for(let i=0;i<2;i++)run.addItem(specialty);run.addItem(data.items.get('i-material-rare'));
  c.skillUpgrades={recovery:1};assert(forge.awakenCard(c.instanceId));
  c=run.data.collection.find(x=>x.instanceId===c.instanceId);assert.equal(c.enchantment,'shelter');assert.equal(c.skillUpgrades.recovery,1);assert.equal(skills.skillStrokes(c),2);
  run.saveActiveRun();run.$reset();assert(run.loadActiveRun());field.ensureField(run.data);
  c=run.data.collection.find(x=>x.instanceId===c.instanceId);assert.equal(c.enchantment,'shelter');assert.equal(c.skillUpgrades.recovery,1);assert.equal(c.enhanceLevel,5);
  results.push('single-instance enchantment hits, replacement, exact material use, awakening and real save/load preservation');

  a=reset();c=add({enchantment:'ember',effects:[{kind:'damage',value:0}]});equip(c);e=enemy(a);assert(cast().ok);assert.equal(e.properties['status:burn']??0,0);
  a=reset();c=add({enchantment:'ember',effects:[{kind:'damage',value:10},{kind:'block',value:1}]});equip(c);e=enemy(a);e.properties['status:ghost']=3;
  assert(cast().ok);assert.equal(e.properties['status:burn']??0,0);assert.equal(e.properties.integrity,100);
  results.push('zero damage and intangible misses cannot apply on-hit enchantments');

  a=reset();c=add({effects:[{kind:'next-card-double',value:1},{kind:'hand-cost-down',value:2}],targetMode:'self'});equip(c);
  const blast=add({cost:2,effects:[{kind:'damage-top-color',value:1}]});equip(blast,'triangle');
  run.data.colors.fire=10;field.ensureField(run.data);e=enemy(a);assert(cast().ok);
  assert.equal(skills.fieldSkillMana(run.data,blast),1);assert(cast('triangle').ok);
  assert.equal(e.properties.integrity,80,'preparation doubles formula damage too');assert.equal(run.data.field.skills.nextPower,undefined);
  a=reset();c=add({effects:[{kind:'next-card-double',value:1}],targetMode:'self'});equip(c);assert(cast().ok);
  field.advanceFieldTime(150);assert.equal(run.data.field.skills.nextPower,undefined);
  a=reset();c=add({effects:[{kind:'damage-from-hp',value:4,params:{mult:2}}],enhanceLevel:1});equip(c);e=enemy(a);
  run.data.field.skills.nextPower={multiplier:2,expires:99};assert(cast().ok);assert.equal(run.data.hp,46,'preparation never increases health payment');assert(e.properties.integrity<84);
  results.push('next-skill preparation is single-use, expires, boosts formula damage and does not amplify self cost');

  a=reset();c=add({effects:[{kind:'draw',value:2},{kind:'next-turn-energy',value:2}],targetMode:'self'});equip(c);
  const cooling=add();equip(cooling,'angle');run.data.field.skills.readyAt[cooling.id]=6;
  assert(cast().ok);assert.equal(skills.skillRemaining(run.data,cooling),3);assert.equal(skills.skillRemaining(run.data,c),2);assert.equal(run.data.mp,3);
  assert.equal(skills.skillMana({...c,cost:0}),1);assert.equal(skills.skillCooldown({...c,effects:[{kind:'exhaust-self'}]}),8);
  assert.equal(skills.skillCooldown({...c,effects:[{kind:'return-self-to-hand'}]}),1);
  results.push('hand conversion recharges other skills only, restores capped mana and preserves minimum costs/cooldowns');

  a=reset();run.data.gold=1000;const inventory=shop.getOrCreateShopInventory('growth-shop');assert.equal(inventory.cards.length,0);
  inventory.cards.push({cardId:variants[0].id,cardInstanceId:'old-offer',price:1,purchased:false});
  assert.equal(shop.purchaseShopCard('growth-shop',0),false);assert.equal(run.data.gold,1000);assert.equal(shop.getOrCreateShopInventory('growth-shop').cards.length,0);
  const forged=new Set();let seed=17;setRng(()=>{seed=(seed*16807)%2147483647;return seed/2147483647;});
  for(let i=0;i<1200&&forged.size<3;i++)for(const slot of forge.getOrCreateForgeOffer('growth-forge-'+i).cards)if(variants.some(c=>c.id===slot.cardId))forged.add(slot.cardId);
  assert.equal(forged.size,3,'all authored variants occur in real forge offers');
  results.push('new and cached shops stop card sales; all three magic variants remain obtainable from forge offers');

  a=reset();run.data.remainingTime=1;const turns=run.data.visitedNodes.length;
  run.spendWorldTime(301);assert.equal(run.data.ended,false);assert.equal(run.data.visitedNodes.length,turns+301);
  assert(run.performWorldAction({actorId:'player',targetId:'player',actionId:'rest'}).ok);
  const retired=[...data.chaosDefs.values()].find(c=>c.effectKind==='time-limit-mul');assert(retired);
  run.data.activeChaos=[{id:retired.id,intensity:1}];run.data.chaosScore=99;
  assert.equal(chaos.computeChaosScore(run.data.activeChaos),0);assert(!chaos.shopChaos().some(c=>c.id===retired.id));
  run.saveActiveRun();run.$reset();assert(run.loadActiveRun());assert.equal(run.data.remainingTime,0);assert.equal(run.data.chaosScore,0);assert.equal(run.data.ended,false);
  assert(!JSON.stringify(run.data).includes('Infinity'));
  results.push('deadline-free world clock, actions beyond old limit, retired chaos scoring and old-save continuation');
  console.log(JSON.stringify({status:'PASS',scenarios:results.length,results},null,2));
} finally {
  globalThis.window=oldWindow;globalThis.localStorage=oldStorage;globalThis.fetch=oldFetch;await server.close();
}
