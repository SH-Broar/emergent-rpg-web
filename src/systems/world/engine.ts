import { changeStatus } from './status';
import { syncEntityForm } from './form-rules';
import type { ColorProfile, InteractionAction, InteractionResult, InteractionWorld, WorldEntity, WorldFact } from './types';
import { iGa } from '../josa';
import { resourceTags } from './resources';
import { cardinal, createSightTest, distance, entitiesAt, hasSight, positionKey, walkable } from './spatial';

export interface PropertyChange { property: string; before: number; after: number }
const finite = (n: number) => Number.isFinite(n);
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
/** Match whole-HP display to combat rounding. */
export function displayedHp(properties:Record<string,number>):number {return Math.max(0,Math.ceil((properties.integrity??100)*(properties.maxHp??100)/100-1e-8));}
/** Remove only numerical dust, measured in actual HP rather than percentage. */
export function normalizeIntegrity(properties:Record<string,number>):void {
 const hp=(properties.integrity??100)*(properties.maxHp??100)/100;
 if(hp>0&&hp<1e-7)properties.integrity=0;
}
export function conductivityMultiplier(properties: Record<string, number>): number {
  return (1 + (properties.conductivity ?? 0) + Math.min(1, (properties.moisture ?? 0) / 3)) / (1 + Math.max(0, properties.insulation ?? 0));
}

/** Property reactions have no knowledge of card, crop, profession or action IDs. */
export function applyMaterialInfluence(properties: Record<string, number>, colors: ColorProfile, property: string, amount: number): PropertyChange[] {
  if (!finite(amount)) return [];
  if (property === 'integrity' && amount > 0 && (properties['status:feral-heavy'] ?? 0) > 0) return [];
  const before = { ...properties };
  const max = ['work', 'practice', 'lifeLevel', 'mana'].includes(property) ? Number.MAX_SAFE_INTEGER : 100;
  if (property.startsWith('status:')) changeStatus(properties, property.slice(7), amount);
  else properties[property] = clamp((properties[property] ?? 0) + amount, 0, max);
  // Moisture absorbs heat. The same rule handles a field, a barrel and a combat tile.
  if ((properties.moisture ?? 0) > 0 && (properties.heat ?? 0) > 0) {
    const absorbed = Math.min(properties.moisture!, properties.heat!);
    properties.moisture! -= absorbed;
    properties.heat! -= absorbed;
    properties.smoke = Math.max(properties.smoke ?? 0, 2);
    properties.burning = 0;
  }
  if (property === 'heat' && (properties.heat ?? 0) > 0 && (properties.flammability ?? 0) > 0) {
    // Fire classification describes heat affinity, not fuel to spend.
    const tolerance = (properties.heatTolerance ?? 0) + (colors.fire ?? 0) / 25;
    if (properties.heat! > tolerance) properties.burning = Math.max(properties.burning ?? 0, properties.heat!);
  }
  if (property === 'moisture' && (properties.moisture ?? 0) > 0) properties.burning = 0;
  if (property === 'force' && amount > 0) {
    const resistance = (properties.hardness ?? 0) + (colors.iron ?? 0) / 20;
    properties.integrity = clamp((properties.integrity ?? 100) - Math.max(0, amount - resistance));
    properties.force = 0;
  }
  if (property === 'charge' && amount > 0) {
    const conduction = conductivityMultiplier(properties);
    properties.integrity = clamp((properties.integrity ?? 100) - amount * conduction);
    properties.charge = 0;
  }
  // Living actors use HP-unit guard and incoming status modifiers for every material attack.
  if (properties.maxHp && ['force','charge'].includes(property) && amount > 0) {
    let damage = Math.max(0, (before.integrity ?? 100) - (properties.integrity ?? 100)) * properties.maxHp / 100;
    if (properties['status:vulnerable']) damage *= 1.5;
    const guard = Math.min(before.guard ?? 0, damage);
    properties.guard = Math.max(0, (before.guard ?? 0) - guard);
    properties.integrity = clamp((before.integrity ?? 100) - Math.max(0, Math.ceil(damage - guard - 1e-8)) / properties.maxHp * 100);
  }
  normalizeIntegrity(properties);
  // Protected people are defeated without creating a dead body; the field handles their retreat.
  if(properties.defeatProtected&&(before.integrity??100)>0&&(properties.integrity??100)<=0){
    properties.integrity=100/Math.max(1,properties.maxHp??100);properties.defeatPending=1;
  }
  if ((properties.integrity ?? 100) < (before.integrity ?? 100)) properties['status:sleep'] = 0;
  if ((properties.integrity ?? 100) <= 0 || properties.defeatPending) { properties.burning = 0; properties.heat = 0; }
  return Object.keys(properties).filter(key => (before[key] ?? 0) !== properties[key])
    .map(key => ({ property: key, before: before[key] ?? 0, after: properties[key]! }));
}

