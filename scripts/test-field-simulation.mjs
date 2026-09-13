import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const saved = new Map();
const oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
globalThis.window = { setTimeout: () => 0 };
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key,value) => saved.set(key,value), removeItem: key => saved.delete(key) };
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  setActivePinia(createPinia());
  const { useRunStore } = await server.ssrLoadModule('/src/stores/run.ts');
  const { useDataStore } = await server.ssrLoadModule('/src/stores/data.ts');
  const { loadFromText } = await server.ssrLoadModule('/src/data/loader.ts');
  const field = await server.ssrLoadModule('/src/systems/field-simulation.ts');
  const generation = await server.ssrLoadModule('/src/systems/field-generation.ts');
  const spatial = await server.ssrLoadModule('/src/systems/world/spatial.ts');
  const engine = await server.ssrLoadModule('/src/systems/world/engine.ts');
  const gestures = await server.ssrLoadModule('/src/systems/gestures.ts');
  const all = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? all(join(dir,e.name)) : e.name.endsWith('.txt') ? [join(dir,e.name)] : []);
  const data = useDataStore(); data.data = loadFromText(all(join(root,'public/data')).map(f => readFileSync(f,'utf8')).join('\n'));
  const timeline = [...data.timelines.values()].find(t => data.nodeMaps.get(t.nodeMapId)?.nodes.some(n => n.id === 'n-iluneon-square'));
  assert.ok(timeline);
  const run = useRunStore();
  const passed = [];
  function start(nodeId = 'n-iluneon-square') {
    run.startRun({ timelineId: timeline.id, raceId: 'human', season: 'spring', startNodeId: nodeId, maxHp: 50, maxMp: 8, timeLimit: 300 });
    return field.ensureField(run.data);
  }
  function park(world, space, player, pos) {
    for (const e of Object.values(world.entities)) if (e.id !== player.id && e.nodeId === space.id && e.pos && spatial.distance(e.pos,pos) === 0) e.pos = {x:1,y:1};
    player.pos = {...pos};
  }
  function line(points, samples = 20) { return points.slice(1).flatMap((b,i) => { const a=points[i]; return Array.from({length:samples},(_,j)=>({x:a.x+(b.x-a.x)*j/samples,y:a.y+(b.y-a.y)*j/samples})); }).concat(points.at(-1)); }
  for (const [g,a,b] of [['up',{x:90,y:170},{x:91,y:25}],['down',{x:90,y:20},{x:93,y:165}],['left',{x:165,y:90},{x:20,y:94}],['right',{x:20,y:90},{x:165,y:94}]]) assert.equal(gestures.recognizeGesture(line([a,b])),g);
  for (const [g,points] of [['triangle',[{x:100,y:20},{x:180,y:170},{x:20,y:170},{x:100,y:20}]], ['inverted',[{x:20,y:20},{x:180,y:20},{x:100,y:170},{x:20,y:20}]]]) {
    const sample = line(points);
    for (const scale of [.55,1,1.4]) for (const reverse of [false,true]) { const shifted=sample.map(p=>({x:p.x*scale+23,y:p.y*scale-14})); assert.equal(gestures.recognizeGesture(reverse?shifted.reverse():shifted),g); }
  }
  for (const reverse of [-1,1]) for (const phase of [0,.7,2.2]) assert.equal(gestures.recognizeGesture(Array.from({length:100},(_,i)=>({x:100+75*Math.cos(i/99*Math.PI*2*reverse+phase),y:100+60*Math.sin(i/99*Math.PI*2*reverse+phase)}))),'circle');
  assert.equal(gestures.recognizeGesture([{x:0,y:0},{x:10,y:5}]),'tend');
  assert.equal(gestures.recognizeGesture(line([{x:20,y:20},{x:170,y:170}])), 'tend');
  assert.equal(gestures.recognizeGesture(line([{x:20,y:20},{x:180,y:180},{x:20,y:180},{x:180,y:20}])),undefined);
  passed.push('gestures tolerate scale and direction; diagonal strokes act and crossed strokes reject');

  let {world,space,player} = start();
  park(world,space,player,{x:7,y:6});
  const next=spatial.cardinal(player.pos).find(p=>spatial.walkable(world,space.id,p,'player'));
  const diagonal={x:player.pos.x+1,y:player.pos.y+1};
  assert.equal(field.stepField(diagonal).ok,false); assert.equal(run.data.field.elapsedSeconds,0);
  assert.equal(field.stepField(next).ok,true); assert.equal(run.data.field.elapsedSeconds,30); assert.equal(field.fieldClock(run.data),'1일 12:00:30');
  assert.equal(run.data.visitedNodes.length,0);
  field.advanceFieldTime(840); assert.equal(run.data.field.elapsedSeconds,870); assert.equal(run.data.visitedNodes.length,1); assert.equal(run.data.ended,false);
  passed.push('movement is orthogonal and exactly 30 seconds; fractional legacy time is preserved');

  ({world,space,player}=start());
  park(world,space,player,{x:7,y:6});
  const bumpBarrel=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.tags.includes('barrel'));
  bumpBarrel.pos={x:6,y:6};
  for(const e of Object.values(world.entities)) if(e.id!=='player'&&e.id!==bumpBarrel.id&&e.nodeId===space.id&&e.pos&&spatial.distance(e.pos,{x:7,y:5})===0)e.pos={x:1,y:1};
  assert.equal(field.performFieldGesture('up',bumpBarrel.id,bumpBarrel.pos).ok,true);assert.deepEqual(player.pos,{x:7,y:5});assert.equal(bumpBarrel.carriedBy,undefined,'direction ignores the selected distant object');
  assert.equal(field.performFieldGesture('down',undefined,player.pos).ok,true);assert.deepEqual(player.pos,{x:7,y:6});
  assert.equal(field.performFieldGesture('left',undefined,player.pos).ok,true);assert.deepEqual(player.pos,{x:7,y:6});assert.equal(bumpBarrel.carriedBy,'player');assert.equal(run.data.field.elapsedSeconds,90,'bump interaction spends one turn, not two');
  space.tiles[6][8]='wall';const blockedTime=run.data.field.elapsedSeconds;
  assert.equal(field.performFieldGesture('right',undefined,player.pos).ok,false);assert.equal(run.data.field.elapsedSeconds,blockedTime);
  const speaker=Object.values(world.entities).find(e=>e.agent&&e.id!=='player'&&e.nodeId===space.id);speaker.pos={x:7,y:5};
  const bumpTalk=field.performFieldGesture('up',undefined,player.pos);assert.ok(bumpTalk.speech?.lines.length);assert.deepEqual(player.pos,{x:7,y:6});
  passed.push('direction gestures move to the adjacent tile, interact with blocking objects or NPCs, and never double-spend time');

  ({world,space,player}=start());
  const barrel=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.tags.includes('barrel'));
  park(world,space,player,{x:barrel.pos.x+1,y:barrel.pos.y});
  assert.equal(field.performFieldGesture('lift',barrel.id,barrel.pos).ok,true); assert.equal(barrel.carriedBy,'player'); assert.equal(barrel.pos,undefined);
  const rock=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.tags.includes('stone'));
  assert.equal(field.performFieldGesture('lift',rock.id,rock.pos).ok,false);
  const place=spatial.cardinal(player.pos).find(p=>spatial.walkable(world,space.id,p,barrel.id));
  const water=barrel.stock.water;
  assert.equal(field.performFieldGesture('place',undefined,place).ok,true); assert.deepEqual(barrel.pos,place); assert.equal(barrel.carriedBy,undefined); assert.equal(barrel.stock.water,water);
  assert.equal(spatial.walkable(world,space.id,place,'player'),false);
  const physical=()=>JSON.stringify(Object.values(world.entities).map(e=>[e.id,e.pos,e.stock,e.carriedBy,e.production]));
  const before=physical(), time=run.data.field.elapsedSeconds;
  assert.equal(field.performFieldGesture('place',undefined,player.pos).ok,false); assert.equal(run.data.field.elapsedSeconds,time); assert.ok(physical()===before, 'failed drop preserves physical state');
  passed.push('carry and placement conserve the object and stock, block walking, reject duplicate or invalid drops');

  ({world,space,player}=start());
  const ground=field.groundAt(run.data,{x:7,y:7}); park(world,space,player,{x:7,y:6});
  run.data.field.selectedItem='water'; const waterBefore=player.stock.water;
  assert.equal(field.performFieldGesture('give',ground.id,ground.pos).ok,true); assert.equal(ground.stock.water,1); assert.equal(player.stock.water,waterBefore-1);
  assert.equal(field.performFieldGesture('take',ground.id,ground.pos).ok,true); assert.equal(ground.stock.water,0); assert.equal(player.stock.water,waterBefore);
  assert.equal(field.performFieldGesture('take',ground.id,ground.pos).ok,false);
  passed.push('items can be placed on a tile and picked up without duplication');

  ({world,space,player}=start());
  const plot=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.tags.includes('field-plot')&&!Object.values(e.stock).some(n=>n>0));
  park(world,space,player,spatial.cardinal(plot.pos).find(p=>spatial.walkable(world,space.id,p,'player')));
  const seeds=player.stock['field-seed'];
  assert.equal(field.performFieldGesture('tend',plot.id,plot.pos).ok,true); assert.equal(player.stock['field-seed'],seeds-1); assert.ok(plot.production);
  const batch=plot.production.id;
  assert.equal(field.performFieldGesture('tend',plot.id,plot.pos).ok,true); assert.equal(plot.production.id,batch,'second gesture waters rather than replacing crop');
  const other=generation.fieldMap(run.data).nodes.find(n=>n.id!==space.id && n.kind==='village');
  const otherSpace=generation.ensureFieldSpace(run.data,world,other.id); run.data.currentNodeId=other.id; player.nodeId=other.id; player.pos={...otherSpace.spawn};
  field.advanceFieldTime(1800);
  assert.equal(plot.production.settled,true,JSON.stringify({batch:plot.production,seconds:run.data.field.elapsedSeconds,coarse:run.data.field.lastWorldStep})); assert.ok(plot.stock['i-crop-grain']>=2);
  const output={...plot.stock}; field.advanceFieldTime(300); assert.deepEqual(plot.stock,output,'settles once');
  passed.push('multiple tile crops consume seeds, accept shared water and grow once while player is elsewhere');

  ({world,space,player}=start());
  const resident=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.agent&&e.id!=='player');
  assert.ok(resident); park(world,space,player,spatial.cardinal(resident.pos).flatMap(p=>spatial.cardinal(p)).find(p=>spatial.distance(p,resident.pos)===2&&spatial.walkable(world,space.id,p,'player')&&spatial.hasSight(world,{...player,pos:p},resident)));
  const talk=field.performFieldGesture('tap',resident.id,resident.pos); assert.equal(talk.ok,true); assert.ok(talk.speech?.lines.length); assert.equal(talk.speech.name,resident.name);
  const snapshot=JSON.stringify(resident); field.advanceFieldTime(270); assert.notEqual(JSON.stringify(resident),snapshot);
  passed.push('NPCs speak actual lines and advance their own actions on the field');

  ({world,space,player}=start());
  const monsterNode=generation.fieldMap(run.data).nodes.find(n=>n.kind==='combat');
  const first=generation.ensureFieldSpace(run.data,world,monsterNode.id+'::dungeon:1');
  const second=generation.ensureFieldSpace(run.data,world,monsterNode.id+'::dungeon:2');
  assert.equal(first.dungeon.floor,1); assert.equal(second.dungeon.floor,2);
  assert.ok(Object.values(world.entities).some(e=>e.nodeId===second.id&&e.creature?.rank==='elite'));
  run.data.currentNodeId=first.id; player.nodeId=first.id; player.pos=spatial.cardinal(first.exits.find(e=>e.to===second.id).pos).find(p=>spatial.walkable(world,first.id,p,'player'));
  assert.equal(field.travelField(second.id).ok,false,'locked exit cannot be bypassed');
  first.cleared=true; assert.equal(field.travelField(second.id).ok,true);
  assert.equal(run.data.currentNodeId,second.id); assert.equal(field.travelField(monsterNode.id).ok,false,'cannot teleport to arbitrary space');
  passed.push('dungeon floors preserve elite definitions and gate deeper floors until cleared');

  const enemy=Object.values(world.entities).find(e=>e.nodeId===second.id&&e.creature);
  enemy.properties.integrity=0; field.advanceFieldTime(30); const gold=run.data.gold;
  field.advanceFieldTime(30); assert.equal(run.data.gold,gold,'dead enemy reward cannot repeat'); assert.ok(world.entities[enemy.id+':loot']);
  passed.push('creature defeat leaves loot on the grid and pays rewards once');

  run.saveActiveRun(); const fieldSaved=JSON.stringify(run.data.field), spacesSaved=JSON.stringify(run.data.interactionWorld.spaces);
  assert.equal(run.loadActiveRun(),true); field.ensureField(run.data);
  assert.ok(JSON.stringify(run.data.field)===fieldSaved,'field clock and progression survive reload'); assert.ok(JSON.stringify(run.data.interactionWorld.spaces)===spacesSaved,'spaces survive reload');
  assert.equal(run.data.currentNodeId,second.id);
  passed.push('save reload preserves dungeon location, exact time, growth, gestures and persistent spaces');

  // The same reducer must react to any actor, including a creature breaking a held container.
  const materialWorld = { version:1, turn:0, sequence:0, entities:{}, events:[], knowledge:{}, receipts:[], spaces:{lab:{id:'lab',width:9,height:9,tiles:Array.from({length:9},()=>Array(9).fill('grass'))}} };
  const prop = (id,pos,properties={},stock={}) => materialWorld.entities[id]={id,name:id,kind:'resource',nodeId:'lab',pos,properties:{integrity:100,...properties},stock,colors:{},tags:[]};
  const carrier=prop('carrier',{x:4,y:4}); carrier.kind='actor';
  const breaker=prop('breaker',{x:5,y:4}); breaker.kind='actor';
  const vessel=prop('vessel',undefined,{integrity:5,spillOnBreak:1,portable:1},{water:4}); vessel.carriedBy=carrier.id;
  const plant=prop('plant',{x:4,y:5},{flammability:1,burning:4,heat:4});
  const smash=engine.resolveInteraction(materialWorld,breaker.id,vessel.id,{id:'anything',label:'',description:'',duration:0,effects:[{kind:'influence',property:'force',amount:10}]});
  assert.equal(smash.ok,true); assert.equal(vessel.carriedBy,undefined); assert.deepEqual(vessel.pos,carrier.pos); assert.deepEqual(vessel.stock,{}); assert.equal(plant.properties.burning,0);
  assert.ok(carrier.properties.moisture>0); assert.ok(smash.facts.some(f=>f.message==='물이 퍼졌다.'&&f.actorId===breaker.id));
  const latecomer=prop('latecomer',{x:3,y:4}); latecomer.kind='actor'; engine.tickMaterials(materialWorld,'only'); assert.ok(latecomer.properties.moisture>0,'walking onto the residue wets a later visitor');
  const fire=prop('fire',{x:1,y:1},{heat:5,burning:5,flammability:1}); const fuel=prop('fuel',{x:2,y:1},{flammability:2});
  engine.tickMaterials(materialWorld,'only'); assert.ok(fuel.properties.burning>0,'heat spreads by proximity and material properties');
  assert.ok(fire.properties.integrity<100);
  passed.push('shared material reducer spills actual contents for any actor, releases destroyed carried objects, wets later visitors and spreads heat');

  for (const e of Object.values(materialWorld.entities)) e.properties.smoke=0;
  carrier.pos={x:1,y:7}; breaker.pos={x:5,y:7};
  assert.equal(spatial.hasSight(materialWorld,carrier,breaker),true);
  carrier.properties.smoke=2; assert.equal(spatial.hasSight(materialWorld,carrier,breaker),false,'observer inside smoke cannot see out');
  carrier.properties.smoke=0; breaker.properties.smoke=2; assert.equal(spatial.hasSight(materialWorld,carrier,breaker),false,'target in smoke is concealed');
  breaker.properties.smoke=0; materialWorld.spaces.lab.tiles[7][3]='wall'; assert.equal(spatial.hasSight(materialWorld,carrier,breaker),false);
  passed.push('walls and smoke block spatial observations, including both line-of-sight endpoints');

  ({world,space,player}=start(monsterNode.id));
  const attacker=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.creature);
  assert.ok(attacker);
  for(const e of Object.values(world.entities)) if(e.id!=='player'&&e.id!==attacker.id&&e.nodeId===space.id) delete world.entities[e.id];
  space.tiles=Array.from({length:space.height},()=>Array(space.width).fill('grass'));
  player.pos={x:3,y:3}; attacker.pos={x:4,y:3}; attacker.creature.angry=true;
  attacker.creature.pending=undefined;attacker.creature.nextAction=undefined;
  const fullHp=run.data.hp; field.ensureField(run.data); assert.ok(attacker.creature.intent.some(p=>p.x===3&&p.y===3)); assert.equal(run.data.hp,fullHp,'intent is visible before the next player turn');
  assert.equal(field.stepField({x:3,y:2}).ok,true); assert.equal(run.data.hp,fullHp,'moving off the locked tile avoids the attack');
  attacker.creature.angry=false; attacker.creature.recovery=0;attacker.creature.tempoStep=0;attacker.creature.pending=undefined;attacker.creature.nextAction=undefined; attacker.pos={x:6,y:3}; player.pos={x:1,y:3};
  const bait=field.groundAt(run.data,{x:6,y:5}); bait.stock['i-crop-grain']=2;
  // Finish arranging the fixture before planning the first food-directed turn.
  attacker.creature.nextAction=undefined;
  field.advanceFieldTime(30); assert.deepEqual(attacker.pos,{x:6,y:4},'food placed on a tile redirects an unprovoked creature');
  field.advanceFieldTime(30); assert.equal(bait.stock['i-crop-grain'],1,'feeding consumes the actual stock');
  const count=Object.keys(world.entities).length, seconds=run.data.field.elapsedSeconds;
  assert.equal(field.performFieldGesture('give',undefined,{x:-1,y:6}).ok,false); assert.equal(Object.keys(world.entities).length,count); assert.equal(run.data.field.elapsedSeconds,seconds);
  passed.push('creatures telegraph before hitting, movement evades locked cells, real food lures them and invalid gestures create no off-map entities');

  ({world,space,player}=start(monsterNode.id));
  const spellTarget=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.creature);
  park(world,space,player,spatial.cardinal(spellTarget.pos).find(p=>spatial.walkable(world,space.id,p,'player')));
  run.data.level=12; // Draw precision is tested with the star already learned.
  const skill={id:'test-star',instanceId:'test-star-copy',name:'별의 힘',rank:'common',source:'race',cost:3,trigger:'manual',effects:[{kind:'damage',value:30}],targetMode:'aimed',shape:[{dx:0,dy:0}],aimRange:4,castSpeed:'fast'};
  run.data.collection.push(skill);run.data.field.skills.slots.star=skill.instanceId;
  const mana=run.data.mp,initialIntegrity=spellTarget.properties.integrity;
  assert.equal(field.performFieldGesture('star',spellTarget.id,spellTarget.pos).ok,false,'advanced rune has no button shortcut');
  assert.equal(field.performFieldGesture('star',spellTarget.id,spellTarget.pos,{drawn:true,quality:.8}).ok,false);assert.equal(run.data.mp,mana);assert.equal(run.data.field.elapsedSeconds,0);
  assert.equal(field.performFieldGesture('star',spellTarget.id,spellTarget.pos,{drawn:true,quality:.99}).ok,true);assert.equal(run.data.mp,mana-3);assert.ok(spellTarget.properties.integrity<initialIntegrity);assert.equal(run.data.field.elapsedSeconds,30);
  passed.push('advanced drawn patterns require accuracy and spend real mana through the shared property reducer');


  const geography=await server.ssrLoadModule('/src/systems/field-geography.ts');
  const life=await server.ssrLoadModule('/src/systems/life-catalog.ts');
  const lifeWorld=await server.ssrLoadModule('/src/systems/world/life-world.ts');
  ({world,space,player}=start());
  const authored=generation.fieldMap(run.data), coordinates=JSON.stringify(authored.nodes.map(n=>[n.id,n.position,n.neighbors,n.conditionalNeighbors]));
  const roadIds=new Set(), dimensions=new Set(), themes=new Set();
  for(const node of authored.nodes){
    const area=generation.ensureFieldSpace(run.data,world,node.id);
    dimensions.add(area.width+'x'+area.height);themes.add(area.theme);
    if(!['village','combat','elite','boss'].includes(node.kind)&&![...data.npcs.values()].filter(n=>n.homeNodeId===node.id||node.contentRef?.npcIdPool?.includes(n.id)).length)assert.ok(area.width>=6&&area.width<=10&&area.height>=6&&area.height<=10,node.id+' remains compact with a regional aspect ratio');
    for(const exit of area.exits.filter(e=>e.destination)){
      const destination=authored.nodes.find(n=>n.id===exit.destination);
      assert.equal(exit.roads,geography.roadCount(authored,node,destination));
      const ids=[node.id,destination.id].sort();
      for(let i=0;i<exit.roads;i++)roadIds.add(geography.roadId(ids[0],ids[1],i));
    }
    for(const object of Object.values(world.entities).filter(e=>e.nodeId===node.id&&e.pos&&e.id!=='player'))
      assert.ok(spatial.fieldPath(world,node.id,area.spawn,object.pos,'player',true),node.id+' object '+object.name+' can be approached');
  }
  for(const id of roadIds){const area=generation.ensureFieldSpace(run.data,world,id);assert.deepEqual([area.width,area.height],[6,6]);for(const exit of area.exits)assert.ok(spatial.fieldPath(world,id,area.spawn,exit.pos,'player'));}
  assert.equal(JSON.stringify(authored.nodes.map(n=>[n.id,n.position,n.neighbors,n.conditionalNeighbors])),coordinates);
  assert.ok(dimensions.size>=4);assert.ok(themes.size>=5);
  const longest=authored.nodes.flatMap(a=>a.neighbors.map(id=>({a,b:authored.nodes.find(n=>n.id===id)}))).sort((x,y)=>geography.roadCount(authored,y.a,y.b)-geography.roadCount(authored,x.a,x.b))[0];
  const chain=[],origin=longest.a.id,destination=longest.b.id;
  run.data.currentNodeId=origin;player.nodeId=origin;delete run.data.nodeStates[destination];
  for(let i=0;i<20&&run.data.currentNodeId!==destination;i++){
    const area=generation.ensureFieldSpace(run.data,world,run.data.currentNodeId),exit=area.exits.find(e=>e.destination===destination);
    assert.ok(exit);player.pos={...exit.pos};assert.equal(field.travelField(exit.to).ok,true);chain.push(run.data.currentNodeId);
    if(run.data.currentNodeId!==destination)assert.ok(!run.data.nodeStates[destination]?.visited,'crossing a road does not visit the destination early');
  }
  assert.equal(run.data.currentNodeId,destination);assert.equal(chain.length,geography.roadCount(authored,longest.a,longest.b)+1);
  passed.push('authored '+authored.nodes.length+' places preserve geography, '+roadIds.size+' intermediate road sections remain traversable, '+themes.size+' terrain themes and '+dimensions.size+' footprints');

  for(const kind of ['village','shop','workshop','activity','event']){
    const node=authored.nodes.find(n=>n.kind===kind);({world,space,player}=start(node.id));
    const site=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.tags.includes('service:'+kind));
    park(world,space,player,spatial.cardinal(site.pos).find(p=>spatial.walkable(world,space.id,p,'player')));
    assert.ok(field.fieldHints(run.data,world,site,site.pos).some(h=>h.id==='tap'));
    assert.equal(field.performFieldGesture('tap',site.id,site.pos).route,'/game/'+kind);
  }
  passed.push('tap connects village, shop, workshop, activity and event facilities to existing screens');

  const activities=new Set();
  for(const node of authored.nodes.filter(n=>n.kind==='gather')){
    const activity=life.activityForNode(node.id,node.region);if(activities.has(activity.id))continue;activities.add(activity.id);
    ({world,space,player}=start(node.id));
    const site=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.tags.includes('life-site'));
    park(world,space,player,spatial.cardinal(site.pos).find(p=>spatial.walkable(world,space.id,p,'player')));
    const action=lifeWorld.lifeActions(run.data,world,'player',site.id)[0];assert.ok(action);
    assert.ok(field.fieldHints(run.data,world,site,site.pos).some(h=>h.id==='tap'));
    const xp=(run.data.lifeLevel-1)*3+run.data.lifeXp;
    const lowerBefore=player.stock[activity.lowerItemId]??0,upperBefore=player.stock[activity.upperItemId]??0,colorBefore=run.data.colors[activity.element];
    const neighbors=Object.values(world.entities).filter(e=>e.nodeId===space.id&&e.id!==site.id&&e.tags.includes('forage')).map(e=>[e.id,JSON.stringify(e.stock)]);
    const result=field.performFieldGesture('tap',site.id,site.pos);assert.equal(result.ok,true,activity.id+': '+result.message);
    if(activity.type==='repeat'){
      const lower=(player.stock[activity.lowerItemId]??0)-lowerBefore,upper=(player.stock[activity.upperItemId]??0)-upperBefore;
      assert.equal(lower+upper,upper?3:2,'level-one extraction selects a normal or fine batch');assert.equal(upper?lower:upper,0);
      assert.equal((run.data.lifeLevel-1)*3+run.data.lifeXp-xp,upper?2:1);
      assert.equal(run.data.colors[activity.element]-colorBefore,upper?3:2);
      assert.equal(site.stock[activity.lowerItemId],0,'one extraction consumes this patch before mastery changes its output');
      for(const [id,stock]of neighbors)assert.equal(JSON.stringify(world.entities[id].stock),stock,'nearby patch keeps its own stock');
      const before=JSON.stringify({stock:player.stock,xp:run.data.lifeXp,level:run.data.lifeLevel,colors:run.data.colors});
      assert.equal(field.performFieldGesture('tap',site.id,site.pos).ok,false);assert.equal(JSON.stringify({stock:player.stock,xp:run.data.lifeXp,level:run.data.lifeLevel,colors:run.data.colors}),before);
    }else assert.ok(site.production&&!site.production.settled);
  }
  assert.equal(activities.size,8);
  passed.push('all eight regional life activities execute on their tiles; extraction consumes stock and grants life growth');

  ({world,space,player}=start());
  const portable=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.tags.includes('barrel'));
  park(world,space,player,spatial.cardinal(portable.pos).find(p=>spatial.walkable(world,space.id,p,'player')));
  assert.ok(field.fieldHints(run.data,world,portable,portable.pos).some(h=>h.id==='lift'));
  field.performFieldGesture('lift',portable.id,portable.pos);
  assert.ok(field.fieldHints(run.data,world,player,player.pos).some(h=>h.id==='place'),'held object shows how to put it down');


  const compactNode=authored.nodes.find(n=>n.kind==='event'&&n.neighbors.length>=3);
  const old={id:compactNode.id,nodeId:compactNode.id,name:compactNode.label,width:15,height:13,spawn:{x:7,y:6},tiles:Array.from({length:13},()=>Array(15).fill('grass')),exits:[]};
  world.spaces[old.id]=old;
  for(let i=0;i<14;i++)world.entities['legacy:'+i]={id:'legacy:'+i,name:'saved '+i,kind:'resource',nodeId:old.id,pos:{x:1+i%13,y:2+i%9},tags:['storage'],properties:{integrity:80,solid:i<7?1:0},stock:{water:i+1},colors:{earth:30}};
  world.entities['legacy:10'].production={id:'saved-crop',recipeId:'field-grain',startedTurn:0,duration:4,settled:false,output:{'i-crop-grain':3},level:2,colorValue:20,upper:false,producerId:'player'};
  const originals=Object.values(world.entities).filter(e=>e.nodeId===old.id).map(e=>({id:e.id,stock:JSON.stringify(e.stock),properties:JSON.stringify(e.properties),production:JSON.stringify(e.production)}));
  const migrated=generation.ensureFieldSpace(run.data,world,old.id);
  for(const oldEntity of originals){const e=world.entities[oldEntity.id];assert.equal(JSON.stringify(e.stock),oldEntity.stock);assert.equal(JSON.stringify(e.properties),oldEntity.properties);assert.equal(JSON.stringify(e.production),oldEntity.production);assert.ok(e.pos.x>0&&e.pos.x<migrated.width-1&&e.pos.y>0&&e.pos.y<migrated.height-1);}
  for(const exit of migrated.exits)assert.ok(spatial.fieldPath(world,migrated.id,migrated.spawn,exit.pos,'player'),'migrated exit '+exit.to+' remains reachable');
  assert.equal(portable.carriedBy,'player');assert.deepEqual(generation.ensureFieldSpace(run.data,world,old.id),migrated,'migration happens once');
  passed.push('15x13 saved fields retain stocks, crops and held objects while compacting without blocking exits');

  ({world,space,player}=start());
  const trainingTarget=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.tags.includes('barrel'));
  park(world,space,player,spatial.cardinal(trainingTarget.pos).find(p=>spatial.walkable(world,space.id,p,'player')));
  const force=()=>field.fieldAction(run.data,world,player,trainingTarget,'strike',trainingTarget.pos).effects.find(e=>e.property==='force').amount;
  const baseForce=force(),baseColors=JSON.stringify(run.data.colors);
  run.data.field.gestureXp.strike=24;assert.ok(force()>baseForce,'one-stroke practice increases actual force');
  const trainedForce=force();
  run.data.equipmentInventory.push({id:'test-field-equipment',name:'test',slot:'weapon',rank:'common',colorEffects:[{color:'fire',value:40},{color:'electric',value:40},{color:'earth',value:40},{color:'iron',value:40}]});
  run.data.equippedWeapon='test-field-equipment';
  assert.ok(force()>trainedForce,'equipped colors increase field force');
  const guard=field.fieldAction(run.data,world,player,player,'strike',player.pos).effects[0].amount;
  run.data.equippedWeapon=null;
  assert.ok(guard>field.fieldAction(run.data,world,player,player,'strike',player.pos).effects[0].amount);
  assert.equal(JSON.stringify(run.data.colors),baseColors,'equipment bonuses never become permanent base colors');
  const brush=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.tags.includes('brush'));
  park(world,space,player,spatial.cardinal(brush.pos).find(p=>spatial.walkable(world,space.id,p,'player')));
  const lifeBefore=(run.data.lifeLevel-1)*3+run.data.lifeXp;
  assert.equal(field.performFieldGesture('tap',brush.id,brush.pos).ok,true);assert.ok((run.data.lifeLevel-1)*3+run.data.lifeXp>lifeBefore);
  const delayed=authored.nodes.find(n=>n.kind==='gather'&&life.activityForNode(n.id,n.region).type==='delayed');
  ({world,space,player}=start(delayed.id));run.data.lifeLevel=3;run.data.field.productionMode='abundant';
  ({world,space,player}=field.ensureField(run.data));
  const productionSite=Object.values(world.entities).find(e=>e.nodeId===space.id&&e.tags.includes('life-site'));
  park(world,space,player,spatial.cardinal(productionSite.pos).find(p=>spatial.walkable(world,space.id,p,'player')));
  assert.equal(field.performFieldGesture('tap',productionSite.id,productionSite.pos).ok,true);
  assert.equal(productionSite.production.plot.productionMode,'abundant');assert.equal(productionSite.production.automaticCare,true);
  passed.push('gesture mastery and equipped colors affect force and guard; tap harvesting grants XP and life specialization configures real production');

  ({world,space,player}=start());
  for (const node of generation.fieldMap(run.data).nodes) {
    const area=generation.ensureFieldSpace(run.data,world,node.id);
    assert.equal(area.exits.filter(e=>e.destination).length,new Set([...node.neighbors,...(node.conditionalNeighbors??[]).map(c=>c.nodeId)]).size);
    for(const exit of area.exits) { assert.equal(area.tiles[exit.pos.y][exit.pos.x],'path'); assert.ok(spatial.fieldPath(world,area.id,area.spawn,exit.pos,'player'),`${node.id} exit ${exit.to} is reachable`); }
  }
  passed.push('every authored place becomes a tile area with all authored connections preserved');
  field.setFieldViewport({columns:7,rows:5});
  const total=Object.values(world.entities).length,active=field.activeFieldIds(run.data,world);
  assert.ok(active.size<total/10,'fine simulation stays bounded by the current camera');
  const distant=Object.values(world.entities).filter(e=>e.nodeId!==space.id&&e.pos&&e.creature);
  const positions=JSON.stringify(distant.map(e=>[e.id,e.pos]));
  const timings=[];for(let i=0;i<10;i++){const started=performance.now();field.advanceFieldTime(30);timings.push(Math.round(performance.now()-started));}const elapsedMs=timings.reduce((a,b)=>a+b,0);
  assert.equal(JSON.stringify(distant.map(e=>[e.id,e.pos])),positions,'coarse simulation does not replay distant monster paths or attacks; resident travel has separate arrival tests');
  assert.ok(distant.some(e=>e.fieldUpdatedAt===300),'distant entities still settle elapsed state');
  field.setFieldViewport();
  passed.push(`viewport detail and arithmetic distant settlement: ${active.size}/${total} detailed entities, 10 steps in ${elapsedMs}ms (${timings.join(',')})`);
  console.log(JSON.stringify({status:'PASS',count:passed.length,scenarios:passed},null,2));
} finally { await server.close(); globalThis.window=oldWindow; globalThis.localStorage=oldStorage; }
