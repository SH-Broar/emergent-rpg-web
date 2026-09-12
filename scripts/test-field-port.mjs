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

  const combat=await server.ssrLoadModule('/src/systems/field-combat.ts');
  const status=await server.ssrLoadModule('/src/systems/world/status.ts');
  const geo=await server.ssrLoadModule('/src/systems/field-geography.ts');
  const {NPC_DIALOGUE}=await server.ssrLoadModule('/src/data/npc-dialogue.ts');
  const results=[];
  function arena(id='mr-iluneon-cutpurse',rank='normal'){
    run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:50,maxMp:8,timeLimit:300});
    const {world,space,player}=field.ensureField(run.data);
    world.entities={player};space.width=13;space.height=13;space.tiles=Array.from({length:13},()=>Array(13).fill('grass'));space.exits=[];space.cleared=false;
    player.pos={x:6,y:5};player.colors={};player.properties.hardness=0;
    const def=rank==='boss'?data.bosses.get(id):data.monsters.get(id);
    const enemy=generation.spawnCreature(run.data,world,space,def,0,rank);enemy.pos={x:6,y:6};enemy.creature.angry=true;
    return {world,space,player,enemy,def};
  }
  let a=arena();
  a.enemy.creature.pending=combat.planAttack(a.world,a.enemy,a.player);a.enemy.creature.intent=a.enemy.creature.pending.cells.map(x=>x.pos);
  assert.equal(a.enemy.creature.pending.damage,4);
  const locked=structuredClone(a.enemy.creature.pending.cells);
  field.advanceFieldTime(30);
  assert.equal(run.data.hp,44,'authored center multiplier deals six actual HP');
  const damageFact=a.world.events.findLast(f=>f.targetId==='player'&&f.property==='integrity');
  assert.deepEqual(damageFact.pos,{x:6,y:5});assert.equal(damageFact.before-damageFact.after,12);
  field.ensureField(run.data);assert.equal(run.data.hp,44,'damage survives ensure/sync');
  results.push('authored damage, tile multiplier, HP synchronization and positioned feedback');

  a=arena();a.enemy.creature.pending=combat.planAttack(a.world,a.enemy,a.player);a.enemy.creature.intent=locked.map(x=>x.pos);
  field.stepField({x:6,y:4});assert.equal(run.data.hp,50);
  assert(a.world.events.some(f=>f.message==='빗나감'));
  results.push('leaving locked cells evades the attack; attack does not retarget');

  a=arena();a.player.properties.guard=6;a.enemy.creature.pending=combat.planAttack(a.world,a.enemy,a.player);
  field.advanceFieldTime(30);assert.equal(run.data.hp,50);assert.equal(a.player.properties.guard,0);
  a=arena();a.player.properties['status:vulnerable']=1;a.enemy.creature.pending=combat.planAttack(a.world,a.enemy,a.player);
  field.advanceFieldTime(30);assert.equal(run.data.hp,41);assert.equal(status.status(a.player,'vulnerable'),0);
  results.push('guard absorbs the complete incoming hit and one-turn vulnerability remains active for the hit');

  a=arena();delete a.world.entities[a.enemy.id];run.data.mp=0;
  field.advanceFieldTime(30);assert.equal(run.data.mp,0);assert.equal(run.data.maxMp,3);
  const phase=JSON.parse(JSON.stringify(run.data.field));assert.equal(phase.manaStep,1);run.data.field=phase;
  field.advanceFieldTime(30);assert.equal(run.data.mp,1);field.advanceFieldTime(300);assert.equal(run.data.mp,3);
  const before=run.data.field.elapsedSeconds;
  assert(field.performFieldGesture('dash',undefined,{x:6,y:3}).ok);assert.deepEqual(a.player.pos,{x:6,y:3});assert.equal(run.data.mp,2);assert.equal(run.data.field.elapsedSeconds,before+30);
  const mp=run.data.mp;a.space.tiles[2][6]='wall';assert.equal(field.performFieldGesture('dash',undefined,{x:6,y:1}).ok,false);assert.equal(run.data.mp,mp);
  a.player.properties['status:airborne']=2;assert(field.performFieldGesture('dash',undefined,{x:6,y:1}).ok);assert.equal(status.status(a.player,'airborne'),0);
  a.player.properties['status:anchored']=2;assert.equal(field.performFieldGesture('dash',undefined,{x:7,y:1}).ok,false);
  results.push('three mana, one recharge per two turns across reload, transactional dash and airborne landing');

  a=arena();delete a.world.entities[a.enemy.id];a.player.properties['status:poison']=3;run.data.hp=40;
  field.advanceFieldTime(30);assert.equal(run.data.hp,37);assert.equal(status.status(a.player,'poison'),2);
  a.player.properties['status:burn']=4;a.player.properties['status:poison']=0;field.advanceFieldTime(30);assert.equal(run.data.hp,33);assert.equal(status.status(a.player,'burn'),2);
  a.player.properties['status:burn']=0;a.player.properties['status:sap']=2;field.advanceFieldTime(60);assert.equal(run.data.hp,29);assert.equal(status.status(a.player,'sap'),2);
  a.player.properties['status:sap']=0;a.player.properties['status:regen']=2;field.advanceFieldTime(30);assert.equal(run.data.hp,31);
  a.player.properties['status:feral-heavy']=1;engine.influenceEntity(a.world,a.player,'integrity',20);assert(Math.abs(a.player.properties.integrity-62)<1e-8);
  results.push('poison, burn, sap, regeneration and heavy-feral healing restriction');

  a=arena();delete a.world.entities[a.enemy.id];
  combat.applyStatus(a.world,a.player,'drowsy:2');assert.equal(status.status(a.player,'sleep'),1);
  const p={...a.player.pos};assert.equal(field.stepField({x:6,y:4}).ok,false);assert.deepEqual(a.player.pos,p);assert.equal(status.status(a.player,'sleep'),0);
  combat.applyStatus(a.world,a.player,'paralyze:1');assert.equal(field.stepField({x:6,y:4}).ok,false);assert.equal(status.status(a.player,'paralyze'),0);
  a.player.properties['status:resolve']=2;combat.applyStatus(a.world,a.player,'poison:3');assert.equal(status.status(a.player,'poison'),2);
  a.player.properties['status:resolve']=0;combat.applyStatus(a.world,a.player,'feral:10');assert.equal(status.status(a.player,'feral-heavy'),1);
  combat.clearCombatStatuses(a.player,true);a.player.properties['status:possession']=2;combat.afterMovement(a.player);assert.equal(status.status(a.player,'possession'),1);
  a.player.properties['status:imprint']=5;combat.tickStatuses(a.world,a.player,3);assert.equal(status.status(a.player,'imprint'),4);
  a.player.properties['status:imprint']=6;combat.tickStatuses(a.world,a.player,6);assert.equal(status.status(a.player,'imprint'),6);
  results.push('sleep, paralysis, resolve, feral transition, possession and permanent imprint');

  a=arena();a.player.properties['status:ghost']=2;assert.equal(combat.hit(a.world,a.enemy,a.player,10,true),0);
  a.enemy.properties['status:ghost']=2;assert.equal(combat.hit(a.world,a.enemy,a.player,10,false),0);
  a.enemy.properties['status:ghost']=0;assert.equal(combat.hit(a.world,a.enemy,a.player,10,false),10);
  a.player.properties['status:thorns']=3;const h=a.enemy.properties.integrity;combat.hit(a.world,a.enemy,a.player,1,false);assert(a.enemy.properties.integrity<h);
  assert.equal(status.outgoingDamage({...a.player,properties:{'status:weakness':1}},20),15);
  assert.equal(status.outgoingDamage({...a.player,properties:{'status:brainwash':1}},20),13);
  assert.equal(status.outgoingDamage({...a.player,properties:{'status:slime':3}},20),17);
  results.push('ghost range rules, thorns and outgoing damage modifiers');

  let patternCount=0,statusCount=0;
  for(const def of data.monsters.values())for(const [i,atk]of (def.gridBehavior??[]).entries()){
    a=arena(def.id,def.tier??'normal');a.enemy.properties.attacksMade=i;
    const off=atk.shape.find(p=>p.dx||p.dy);if(!off)continue;
    a.player.pos={x:6+off.dx,y:6+off.dy};
    const plan=combat.planAttack(a.world,a.enemy,a.player);
    assert(plan,def.id+' '+i);assert.equal(plan.damage,atk.damage??def.attack);assert.equal(plan.status,atk.applyStatus);
    assert.equal(plan.remaining,atk.castSpeed==='slow'?2:1);assert(plan.cells.some(p=>spatial.distance(p.pos,a.player.pos)===0));
    patternCount++;if(plan.status)statusCount++;
  }
  results.push(patternCount+' authored monster attacks retain damage, shape, cast speed and '+statusCount+' status tokens');

  for(const boss of data.bosses.values()){
    a=arena(boss.id,'boss');assert(combat.beginBossEncounter(run.data,a.enemy));const t=run.data.field.elapsedSeconds;
    field.advanceFieldTime(60);assert.equal(run.data.field.elapsedSeconds,t);
    combat.resolveFieldEncounter(run.data,false);assert(!a.enemy.creature.engaged);
    a.enemy.creature.challengeAfter=0;combat.beginBossEncounter(run.data,a.enemy);combat.resolveFieldEncounter(run.data,true);
    assert(a.enemy.creature.engaged);
    for(const phase of boss.phases){
      a.enemy.properties.integrity=phase.startsAtHpRatio*100;
      for(let i=0;i<(phase.gridBehavior?.length??1);i++){
        a.enemy.properties.attacksMade=i;const off=phase.gridBehavior?.[i]?.shape.find(p=>p.dx||p.dy)??{dx:0,dy:-1};
        a.player.pos={x:6+off.dx,y:6+off.dy};const plan=combat.planAttack(a.world,a.enemy,a.player);assert(plan);
        assert(plan.cells.length>=3,'boss area expands beyond one adjacent cell');
      }
    }
    a.player.pos={x:6,y:2};const old={...a.enemy.pos};combat.moveCreature(a.world,a.enemy,a.player.pos);assert.notDeepEqual(a.enemy.pos,old,'fixed AI still moves');
  }
  results.push(data.bosses.size+' runtime bosses: introduction, decline/rechallenge, phases, large areas and movement');

  const map=generation.fieldMap(run.data);let links=0;
  for(const n of map.nodes)for(const id of n.neighbors){
    const to=map.nodes.find(x=>x.id===id);if(!to)continue;
    const dx=to.position.x-n.position.x,dy=to.position.y-n.position.y;
    if(!dx&&!dy)continue;
    const x={width:6,height:6},y={width:10,height:10};
    const out=geo.boundaryFor(x,dx,dy,[]),back=geo.boundaryFor(y,-dx,-dy,[]);
    const outward=geo.inward(x,out),inward=geo.inward(y,back);
    assert.equal(outward.x+inward.x,0);assert.equal(outward.y+inward.y,0);links++;
  }
  results.push(links+' authored directional links preserve entry orientation across different map sizes');
  assert.equal(Object.keys(NPC_DIALOGUE).length,data.npcs.size);
  for(const n of data.npcs.values()){assert(NPC_DIALOGUE[n.id]);assert.equal(NPC_DIALOGUE[n.id].topics.length,2);}
  assert([...data.events.keys()].every(id=>!id.includes('.var.')));
  assert([...data.events.values()].every(e=>e.name!==e.id));
  results.push('all 57 NPCs have spoken topics; event variations are not duplicate standalone events');

  a=arena();delete a.world.entities[a.enemy.id];
  run.data.possessed=3;run.data.feralHeavy=1;field.ensureField(run.data);
  assert.equal(status.status(a.player,'possession'),3);assert.equal(status.status(a.player,'feral-heavy'),1);
  field.stepField({x:6,y:4});assert.equal(run.data.possessed,2);
  field.ensureField(run.data);assert.equal(status.status(a.player,'possession'),2);
  run.data.feralHeavy=0;field.ensureField(run.data);assert.equal(status.status(a.player,'feral-heavy'),0,'village cleansing reaches field properties');
  field.performFieldGesture('tap','player',a.player.pos);assert.equal(run.data.possessed,0);assert.equal(status.status(a.player,'possession'),0);
  results.push('legacy persistent statuses survive migration and movement, and clear through village services or rest');

  a=arena();a.enemy.properties['status:thorns']=3;a.enemy.properties['status:paralyze']=1;
  const hpBefore=run.data.hp;
  field.performFieldGesture('strike',a.enemy.id,a.enemy.pos);
  assert.equal(run.data.hp,hpBefore-3,'gesture recoil uses the same reducer as monster recoil');
  results.push('player gestures also trigger thorns, without recursive reflection');

  a=arena();let roadVisits=0;
  for(const node of map.nodes){
    const area=generation.ensureFieldSpace(run.data,a.world,node.id);
    for(const exit of area.exits.filter(e=>e.roads>0)){
      let current=area,route=exit;
      for(let i=0;i<=exit.roads;i++){
        run.data.currentNodeId=current.id;a.player.nodeId=current.id;a.player.pos={...route.pos};
        const outward=geo.inward(current,route.pos);
        const travel=field.travelField(route.to);
        if(!travel.ok&&route.requirement){assert.equal(travel.message,'닫힌 길.');break;}
        assert(travel.ok,current.id+' -> '+route.to+': '+travel.message);
        const next=a.world.spaces[run.data.currentNodeId],back=next.exits.find(e=>e.to===current.id);
        assert(back);
        const arrival=geo.inward(next,back.pos);
        assert.equal(outward.x+arrival.x,0);assert.equal(outward.y+arrival.y,0);
        assert.ok(a.player.properties.facingX===arrival.x);assert.ok(a.player.properties.facingY===arrival.y);
        assert(spatial.distance(a.player.pos,back.pos)>0);
        if(!next.road)break;
        route=next.exits.find(e=>e.to!==current.id);current=next;roadVisits++;
      }
    }
  }
  assert(roadVisits>0);results.push(roadVisits+' actual intermediate-road transitions retain travel direction');

  for(const event of data.events.values())for(const child of [...(event.choices??[]),...(event.variations??[])])for(const effect of child.effects??[]){
    if(effect.grantCardId)assert(data.cards.has(effect.grantCardId),effect.grantCardId);
    if(effect.grantRelicId)assert(data.relics.has(effect.grantRelicId),effect.grantRelicId);
    if(effect.grantClueId)assert(data.clues.has(effect.grantClueId),effect.grantClueId);
  }
  const {validateData}=await import('./validate-core.mjs');
  const invalid=validateData(join(root,'public/data'),relative=>readFileSync(join(root,'public/data',relative),'utf8')+(relative==='events/act-1-region-events.txt'?'\n[event.ev-iluneon-clockchime.var.1]\ngrant_card = c-port-test-missing\n':''));
  assert(invalid.diagnostics.some(d=>d.severity==='error'&&d.message.includes('c-port-test-missing')),'variation references must remain validated');
  results.push('every runtime event reward resolves, and a broken variation reward is rejected');
  console.log(JSON.stringify({status:'PASS',scenarios:results},null,2));

} finally {await server.close();globalThis.window=oldWindow;globalThis.localStorage=oldStorage;globalThis.fetch=oldFetch;}
