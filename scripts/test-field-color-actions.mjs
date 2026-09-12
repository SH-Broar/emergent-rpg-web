import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
globalThis.window = { setTimeout: () => 0 };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const server = await createServer({ root, server: { middlewareMode:true }, appType:'custom' });
try {
  setActivePinia(createPinia());
  const colors = await server.ssrLoadModule('/src/systems/field-color-actions.ts');
  const engine = await server.ssrLoadModule('/src/systems/world/engine.ts');
  const spatial = await server.ssrLoadModule('/src/systems/world/spatial.ts');
  const statuses = await server.ssrLoadModule('/src/systems/world/status.ts');
  const social = await server.ssrLoadModule('/src/systems/world/social.ts');
  const life = await server.ssrLoadModule('/src/systems/world/life-world.ts');
  const records = await server.ssrLoadModule('/src/data/field-records.ts');
  const readings = await server.ssrLoadModule('/src/systems/field-readings.ts');
  const results = [], used = new Set();
  const entity = (id, kind, x, y, properties = {}) => ({
    id, name:id, kind, nodeId:'field', pos:{x,y}, colors:{}, tags:[], stock:{}, properties:{integrity:100,...properties}
  });
  function fixture(properties = {}) {
    const player = entity('player','actor',1,3,{maxHp:100,mana:3,carryCapacity:3});
    player.stock = {water:2,'i-life-ore':2};
    const target = entity('target','resource',2,3,{portable:1,mass:1,...properties});
    return {version:1,turn:0,sequence:0,entities:{player,target},events:[],knowledge:{},receipts:[],spaces:{
      field:{id:'field',width:7,height:7,tiles:Array.from({length:7},()=>Array(7).fill('grass')),exits:[]}
    }};
  }
  function cast(world, id, targetId = 'target', restoreMana = true) {
    if (restoreMana) world.entities.player.properties.mana = 3;
    const action = colors.colorOperationAction(world,'player',targetId,id);
    const reason = colors.colorOperationDisabled(world,'player',targetId,action);
    assert.equal(reason,undefined,id + ': ' + reason);
    assert(action);
    const result = engine.resolveInteraction(world,'player',targetId,action);
    assert(result.ok,id); used.add(id); return result;
  }
  assert.equal(colors.COLOR_OPERATION_DEFS.length,16);
  assert.equal(new Set(colors.COLOR_OPERATION_DEFS.map(x=>x.id)).size,16);
  for (const color of ['fire','water','electric','iron','earth','wind','light','dark'])
    assert.equal(colors.COLOR_OPERATION_DEFS.filter(x=>x.color===color).length,2);

  let world = fixture({flammability:2});
  cast(world,'fire:out');
  assert(world.entities.target.properties.burning > 0);
  engine.tickMaterials(world);
  assert(world.entities.target.properties.integrity < 100,'ignition causes real material damage');
  cast(world,'fire:in');
  assert.equal(world.entities.target.properties.heat,0);assert.equal(world.entities.target.properties.burning,0);
  results.push('Heat and cooling share ignition, ongoing damage and extinguishing with existing world materials');

  world = fixture({heat:3,burning:3});
  cast(world,'water:out');
  assert.equal(world.entities.player.stock.water,1);
  assert.equal(world.entities.target.properties.heat,0);
  assert.equal(world.entities.target.properties.burning,0);
  assert(world.entities.target.properties.smoke > 0);
  cast(world,'water:out');
  assert.equal(world.entities.target.properties.moisture,3);
  cast(world,'water:in');
  assert.equal(world.entities.target.properties.moisture,0);
  assert.equal(world.entities.player.stock.water,1,'one 3-unit moisture transfer yields exactly one item');
  assert.equal(colors.colorOperationAction(world,'player','target','water:in'),undefined);
  results.push('Water is transferred conservatively; heat absorbs moisture and creates steam through the common reducer');

  const dry = fixture(), wet = fixture({moisture:3}), insulated = fixture({moisture:3});
  cast(insulated,'electric:in');
  assert.equal(insulated.entities.target.properties.insulation,1);
  cast(dry,'electric:out');cast(wet,'electric:out');cast(insulated,'electric:out');
  assert(wet.entities.target.properties.integrity < dry.entities.target.properties.integrity);
  assert(insulated.entities.target.properties.integrity > wet.entities.target.properties.integrity,'insulation must have a real conductivity consumer');
  assert.equal(wet.entities.target.properties.charge,0,'charge is spent rather than a hidden puzzle flag');
  results.push('Electrical damage depends on moisture and real insulation; discharge does not leave an invented puzzle charge');

  world = fixture({hardness:1});
  const plain = {...world.entities.target.properties};
  cast(world,'iron:out');
  const hardened = {...world.entities.target.properties};
  engine.applyMaterialInfluence(plain,{},'force',8);
  engine.applyMaterialInfluence(hardened,{},'force',8);
  assert(hardened.integrity > plain.integrity);
  cast(world,'iron:in');assert.equal(world.entities.target.properties.hardness,0);
  results.push('Hardening and softening alter the same force resistance used by props and combat');

  world = fixture({soil:1});world.entities.target.kind='terrain';
  assert(spatial.walkable(world,'field',world.entities.target.pos));
  cast(world,'earth:out');
  assert.equal(world.entities.player.stock['i-life-ore'],1);
  assert(!spatial.walkable(world,'field',world.entities.target.pos),'compacted ground changes actual pathing');
  cast(world,'earth:in');
  assert(spatial.walkable(world,'field',world.entities.target.pos));
  world = fixture({maxHp:100});world.entities.target.kind='actor';
  cast(world,'earth:out');
  assert(statuses.actionRestriction(world.entities.target,true));
  cast(world,'earth:in');assert.equal(statuses.actionRestriction(world.entities.target,true),undefined);
  results.push('Earth consumes physical material for cover, changes actual collision, and uses the existing movement restriction on bodies');

  world = fixture({smoke:3});
  cast(world,'wind:out');
  assert.deepEqual(world.entities.target.pos,{x:3,y:3});assert.equal(world.entities.target.properties.smoke,0);
  cast(world,'wind:in');assert.deepEqual(world.entities.target.pos,{x:2,y:3});
  assert(world.events.some(x=>x.kind==='move'&&x.actorId==='player'));
  world.entities.target.properties.mass=30;
  assert.equal(colors.colorOperationAction(world,'player','target','wind:out'),undefined);
  world.entities.target.properties.mass=1;
  world.spaces.field.tiles[3][3]='wall';
  assert.equal(colors.colorOperationAction(world,'player','target','wind:out'),undefined);
  results.push('Wind moves actual entities one cardinal cell and obeys mass, walls and occupancy');

  world = fixture();
  const plot = world.entities.target;
  plot.kind='plot';plot.tags=['life-site'];
  plot.production={id:'crop',recipeId:'crop-light',producerId:'player',startedTurn:0,duration:10,settled:false,output:{},level:1,colorValue:0,upper:false,automaticCare:false,careProperty:'light',
    plot:{cropId:'crop-light',plantedTurn:0,lastTickTurn:0,growTurns:10,waterAt:[0,5],wateredCount:0,growthProgress:0,growthVersion:2,bonus:0}};
  cast(world,'light:out');
  const run={plots:{},lifeCooldowns:{}};
  life.settleLifeWorld(run,world,0);
  assert.equal(plot.production.plot.wateredCount,1,'light changes actual production care');
  plot.production.careProperty='attention';plot.production.plot.wateredCount=0;
  cast(world,'light:in');life.settleLifeWorld(run,world,0);
  assert.equal(plot.production.plot.wateredCount,1,'attention changes actual production care');
  results.push('Light and attention improve actual production batches through existing care settlement');

  world = fixture({maxHp:100});world.entities.target.kind='actor';
  cast(world,'dark:in');
  assert(statuses.actionRestriction(world.entities.target),'calming causes actual sleep');
  cast(world,'light:in');
  assert.equal(statuses.actionRestriction(world.entities.target),undefined);
  cast(world,'dark:out');
  const observer=entity('observer','actor',5,3,{maxHp:100});world.entities.observer=observer;
  assert(!spatial.hasSight(world,observer,world.entities.target),'the veil hides the target from real line of sight');
  results.push('Calming and waking share real status restrictions; veils affect the same sight checks as field smoke');

  world = fixture({flammability:2});world.entities.target.ownerId='witness';
  const witness=entity('witness','actor',2,2,{maxHp:100});
  witness.agent=social.createSocialProfile('human','Craftsman',{homeNodeId:'field',turn:0});
  world.entities.witness=witness;
  cast(world,'fire:out');social.processSocialFacts(world);
  assert((witness.agent.relations.player?.trust??0)<0);
  assert(witness.agent.beliefs.some(x=>x.subjectId==='player'));
  results.push('Witnesses judge dangerous material changes from ordinary world facts rather than COLOR-specific reputation hooks');

  world = fixture();
  world.entities.player.properties.mana=0;
  let snapshot=JSON.stringify(world);
  const offer=colors.colorOperationOffers(world,'player','target','electric').find(x=>x.direction==='out');
  assert(!offer.enabled);assert.equal(JSON.stringify(world),snapshot,'affordances are read-only');
  const action=colors.colorOperationAction(world,'player','target','electric:out');
  assert(!engine.resolveInteraction(world,'player','target',action).ok);
  assert.equal(JSON.stringify(world),snapshot,'failed mana costs are atomic');
  world.entities.player.properties.mana=3;world.entities.player.stock.water=0;snapshot=JSON.stringify(world);
  assert(!engine.resolveInteraction(world,'player','target',colors.colorOperationAction(world,'player','target','water:out')).ok);
  assert.equal(JSON.stringify(world),snapshot,'failed material costs do not spend mana');
  world.entities.player.properties['status:sleep']=1;
  assert(colors.colorOperationDisabled(world,'player','target',action));
  results.push('Queries do not mutate the world; insufficient mana or materials consume nothing; actor restrictions remain active');

  for(const record of records.FIELD_RECORDS) {
    const object={...entity(record.id,'resource',2,3),recordId:record.id,properties:{integrity:100,...record.properties}};
    assert(readings.fieldReading(object)?.legible,record.id+' should not require a prescribed elemental answer');
  }
  assert.equal(used.size,16,'every authored COLOR operation was executed through the common engine');
  results.push('All authored records support ordinary reading; no water-only or COLOR-ID quest locks remain');
  console.log(JSON.stringify({passed:results.length,operations:used.size,results},null,2));
} finally {
  await server.close();globalThis.window=oldWindow;globalThis.localStorage=oldStorage;
}