function visibleWitnesses(world: InteractionWorld, nodeId: string, actorId?: string, targetId?: string): string[] {
  const obscured = Object.values(world.entities).some(e => e.nodeId === nodeId && (e.properties.smoke ?? 0) >= 2);
  return Object.values(world.entities).filter(e => e.kind === 'actor' && e.nodeId === nodeId
    && (e.properties.integrity ?? 100) > 0 && (!obscured || e.id === actorId || !!world.spaces?.[nodeId])
    && (!targetId || !world.entities[targetId] || hasSight(world, e, world.entities[targetId]!))).map(e => e.id);
}

export function recordFact(world: InteractionWorld, fact: Omit<WorldFact, 'id' | 'witnesses'>): WorldFact {
  const saved: WorldFact = { ...fact, pos: fact.pos ?? (world.entities[fact.targetId]?.pos ? {...world.entities[fact.targetId]!.pos!} : undefined), targetTags: fact.targetTags ?? [...(world.entities[fact.targetId]?.tags ?? [])],
    targetKind: fact.targetKind ?? world.entities[fact.targetId]?.kind,
    resourceTags: fact.resourceTags ?? resourceTags(fact.resourceId),
    id: ++world.sequence, witnesses: visibleWitnesses(world, fact.nodeId, fact.actorId, fact.targetId) };
  world.events.push(saved);
  if (world.events.length > 240) world.events.splice(0, world.events.length - 240);
  for (const id of saved.witnesses) {
    const known = world.knowledge[id] ??= { targets: {}, facts: [] };
    known.facts.push({ ...saved, witnesses: [...saved.witnesses] });
    if (known.facts.length > 80) known.facts.splice(0, known.facts.length - 80);
  }
  return saved;
}

/** Fresh local observations replace stale local sightings, without exposing minds or remote changes. */
export function observeWorld(world: InteractionWorld, actorId: string): void {
  const actor = world.entities[actorId];
  if (!actor) return;
  const known = world.knowledge[actorId] ??= { targets: {}, facts: [] };
  for (const old of Object.values(known.targets)) if (old.nodeId === actor.nodeId) delete known.targets[old.id];
  const obscured = Object.values(world.entities).some(e => e.nodeId === actor.nodeId && (e.properties.smoke ?? 0) >= 2);
  const sees=createSightTest(world,actor);
  for (const e of Object.values(world.entities)) {
    if (e.nodeId !== actor.nodeId || e.carriedBy && e.carriedBy !== actorId || (obscured && e.id !== actorId && !world.spaces?.[actor.nodeId]) || !sees(e)) continue;
    const publicProperties = ['integrity', 'moisture', 'heat', 'burning', 'smoke', 'flammability', 'conductivity', 'hardness', 'work', 'workRequired', 'irrigation', 'safety', 'light', 'attention', 'heatTolerance', 'laborPower', 'insulation', 'solid', 'mass'];
    if (e.id === actorId) publicProperties.push('mana', 'lifeLevel', 'practice');
    known.targets[e.id] = {
      id: e.id, name: e.name, kind: e.kind, nodeId: e.nodeId, turn: world.turn,
      colors: { ...e.colors }, properties: Object.fromEntries(Object.entries(e.properties).filter(([key]) => publicProperties.includes(key))),
      tags: [...e.tags], stock: Object.fromEntries(Object.entries(e.stock).filter(([,n]) => n > 0)),
      ownerId: e.ownerId, ownerName: e.ownerId ? world.entities[e.ownerId]?.name : undefined,
      species: e.agent?.species, profession: e.agent?.profession, labor: e.labor ?? 0,
    };
  }
}

function sideEntity(actor: WorldEntity, target: WorldEntity, side = 'target') { return side === 'actor' ? actor : target; }

