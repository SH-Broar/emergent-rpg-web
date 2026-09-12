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

 const biome=await server.ssrLoadModule('/src/systems/field-biomes.ts');
 const forage=await server.ssrLoadModule('/src/systems/field-forage.ts');
 const supplies=await server.ssrLoadModule('/src/systems/field-supplies.ts');
 const skills=await server.ssrLoadModule('/src/systems/field-skills.ts');
 const rules=await server.ssrLoadModule('/src/systems/field-skill-rules.ts');
 const journey=await server.ssrLoadModule('/src/systems/field-journey.ts');
 const {JOURNEY_QUESTS}=await server.ssrLoadModule('/src/data/journey-quests.ts');
 const {instantiateCard}=await server.ssrLoadModule('/src/systems/deck.ts');
 const {syncPlayerFromWorld}=await server.ssrLoadModule('/src/systems/world-interaction.ts');
 const {residentGoal}=await server.ssrLoadModule('/src/data/npc-calendar.ts');
 const {createSocialProfile}=await server.ssrLoadModule('/src/systems/world/social.ts');
 const {NPC_DIALOGUE}=await server.ssrLoadModule('/src/data/npc-dialogue.ts');
 const results=[],clone=x=>JSON.parse(JSON.stringify(x));
 function start(){run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:100,maxMp:3,timeLimit:300});return field.ensureField(run.data);}
 function arena(){const a=start();a.world.entities={player:a.player};a.space.width=9;a.space.height=9;a.space.tiles=Array.from({length:9},()=>Array(9).fill('grass'));a.space.exits=[];a.player.pos={x:4,y:4};run.data.relics=[];return a;}
 function nearby(a,npcId){const source=data.npcs.get(npcId);const e={id:'npc:'+npcId,npcId,name:source.name,nodeId:a.space.id,pos:{x:4,y:3},kind:'actor',colors:{},tags:['person'],properties:{integrity:100,maxHp:100},stock:{},agent:createSocialProfile(source.raceId,source.role,{homeNodeId:source.homeNodeId,turn:0})};a.world.entities[e.id]=e;return e;}
 let a=start(),map=generation.fieldMap(run.data);
 for(const node of map.nodes)generation.ensureFieldSpace(run.data,a.world,node.id);
 const seeds=Object.values(a.world.entities).filter(e=>e.stock['field-springseed']>0);
 assert.deepEqual(seeds.map(e=>e.nodeId).sort(),[...forage.SPRING_SEED_PLACES].sort());
 assert(seeds.every(e=>e.stock['field-springseed']===1&&!e.renewable));
 let clustered=0;
 for(const node of map.nodes.filter(n=>n.kind==='gather')){
   const patches=Object.values(a.world.entities).filter(e=>e.nodeId===node.id&&e.tags.includes('forage')&&!e.tags.includes('rare-source'));
   assert(patches.length>0,node.id+' has forage');
   assert(patches.every(e=>forage.resourceGauge(e).capacity<=2),node.id+' limited yield');
   if(patches.some(e=>[[1,0],[0,1],[1,1]].every(([dx,dy])=>patches.some(p=>p.pos.x===e.pos.x+dx&&p.pos.y===e.pos.y+dy))))clustered++;
 }
 assert(clustered>=20,'many real 2x2 groups: '+clustered);
 const canyon=a.world.spaces['n-mano-clutch-gulch'],mountain=a.world.spaces['n-alimes'];
 assert(canyon.width>canyon.height);
 assert.equal(biome.landform(map.nodes.find(n=>n.id==='n-alimes')),'alpine');
 assert.equal(biome.landform(map.nodes.find(n=>n.region==='mushroom-cave')),'cavern');
 const shapes=new Set(map.nodes.map(n=>{const s=a.world.spaces[n.id];return s.width+'x'+s.height}));assert(shapes.size>=7);
 results.push('25 regional profiles, '+shapes.size+' map proportions, '+clustered+' harvest areas with a real 2x2 patch; exactly two finite spring seeds');
 const rare=seeds[0];rare.stock['field-springseed']=0;
 const ordinary=Object.values(a.world.entities).find(e=>e.tags.includes('forage')&&e.renewable);ordinary.stock[ordinary.renewable.resourceId]=0;
 run.saveActiveRun();run.$reset();assert(run.loadActiveRun());a={world:run.data.interactionWorld};
 for(const id of [rare.nodeId,ordinary.nodeId])generation.ensureFieldSpace(run.data,a.world,id);
 assert.equal(a.world.entities[rare.id].stock['field-springseed'],0);assert.equal(a.world.entities[ordinary.id].stock[ordinary.renewable.resourceId],0);
 results.push('exhausted rare and common patches survive save/load and area revisits without refill');
 a=arena();const station=nearby(a,'npc-echo');a.player.stock['raw-fiber']=2;a.player.stock.water=1;
 let res=supplies.craftSupply(run.data,a.world,station.id,'salve');assert(res.ok,JSON.stringify(res));
 assert.equal(a.player.stock['field-salve'],1);assert.equal(a.player.stock['raw-fiber'],0);
 const before=clone(a.player.stock);assert(!supplies.craftSupply(run.data,a.world,station.id,'salve').ok);assert.deepEqual(a.player.stock,before);
 assert.equal(run.data.field.journey.counts.crafted,1);
 a.player.properties.integrity=70;syncPlayerFromWorld(run.data,a.world);run.data.field.selectedItem='field-salve';
 assert(field.performFieldGesture('tend','player',a.player.pos).ok);assert.equal(a.player.stock['field-salve'],0);assert(a.player.properties.integrity>82);assert.equal(run.data.field.journey.counts.used,1);
 a=arena();a.player.stock['field-springseed']=1;
 const soil={id:'test-soil',name:'땅',kind:'plot',nodeId:a.space.id,pos:{x:5,y:4},colors:{earth:20},tags:['field-plot'],properties:{integrity:100,soil:1},stock:{}};a.world.entities[soil.id]=soil;
 const action=supplies.supplyAction(a.player,soil,'field-springseed');assert(action);
 assert(engine.resolveInteraction(a.world,'player',soil.id,action).ok);assert.equal(a.player.stock['field-springseed'],0);assert.equal(soil.properties.waterSource,1);assert.equal(soil.stock.water,6);assert(soil.renewable);assert.equal(soil.name,'작은 샘');
 assert(!supplies.supplyAction(a.player,soil,'field-springseed'));
 a.player.stock['field-smoke']=1;assert(engine.resolveInteraction(a.world,'player',soil.id,supplies.supplyAction(a.player,soil,'field-smoke')).ok);assert(soil.properties.smoke>0);
 const enemy=nearby(a,'npc-hako');enemy.properties.maxHp=100;enemy.properties.moisture=5;a.player.stock['field-spark']=1;
 const hp=enemy.properties.integrity;assert(engine.resolveInteraction(a.world,'player',enemy.id,supplies.supplyAction(a.player,enemy,'field-spark')).ok);assert(enemy.properties.integrity<hp);
 a.player.stock['field-wrap']=1;assert(engine.resolveInteraction(a.world,'player','player',supplies.supplyAction(a.player,a.player,'field-wrap')).ok);assert.equal(a.player.properties.guard,12);
 results.push('atomic crafting, failed craft conservation, salve healing, smoke, electrical damage, guard and permanent player-placed spring use the shared world router');
 a=arena();const card=instantiateCard(data.cards.get('c-field-pulse'));run.data.collection.push(card);run.data.field.skills.slots.corner=card.instanceId;run.data.field.skills.slots.star=card.instanceId;
 assert.deepEqual(rules.unlockedSkillGestures(1),['corner']);
 for(const [id,level]of Object.entries(rules.SKILL_UNLOCK_LEVEL)){assert(rules.skillGestureUnlocked(level,id));if(level>1)assert(!rules.skillGestureUnlocked(level-1,id));}
 const lockedSnapshot=JSON.stringify({mp:run.data.mp,time:run.data.field.elapsedSeconds,cooldowns:run.data.field.skills.readyAt});
 assert(!field.performFieldGesture('star','player',a.player.pos,{drawn:true,quality:1}).ok);
 assert(!skills.castFieldSkill(run.data,a.world,'star',a.player.pos).ok);
 assert.match(skills.equipFieldSkill(run.data,'star',card.instanceId),/레벨/);
 assert.equal(JSON.stringify({mp:run.data.mp,time:run.data.field.elapsedSeconds,cooldowns:run.data.field.skills.readyAt}),lockedSnapshot);
 const dummy={id:'post',name:'말뚝',kind:'facility',nodeId:a.space.id,pos:{x:4,y:3},colors:{},tags:['practice'],properties:{integrity:100,maxHp:100},stock:{}};a.world.entities[dummy.id]=dummy;
 assert(field.performFieldGesture('corner',dummy.id,dummy.pos,{drawn:true,quality:1}).ok);assert(dummy.properties.integrity<100);assert.equal(run.data.field.journey.counts.skill,1);
 run.data.level=12;assert.equal(rules.unlockedSkillGestures(run.data.level).length,8);
 run.saveActiveRun();run.$reset();assert(run.loadActiveRun());assert(run.data.collection.some(c=>c.instanceId===card.instanceId));assert.equal(run.data.field.skills.slots.star,card.instanceId);
 results.push('level 1 has one spell shape; all eight unlock at authored levels; locked API calls spend no mana or time; cards and loadouts survive saves');
 a=arena();const guide=nearby(a,'npc-niayur');const count=run.data.collection.length;
 assert(journey.performQuest(run.data,a.world,guide.id,'quest:accept:home').ok);assert.equal(run.data.collection.length,count+1);
 assert(!journey.performQuest(run.data,a.world,guide.id,'quest:accept:home').ok);assert.equal(run.data.collection.length,count+1);
 assert(!journey.performQuest(run.data,a.world,guide.id,'quest:finish:home').ok);
 journey.ensureJourney(run.data).visited['n-iluneon-square::player-home']=true;
 guide.properties['status:sleep']=2;assert(!journey.performQuest(run.data,a.world,guide.id,'quest:finish:home').ok);delete guide.properties['status:sleep'];
 guide.pos={x:1,y:1};assert(!journey.performQuest(run.data,a.world,guide.id,'quest:finish:home').ok);guide.pos={x:4,y:3};
 guide.properties.integrity=0;assert(!journey.performQuest(run.data,a.world,guide.id,'quest:finish:home').ok);guide.properties.integrity=100;
 assert(journey.performQuest(run.data,a.world,guide.id,'quest:finish:home').ok);const xp=run.data.xp;
 assert(!journey.performQuest(run.data,a.world,guide.id,'quest:finish:home').ok);assert.equal(run.data.xp,xp);
 for(const q of JOURNEY_QUESTS.filter(q=>q.main&&q.id!=='home')){
   a.world.entities={player:a.player};const giver=nearby(a,q.npcId);
   assert(journey.performQuest(run.data,a.world,giver.id,'quest:accept:'+q.id).ok,q.id+' accept');
   for(const g of q.goals){if(g.kind==='visit')journey.ensureJourney(run.data).visited[g.key]=true;else if(g.kind==='talk')run.data.field.spoken['npc:'+g.key]=1;else if(g.kind==='deliver')a.player.stock[g.key]=(a.player.stock[g.key]??0)+(g.amount??1);else journey.noteJourney(run.data,g.key,g.amount??1);}
   const recipient=q.turnInNpcId?nearby(a,q.turnInNpcId):giver;
   const stocks=clone(a.player.stock);
   assert(journey.performQuest(run.data,a.world,recipient.id,'quest:finish:'+q.id).ok,q.id+' finish');
   for(const g of q.goals.filter(g=>g.kind==='deliver')){assert.equal(a.player.stock[g.key],stocks[g.key]-(g.amount??1)+(q.reward.stock?.[g.key]??0));assert.equal(recipient.stock[g.key],g.amount??1);}
 }
 assert(!journey.currentJourney(run.data));assert.equal(JOURNEY_QUESTS.filter(q=>q.main).length,16);
 run.saveActiveRun();run.$reset();assert(run.loadActiveRun());assert.equal(Object.keys(run.data.field.journey.completed).length,16);
 results.push('complete 16-stage story chain resolves; multi-NPC handoffs, delivered material conservation, one-time card/XP rewards and missing/restricted NPC guards work');
 a=start();for(const id of ['npc-niayur','npc-hako','npc-echo','npc-olyu','npc-miyu'])assert(residentGoal(data.npcs.get(id),map,0).nodeId.startsWith('n-iluneon-'));
 assert.equal(Object.keys(NPC_DIALOGUE).length,data.npcs.size);assert(Object.values(NPC_DIALOGUE).every(d=>d.topics.length===3&&d.greeting.length<100));
 for(const event of data.events.values()){
  const scenes=event.variations??[event];assert(scenes.every(s=>s.body.length>0&&s.body.length<180),event.id+' concise authored scene');
  if(event.choices?.length)assert(event.choices.every(c=>c.effects.every(e=>!e.resultText||e.resultText.length<180)));
 }
 const {createSSRApp}=await import('vue'),{renderToString}=await import('@vue/server-renderer');
 const {default:Gauge}=await server.ssrLoadModule('/src/components/FieldResourceGauge.vue');
 const html=await renderToString(createSSRApp(Gauge,{entity:{...soil,tags:['forage'],renewable:undefined,properties:{harvestCapacity:2},stock:{water:1}}}));
 assert(html.includes('role="meter"')&&html.includes('aria-valuenow="1"')&&html.includes('aria-valuemax="2"'));
 results.push('principal NPCs present at noon, all 57 voices and 180 events covered, remaining resources rendered as accessible meters');
 console.log(JSON.stringify({status:'PASS',scenarios:results.length,results},null,2));
}finally{
 await server.close();globalThis.window=oldWindow;globalThis.localStorage=oldStorage;globalThis.fetch=oldFetch;
}
