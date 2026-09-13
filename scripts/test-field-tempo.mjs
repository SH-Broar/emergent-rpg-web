import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root=fileURLToPath(new URL('../',import.meta.url));
const saved=new Map(),old={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
globalThis.window={setTimeout:()=>0};
globalThis.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
globalThis.fetch=async url=>new Response(readFileSync(join(root,'public',String(url).replace(/^\//,'')),'utf8'));
const server=await createServer({root,server:{middlewareMode:true},appType:'custom'});
try {
  setActivePinia(createPinia());
  const {useRunStore}=await server.ssrLoadModule('/src/stores/run.ts');
  const {useDataStore}=await server.ssrLoadModule('/src/stores/data.ts');
  const {loadAllData}=await server.ssrLoadModule('/src/data/loader.ts');
  const field=await server.ssrLoadModule('/src/systems/field-simulation.ts');
  const generation=await server.ssrLoadModule('/src/systems/field-generation.ts');
  const combat=await server.ssrLoadModule('/src/systems/field-combat.ts');
  const ai=await server.ssrLoadModule('/src/systems/field-ai.ts');
  const skills=await server.ssrLoadModule('/src/systems/field-skills.ts');
  const {displayedHp}=await server.ssrLoadModule('/src/systems/world/engine.ts');
  const {status}=await server.ssrLoadModule('/src/systems/world/status.ts');
  const data=useDataStore();data.data=await loadAllData('/');
  const timeline=[...data.timelines.values()].find(t=>data.nodeMaps.get(t.nodeMapId)?.nodes.some(n=>n.id==='n-iluneon-square'));
  const run=useRunStore(),clone=x=>JSON.parse(JSON.stringify(x)),results=[];
  function arena(speed='slow',shape=[{dx:0,dy:1}]){
    run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:100,maxMp:3,timeLimit:0});
    const a=field.ensureField(run.data);a.world.entities={player:a.player};a.space.width=9;a.space.height=9;
    a.space.tiles=Array.from({length:9},()=>Array(9).fill('grass'));a.space.exits=[];a.player.pos={x:4,y:4};
    a.player.colors={};a.player.properties.hardness=0;run.data.relics=[];run.data.colors={fire:0,electric:0,earth:0,iron:0,water:0,wind:0,light:0,dark:0};
    const definition={...clone(data.monsters.get('mr-iluneon-cutpurse')),id:'test-opening',hp:100,defense:0,attack:8,gridBehavior:[{name:'큰 휘두르기',shape,damage:8,castSpeed:speed}]};
    data.monsters.set(definition.id,definition);
    const enemy=generation.spawnCreature(run.data,a.world,a.space,definition,0,'normal');
    enemy.pos={x:4,y:3};enemy.creature.angry=true;enemy.colors={};enemy.properties.hardness=0;
    field.ensureField(run.data);return {...a,enemy,definition};
  }
  let a=arena();
  const locked=clone(a.enemy.creature.pending.cells);
  assert(field.stepField({x:5,y:4}).ok);
  field.advanceFieldTime(30);
  assert.equal(run.data.hp,100);assert(locked.some(c=>c.pos.x===4&&c.pos.y===4));
  assert.equal(a.enemy.creature.recovery,2);assert.equal(a.enemy.creature.nextAction.kind,'recover');
  assert.equal(status(a.enemy,'vulnerable'),2);assert.equal(ai.creatureIntent(a.enemy).glyph,'◇2');
  assert(!a.enemy.creature.intent?.length);
  const events=a.world.events.filter(e=>e.targetId===a.enemy.id&&e.kind==='signal'&&['빈틈','빗나감'].includes(e.message));
  assert.equal(events.at(-1).message,'빈틈');
  run.saveActiveRun();run.$reset();assert(run.loadActiveRun());
  a=field.ensureField(run.data);a.enemy=a.world.entities[Object.keys(a.world.entities).find(id=>a.world.entities[id].creature)];
  assert.equal(a.enemy.creature.recovery,2);assert.equal(ai.creatureIntent(a.enemy).glyph,'◇2');
  const spell={...clone(data.cards.get('c-strike')),id:'test-prepared',instanceId:'test-prepared:1',name:'집중 타격',cost:1,castSpeed:'slow',targetMode:'aimed',aimRange:4,shape:[{dx:0,dy:0}],perTileMul:[1],magic:{family:'test-prepared',strokes:2,mana:1,cooldown:2,effects:[{kind:'damage',value:10}]}};
  run.data.collection=[spell];run.data.deck=[spell];skills.ensureFieldSkills(run.data).slots={corner:spell.instanceId};
  const hp=displayedHp(a.enemy.properties),position=clone(a.enemy.pos);
  assert(field.performFieldGesture('corner',a.enemy.id,a.enemy.pos).ok);
  assert.equal(a.enemy.creature.recovery,1);assert.equal(ai.creatureIntent(a.enemy).glyph,'◇1');
  assert.equal(displayedHp(a.enemy.properties),hp,'slow spell has not hit on the first preparation turn');
  field.advanceFieldTime(30);
  assert.equal(hp-displayedHp(a.enemy.properties),15,'a completed spell benefits from the visible vulnerability window');
  assert.equal(run.data.hp,100);assert.deepEqual(a.enemy.pos,position);
  assert.equal(a.enemy.creature.recovery,0);assert.equal(status(a.enemy,'vulnerable'),0);
  assert(a.enemy.creature.pending||a.enemy.creature.nextAction);
  results.push('evade heavy swing → saved two-turn opening → slow spell lands for 15 instead of 10 → normal intent resumes');

  a=arena();field.advanceFieldTime(60);
  assert.equal(run.data.hp,92);assert.equal(a.enemy.creature.recovery,0);assert(a.enemy.creature.pending);
  a=arena('fast');assert(field.stepField({x:5,y:4}).ok);assert.equal(a.enemy.creature.recovery,0);
  a=arena('normal',[{dx:0,dy:1},{dx:1,dy:1},{dx:-1,dy:1},{dx:0,dy:2}]);
  assert(field.stepField({x:4,y:5}).ok); // still in the locked swing; getting hit must not open it
  assert.equal(a.enemy.creature.recovery,0);
  a=arena('normal',[{dx:0,dy:1},{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:-1}]);
  assert(field.stepField({x:5,y:4}).ok);assert.equal(a.enemy.creature.recovery,1);
  results.push('a landed heavy attack keeps pressure; a missed fast jab has no artificial idle; a missed wide swing opens one turn');


  function equipDamageProbe(){
    const cards=['corner','angle'].map(gesture=>({...clone(spell),id:'test-hit-'+gesture,instanceId:'test-hit-'+gesture+':1',castSpeed:'fast',
      magic:{family:'test-hit-'+gesture,strokes:2,mana:1,cooldown:1,effects:[{kind:'damage',value:10}]}}));
    run.data.collection=cards;run.data.deck=cards;skills.ensureFieldSkills(run.data).slots={corner:cards[0].instanceId,angle:cards[1].instanceId};
  }
  function probeDamage(arena,expected,gesture='corner'){
    const hp=displayedHp(arena.enemy.properties);
    const result=field.performFieldGesture(gesture,arena.enemy.id,arena.enemy.pos);
    assert(result.ok,result.message);assert.equal(hp-displayedHp(arena.enemy.properties),expected);
  }
  for(const previous of [0,1,2,6]){
    a=arena();assert(field.stepField({x:5,y:4}).ok);
    if(previous)combat.applyStatus(a.world,a.enemy,'vulnerable:'+previous,a.player);
    field.advanceFieldTime(30);
    const duration=Math.max(2,previous-1);
    assert.equal(a.enemy.creature.recovery,2);assert.equal(status(a.enemy,'vulnerable'),duration);
    assert.equal(ai.creatureIntent(a.enemy).glyph,'◇2');equipDamageProbe();
    probeDamage(a,15);assert.equal(a.enemy.creature.recovery,1);assert.equal(status(a.enemy,'vulnerable'),duration-1);
    assert.equal(ai.creatureIntent(a.enemy).glyph,'◇1');
    probeDamage(a,15,'angle');assert.equal(a.enemy.creature.recovery,0);assert.equal(status(a.enemy,'vulnerable'),duration-2);
    assert.notEqual(a.enemy.creature.nextAction?.kind,'recover');
    probeDamage(a,previous>3?15:10);
    assert.equal(status(a.enemy,'vulnerable'),Math.max(0,duration-3),'opening must preserve longer existing vulnerability');
  }
  results.push('pre-existing vulnerability cannot shorten an opening: both visible turns deal 15, expiry restores 10, longer debuffs keep their remaining duration');

  for(const sleepTurns of [1,2]){
    a=arena();assert(field.stepField({x:5,y:4}).ok);field.advanceFieldTime(30);
    combat.applyStatus(a.world,a.enemy,'sleep:'+sleepTurns,a.player);
    for(let step=1;step<=sleepTurns;step++){
      field.advanceFieldTime(30);
      assert.equal(a.enemy.creature.recovery,2-step);assert.equal(status(a.enemy,'vulnerable'),2-step);
      assert.equal(status(a.enemy,'sleep'),sleepTurns-step);
      assert.equal(run.data.hp,100);
      if(step<sleepTurns)assert.equal(ai.creatureIntent(a.enemy).label,'잠들어 있다.');
    }
    if(sleepTurns===1)assert.equal(ai.creatureIntent(a.enemy).glyph,'◇1');
    else {assert.notEqual(a.enemy.creature.nextAction?.kind,'recover');assert(a.enemy.creature.pending||a.enemy.creature.nextAction);}
    equipDamageProbe();probeDamage(a,sleepTurns===1?15:10);
    assert.equal(a.enemy.creature.recovery,0);assert.equal(status(a.enemy,'vulnerable'),0);
  }
  results.push('sleep spends the same opening clock: one sleeping turn leaves one boosted turn, two sleeping turns leave normal damage and a current intent');

  for(const wall of [false,true]){
    a=arena('normal',[{dx:0,dy:1},{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:-1}]);
    if(wall){a.space.tiles[2][4]='wall';a.enemy.creature.pending=undefined;a.enemy.creature.nextAction=undefined;field.ensureField(run.data);}
    assert.equal(a.enemy.creature.pending.cells.length,wall?3:4);
    assert.equal(a.enemy.creature.pending.recoveryTurns,1);
    const enemyId=a.enemy.id;run.saveActiveRun();run.$reset();assert(run.loadActiveRun());
    a=field.ensureField(run.data);a.enemy=a.world.entities[enemyId];
    assert.equal(a.enemy.creature.pending.recoveryTurns,1,'saved cast retains the unclipped footprint commitment');
    assert.equal(a.enemy.creature.pending.cells.length,wall?3:4);
    assert(field.stepField({x:5,y:4}).ok);assert.equal(run.data.hp,100);
    assert.equal(a.enemy.creature.recovery,1);assert.equal(status(a.enemy,'vulnerable'),1);
    assert.equal(ai.creatureIntent(a.enemy).glyph,'◇1');
    equipDamageProbe();probeDamage(a,15);
    assert.equal(a.enemy.creature.recovery,0);assert.equal(status(a.enemy,'vulnerable'),0);
    assert.notEqual(a.enemy.creature.nextAction?.kind,'recover');probeDamage(a,10,'angle');
  }
  results.push('the same wide swing keeps its one-turn opening beside a wall and across save/load; actual boosted damage expires on time');

  a=arena();a.player.properties.guard=6;a.player.properties['status:ward']=1;
  combat.finishStatusStep(a.player,{guard:0});assert.equal(a.player.properties.guard,6);
  combat.finishStatusStep(a.player,{guard:6,'status:ward':1});assert.equal(a.player.properties.guard,6);
  combat.finishStatusStep(a.player,{guard:6});assert.equal(a.player.properties.guard,3);
  results.push('fresh ward protects same-turn guard, expiry is respected and normal decay resumes');

  a=arena();delete a.world.entities[a.enemy.id];
  const map=generation.fieldMap(run.data);
  const rooms=[];
  for(const node of map.nodes.filter(n=>['combat','elite','boss','boss-gate'].includes(n.kind)).slice(0,18)){
    const room=generation.ensureFieldSpace(run.data,a.world,node.id+'::dungeon:1');
    const creatures=Object.values(a.world.entities).filter(e=>e.nodeId===room.id&&e.creature);
    const region=map.regions.find(r=>r.id===node.region);
    const pool=(region?.enemyPool??[]).filter(id=>data.monsters.get(id)?.tier!=='elite');
    if(new Set(pool).size>1){assert.equal(creatures.length,2);assert.notEqual(creatures[0].creature.definitionId,creatures[1].creature.definitionId);}
    const cache=Object.values(a.world.entities).find(e=>e.nodeId===room.id&&e.tags.includes('storage')&&e.name==='오래된 보관함');
    assert(cache);rooms.push({id:room.id,enemies:creatures.map(e=>e.creature.definitionId),supplies:Object.keys(cache.stock).sort().join(',')});
  }
  assert(new Set(rooms.map(r=>r.supplies)).size>=2);
  results.push('generated regional dungeon pairs use distinct authored monsters when available and varied usable supply caches');
  console.log(JSON.stringify({status:'PASS',scenarios:results.length,results,rooms},null,2));
} finally {
  globalThis.window=old.window;globalThis.localStorage=old.localStorage;globalThis.fetch=old.fetch;
  await server.close();
}