/** Material reactions are identical for gestures, creatures and the passing of time. */
export function influenceEntity(world: InteractionWorld, entity: WorldEntity, property: string, amount: number, actorId?: string, message = `${entity.name}의 상태가 바뀌었다.`): WorldFact[] {
  const damage = property === 'integrity' && amount < 0 || ['force', 'charge'].includes(property) && amount > 0;
  const sourceActor = actorId ? world.entities[actorId] : undefined;
  if (damage && entity.creature?.rank === 'boss' && (!sourceActor || sourceActor.kind !== 'actor')) return [];
  if (damage && entity.creature?.definitionId === 'bs-act-1-anchor' && !entity.creature.engaged) return [];
  const wasAlive = (entity.properties.integrity ?? 100) > 0;
  const facts = applyMaterialInfluence(entity.properties, entity.colors, property, amount).map(change => recordFact(world, {
    turn: world.turn, nodeId: entity.nodeId, actorId, targetId: entity.id, kind: 'property', ...change,
    ownerId: entity.ownerId, labor: entity.labor ?? 0, message,
  }));
  if(property==='waterSource'&&entity.properties.waterSource&&entity.kind!=='actor'&&!entity.renewable&&(entity.properties.integrity??100)>0){
   entity.renewable={resourceId:'water',capacity:6,interval:1,nextTurn:world.turn+1};entity.stock.water=(entity.stock.water??0)+6;
   entity.tags=[...new Set([...entity.tags,'well','storage'])];entity.name='작은 샘';
  }
  syncEntityForm(entity,property,actorId);
  const source=actorId?world.entities[actorId]:undefined;
  if(source&&source.id!==entity.id&&entity.properties['status:thorns']&&['force','charge'].includes(property)&&facts.some(f=>f.property==='integrity'&&f.after!<f.before!)) {
    facts.push(...influenceEntity(world,source,'integrity',-entity.properties['status:thorns']/(source.properties.maxHp??100)*100,entity.id));
  }
  if (wasAlive && (entity.properties.integrity ?? 100) <= 0) {
    const stock = entity.stock;
    entity.production = undefined;
    entity.stock = {};
    if (entity.carriedBy) {
      const carrier = world.entities[entity.carriedBy];
      entity.pos = carrier?.pos ? { ...carrier.pos } : undefined;
      entity.carriedBy = undefined;
    }
    const space = world.spaces?.[entity.nodeId];
    const liquid = Object.entries(stock).filter(([id]) => resourceTags(id).includes('water')).reduce((n, [, count]) => n + count, 0);
    if (space && entity.pos && liquid > 0 && (entity.properties.spillOnBreak ?? 0) > 0) {
      const cells = [entity.pos, ...cardinal(entity.pos)].filter(p => space.tiles[p.y]?.[p.x] && space.tiles[p.y]![p.x] !== 'wall');
      for (const pos of cells) {
        const id = `${space.id}:residue:${positionKey(pos)}`;
        const floor = world.entities[id] ??= { id, name: '바닥', kind: 'terrain', nodeId: space.id, pos: { ...pos }, colors: {}, tags: ['ground', 'storage', 'shared'], stock: {}, properties: { integrity: 100 } };
        for (const touched of [floor, ...entitiesAt(world, space.id, pos).filter(e => e.id !== id && e.id !== entity.id)]) {
          if ((touched.properties.integrity ?? 100) > 0) facts.push(...influenceEntity(world, touched, 'moisture', Math.min(6, liquid), actorId, '물이 퍼졌다.'));
        }
      }
    }
  }
  return facts;
}

export function interactionDisabled(world: InteractionWorld, actorId: string, targetId: string, action: InteractionAction): string | undefined {
  const actor = world.entities[actorId], target = world.entities[targetId];
  if (!actor || !target) return '대상을 찾을 수 없다.';
  if (!finite(action.duration) || !Number.isInteger(action.duration) || action.duration < 0) return '잘못된 행동 시간이다.';
  if ((actor.properties.integrity ?? 100) <= 0) return '행동할 수 없는 상태다.';
  const movement = action.effects.length > 0 && action.effects.every(e => e.kind === 'move' || e.kind === 'relocate' && e.side === 'actor');
  if (!movement && actor.nodeId !== target.nodeId) return '현재 장소에 없는 대상이다.';
  const targetPos = target.pos ?? (target.carriedBy ? world.entities[target.carriedBy]?.pos : undefined);
  if (!movement && actor.pos && targetPos && world.spaces?.[actor.nodeId] && distance(actor.pos, targetPos) > (action.reach ?? 1)) return '조금 더 가까이.';
  if (!movement && (target.properties.integrity ?? 100) <= 0 && !action.effects.every(e => e.kind === 'signal')) return '대상이 파괴되었다.';
  if (action.requires?.tags?.some(tag => !target.tags.includes(tag))) return '대상에 필요한 성질이 없다.';
  for (const [key, value] of Object.entries(action.requires?.min ?? {})) if ((target.properties[key] ?? 0) < value) return '아직 필요한 상태에 이르지 않았다.';
  for (const [key, value] of Object.entries(action.requires?.max ?? {})) if ((target.properties[key] ?? 0) > value) return '지금은 이 행동이 필요하지 않다.';
  for (const [key, value] of Object.entries(action.requires?.actorMin ?? {})) if ((actor.properties[key] ?? 0) < value) return '필요한 작업 능력이 부족하다.';
  // Simulate the entire inventory transaction first; a later invalid effect never consumes earlier inputs.
  const stock = new Map<string, Record<string, number>>([[actor.id, { ...actor.stock }], [target.id, { ...target.stock }]]);
  for (const effect of action.effects) {
    if (effect.kind === 'transfer') {
      if (!finite(effect.quantity) || effect.quantity <= 0 || !Number.isInteger(effect.quantity)) return '수량이 올바르지 않다.';
      const from = stock.get(sideEntity(actor, target, effect.from).id)!, to = stock.get(sideEntity(actor, target, effect.to).id)!;
      if ((from[effect.resourceId] ?? 0) < effect.quantity) return '필요한 재고가 부족하다.';
      from[effect.resourceId] = (from[effect.resourceId] ?? 0) - effect.quantity;
      to[effect.resourceId] = (to[effect.resourceId] ?? 0) + effect.quantity;
    } else if (effect.kind === 'stock') {
      if (!finite(effect.amount) || !Number.isInteger(effect.amount)) return '수량이 올바르지 않다.';
      const inventory = stock.get(sideEntity(actor, target, effect.side).id)!;
      inventory[effect.resourceId] = (inventory[effect.resourceId] ?? 0) + effect.amount;
      if (inventory[effect.resourceId]! < 0) return '필요한 재료가 부족하다.';
    } else if (effect.kind === 'relocate') {
      const entity = sideEntity(actor, target, effect.side);
      if (!entity.pos || distance(entity.pos, effect.pos) !== 1 || !walkable(world, entity.nodeId, effect.pos, entity.id)) return '막힌 곳이다.';
    } else if (effect.kind === 'carry') {
      if (effect.held) {
        if (target.id === actor.id || target.kind === 'actor' || !(target.properties.portable ?? 0) || target.carriedBy || Object.values(world.entities).some(e => e.carriedBy === actor.id)) return '들 수 없다.';
        if ((target.properties.mass ?? 1) > (actor.properties.carryCapacity ?? 3)) return '너무 무겁다.';
      } else if (target.carriedBy !== actor.id || !effect.pos || !actor.pos || distance(actor.pos, effect.pos) > (action.reach ?? 1) || !walkable(world, actor.nodeId, effect.pos, target.id)) return '여기에는 내려놓을 수 없다.';
    } else if ((effect.kind === 'influence' || effect.kind === 'work') && !finite(effect.amount)) return '영향량이 올바르지 않다.';
    else if (effect.kind === 'production' && effect.batch && target.production) return '이미 생산 중이다.';
  }
  if (action.effects.some(e => e.kind === 'work') && target.workRecipe) {
    const recipe = target.workRecipe;
    if (!recipe.repeat && (target.properties.work ?? 0) >= recipe.required) return '이미 작업을 마쳤다.';
    for (const [id, count] of Object.entries(recipe.inputs)) if ((stock.get(target.id)![id] ?? 0) < count) return '작업장에 가공 재료가 부족하다.';
  }
  return undefined;
}

export function resolveInteraction(world: InteractionWorld, actorId: string, targetId: string, action: InteractionAction): InteractionResult {
  const reason = interactionDisabled(world, actorId, targetId, action);
  if (reason) return { ok: false, reason, message: reason, duration: 0, facts: [] };
  const actor = world.entities[actorId]!, target = world.entities[targetId]!;
  const facts: WorldFact[] = [];
  const fact = (entity: WorldEntity, detail: Partial<WorldFact> & Pick<WorldFact, 'kind' | 'message'>) => {
    facts.push(recordFact(world, { turn: world.turn, nodeId: entity.nodeId, actorId, targetId: entity.id,
      ownerId: entity.ownerId, labor: entity.labor ?? 0, ...detail }));
  };
  const influence = (entity: WorldEntity, property: string, amount: number) => {
    if (property.startsWith('color:')) {
      const color = property.slice(6) as keyof ColorProfile;
      if (!['fire','water','electric','iron','earth','wind','light','dark'].includes(color)) return;
      const before = entity.colors[color] ?? 0;
      entity.colors[color] = clamp(before + amount);
      fact(entity, { kind: 'property', property, before, after: entity.colors[color], message: `${entity.name}의 성질에 경험이 쌓였다.` });
      return;
    }
    const priorPractice = entity.properties.practice ?? 0;
    facts.push(...influenceEntity(world, entity, property, amount, actorId, `${actor.name}: ${target.name} — ${action.label}`));
    if (property === 'practice' && amount > 0) {
      entity.properties.lifeLevel = (entity.properties.lifeLevel ?? 1)
        + Math.floor((entity.properties.practice ?? 0) / 3) - Math.floor(priorPractice / 3);
    }
  };
  for (const effect of action.effects) {
    switch (effect.kind) {
      case 'influence': influence(sideEntity(actor, target, effect.side), effect.property, effect.amount); break;
      case 'transfer': {
        const from = sideEntity(actor, target, effect.from), to = sideEntity(actor, target, effect.to);
        const before = target.stock[effect.resourceId] ?? 0;
        from.stock[effect.resourceId] = (from.stock[effect.resourceId] ?? 0) - effect.quantity;
        to.stock[effect.resourceId] = (to.stock[effect.resourceId] ?? 0) + effect.quantity;
        fact(target, { kind: 'transfer', resourceId: effect.resourceId, quantity: effect.quantity, before, after: target.stock[effect.resourceId] ?? 0,
          message: `${actor.name}: ${target.name} — ${action.label} (${effect.quantity}개)` });
        break;
      }
      case 'stock': {
        const entity = sideEntity(actor, target, effect.side);
        const before = entity.stock[effect.resourceId] ?? 0;
        entity.stock[effect.resourceId] = before + effect.amount;
        fact(entity, { kind: 'production', resourceId: effect.resourceId, quantity: Math.abs(effect.amount), before, after: entity.stock[effect.resourceId], message: `${entity.name} — ${action.label}` });
        break;
      }
      case 'work': {
        const before = target.properties.work ?? 0;
        target.properties.work = before + Math.max(0, effect.amount);
        target.labor = (target.labor ?? 0) + Math.max(0, effect.amount) / 10;
        fact(target, { kind: 'work', property: 'work', before, after: target.properties.work, message: `${actor.name}: ${target.name}의 작업이 진전되었다.` });
        const recipe = target.workRecipe;
        if (recipe && target.properties.work >= recipe.required) {
          for (const [id, count] of Object.entries(recipe.inputs)) target.stock[id] = (target.stock[id] ?? 0) - count;
          for (const [id, count] of Object.entries(recipe.outputs)) target.stock[id] = (target.stock[id] ?? 0) + count;
          for (const [key, value] of Object.entries(recipe.changes ?? {})) influence(target, key, value);
          target.properties.work = recipe.repeat ? target.properties.work - recipe.required : recipe.required;
          fact(target, { kind: 'production', message: `${actor.name}: ${target.name}의 작업을 완성했다.` });
        }
        break;
      }
      case 'move': {
        const origin = actor.nodeId;
        const subject = actorId === 'player' ? '내가' : `${actor.name}${iGa(actor.name)}`;
        fact(actor, { kind: 'move', message: `${subject} 다른 장소로 이동했다.` });
        actor.nodeId = effect.nodeId;
        if (origin !== actor.nodeId) fact(actor, { kind: 'move', message: `${subject} 이곳에 도착했다.` });
        break;
      }
      case 'relocate': {
        const entity = sideEntity(actor, target, effect.side);
        entity.pos = { ...effect.pos };
        fact(entity, { kind: 'move', message: `${entity.name}의 위치가 바뀌었다.` });
        break;
      }
      case 'carry': {
        if (effect.held) { target.carriedBy = actor.id; target.pos = undefined; }
        else { target.carriedBy = undefined; target.nodeId = actor.nodeId; target.pos = { ...effect.pos! }; }
        fact(target, { kind: 'move', message: `${target.name}: ${effect.held ? '들림' : '놓임'}` });
        break;
      }
      case 'signal': fact(target, { kind: 'signal', message: effect.message, sourceFactId: effect.sourceFactId }); break;
      case 'production': {
        target.production = effect.batch ? JSON.parse(JSON.stringify(effect.batch)) : undefined;
        if (effect.batch) target.ownerId ??= actorId;
        fact(target, { kind: 'production', message: `${actor.name}: ${target.name} — ${action.label}` });
        break;
      }
    }
  }
  if (actor.agent) for (const [need, amount] of Object.entries(action.satisfies ?? {})) {
    const key = need as keyof typeof actor.agent.needs;
    actor.agent.needs[key] = clamp(actor.agent.needs[key] - amount, 0, 1);
  }
  for (const observer of Object.values(world.entities)) if (observer.kind === 'actor' && [actor.nodeId, target.nodeId].includes(observer.nodeId)) observeWorld(world, observer.id);
  return { ok: true, message: `${target.name}: ${action.label}`, duration: action.duration, facts };
}

/** Time applies the same property reducer as actions; no action-to-action reaction table. */
export function tickMaterials(world: InteractionWorld, spatial?: 'only' | 'exclude', activeIds?: ReadonlySet<string>): void {
  // Snapshot sources: a new fire cannot cross an entire field in one tick.
  const entities = activeIds ? [...activeIds].map(id=>world.entities[id]!).filter(Boolean) : Object.values(world.entities);
  const sources = entities.filter(e => spatial !== 'exclude' && world.spaces?.[e.nodeId] && e.pos && !e.carriedBy && (e.properties.integrity ?? 100) > 0)
    .map(e => ({ id: e.id, nodeId: e.nodeId, pos: { ...e.pos! }, heat: e.properties.heat ?? 0, moisture: e.properties.moisture ?? 0, burning: e.properties.burning ?? 0 }));
  const contacts=new Map<string,WorldEntity[]>(),spaces=new Set(sources.map(s=>s.nodeId));
  for(const e of Object.values(world.entities)) if(e.pos&&!e.carriedBy&&spaces.has(e.nodeId)) {const key=`${e.nodeId}:${positionKey(e.pos)}`;contacts.set(key,[...(contacts.get(key)??[]),e]);}
  for (const source of sources) {
    const cells = source.burning > 0 ? [source.pos, ...cardinal(source.pos)] : [source.pos];
    for (const pos of cells) for (const target of contacts.get(`${source.nodeId}:${positionKey(pos)}`)??[]) {
      if (target.id === source.id || (target.properties.integrity ?? 100) <= 0) continue;
      const contact = distance(source.pos, pos) === 0;
      if (contact && source.moisture > (target.properties.moisture ?? 0)) influenceEntity(world, target, 'moisture', Math.min(3, source.moisture - (target.properties.moisture ?? 0)));
      if ((source.burning > 0 || contact && source.heat > 0) && source.heat > (target.properties.heat ?? 0)) influenceEntity(world, target, 'heat', Math.min(2, source.heat - (target.properties.heat ?? 0)));
    }
  }
  for (const entity of entities) {
    const positioned = !!world.spaces?.[entity.nodeId];
    if (spatial === 'only' && !positioned || spatial === 'exclude' && positioned) continue;
    if ((entity.properties.integrity ?? 100) <= 0) continue;
    if ((entity.properties.burning ?? 0) > 0) {
      influenceEntity(world, entity, 'integrity', -3, undefined, `${entity.name}${iGa(entity.name)} 타고 있다.`);
    }
    for (const key of ['smoke','heat','burning']) if ((entity.properties[key] ?? 0) > 0) entity.properties[key]!--;
    if (entity.renewable && entity.renewable.nextTurn <= world.turn) {
      const source = entity.renewable;
      if (source.interval > 0) {
        entity.stock[source.resourceId] = Math.max(entity.stock[source.resourceId] ?? 0, source.capacity);
        source.nextTurn += (Math.floor((world.turn - source.nextTurn) / source.interval) + 1) * source.interval;
      }
    }
  }
}
