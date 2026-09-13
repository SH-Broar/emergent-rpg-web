import type { RunState } from '@/data/schemas';
import {
  activityForNode, cropDisplayName, getCrop, type LifeActivityDef,
} from '@/systems/life-catalog';
import {
  canCareForPlot, lifeCapabilities, productionDuration, productionQualityBonus,
  productionYield, projectedPlot, type ProductionMode,
} from '@/systems/life-production';
import { applyMaterialInfluence, recordFact } from './engine';
import type { InteractionAction, InteractionWorld, ProductionBatch, WorldEntity } from './types';

export const lifeEntityId = (nodeId: string): string => `life:${nodeId}`;

function fixedRoll(key: string): number {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

function activityOf(entity: WorldEntity): LifeActivityDef {
  return activityForNode(entity.nodeId, entity.tags.find(tag => tag.startsWith('region:'))?.slice(7));
}

function syncFoodTag(entity: WorldEntity): void {
  const recipe = entity.production?.recipeId;
  const food = recipe ? ['crop-grain', 'crop-mush', 'crop-snare', 'crop-dry'].includes(recipe)
    : ['earth', 'dark', 'wind', 'light', 'water'].includes(activityOf(entity).element);
  if (food && !entity.tags.includes('food')) entity.tags.push('food');
  if (!food && entity.tags.includes('food')) entity.tags = entity.tags.filter(tag => tag !== 'food');
}

function careProperty(cropId: string): string {
  return cropId === 'crop-char' ? 'heat' : cropId === 'crop-dry' ? 'light'
    : cropId === 'crop-snare' ? 'attention' : 'moisture';
}

function irrigationFor(world: InteractionWorld, entity: WorldEntity): boolean {
  const irrigation = world.entities['ilu-irrigation'];
  return entity.tags.includes('region:iluneon') && !!irrigation
    && (irrigation.properties.integrity ?? 0) > 0 && (irrigation.properties.irrigation ?? 0) > 0;
}

/** Existing saves become real sites once; future empty/destroyed sites are never recreated. */
export function ensureLifeSite(run: RunState, world: InteractionWorld, nodeId: string, region?: string): WorldEntity {
  const id = lifeEntityId(nodeId);
  const activity = activityForNode(nodeId, region);
  const entity = world.entities[id] ??= {
    id, name: activity.type === 'delayed' ? `${activity.name} 생산지` : `${activity.name} 채집지`,
    kind: activity.type === 'delayed' ? 'plot' : 'resource', nodeId,
    colors: { [activity.element]: 60 }, tags: ['life-site', ...(region ? [`region:${region}`] : [])],
    properties: { integrity: 100, moisture: 0, heat: 0, light: 0, attention: 0 },
    stock: {}, labor: 0,
  };
  if (!entity.tags.includes('life-site')) entity.tags.push('life-site');
  if (region && !entity.tags.includes(`region:${region}`)) entity.tags.push(`region:${region}`);
  if (entity.properties.lifeMigrated === 1) return entity;
  entity.properties.lifeMigrated = 1;
  entity.kind = activity.type === 'delayed' ? 'plot' : 'resource';

  if (Object.keys(entity.colors).length === 0) entity.colors[activity.element] = 60;
  if (entity.properties.integrity === undefined) entity.properties.integrity = 100;
  entity.properties.flammability ??= activity.type === 'delayed' && activity.element !== 'fire' ? 10 : 0;
  entity.properties.heatTolerance ??= activity.element === 'fire' ? 30 : 0;
  for (const property of ['moisture', 'heat', 'light', 'attention']) entity.properties[property] ??= 0;
  const oldPlot = run.plots?.[nodeId];
  if (oldPlot && !entity.production) {
    const plot = projectedPlot(oldPlot, world.turn);
    const crop = getCrop(plot.cropId);
    if (crop) {
      entity.ownerId ??= 'player';
      entity.labor = Math.max(entity.labor ?? 0, 1 + plot.wateredCount);
      entity.production = {
        id: `legacy:${nodeId}:${plot.plantedTurn}`, recipeId: plot.cropId,
        producerId: 'player', startedTurn: world.turn - plot.growthProgress, duration: plot.growTurns,
        settled: false, output: {}, plot, level: run.lifeLevel ?? 1,
        colorValue: run.colors[crop.element] ?? 0, upper: false,
        qualityRoll: fixedRoll(`legacy:${nodeId}:${plot.plantedTurn}`),
        automaticCare: lifeCapabilities(run.lifeLevel ?? 1).automaticCare,
        careProperty: careProperty(crop.id),
      };
    }
  }
  if (activity.type === 'repeat' && !entity.renewable) {
    const readyAt = run.lifeCooldowns?.[nodeId] ?? world.turn;
    entity.renewable = { resourceId: activity.lowerItemId!, capacity: 2, interval: 8, nextTurn: Math.max(readyAt, world.turn + (readyAt <= world.turn ? 8 : 0)) };
    if (readyAt <= world.turn && Object.keys(entity.stock).length === 0) entity.stock[activity.lowerItemId!] = 2;
  }
  syncFoodTag(entity);
  return entity;
}

export function ensureLifeEntities(run: RunState, world: InteractionWorld): void {
  ensureLifeSite(run, world, 'n-ilu-larder', 'iluneon');
  for (const nodeId of Object.keys(run.plots ?? {})) ensureLifeSite(run, world, nodeId);
  for (const nodeId of Object.keys(run.lifeCooldowns ?? {})) ensureLifeSite(run, world, nodeId);
  for (const entity of Object.values(world.entities)) {
    if (entity.tags.includes('life-site')) {
      ensureLifeSite(run, world, entity.nodeId, entity.tags.find(tag => tag.startsWith('region:'))?.slice(7));
    }
  }
}

/** A recipe completes into the site's own inventory, irrespective of who later takes it. */
export function settleLifeWorld(run: RunState, world: InteractionWorld, turn: number): void {
  run.plots ??= {};
  run.lifeCooldowns ??= {};
  for (const entity of Object.values(world.entities)) {
    if (!entity.tags.includes('life-site')) continue;
    if ((entity.properties.integrity ?? 0) <= 0) {
      if (entity.production) {
        recordFact(world, { turn, nodeId: entity.nodeId, targetId: entity.id, kind: 'production',
          ownerId: entity.ownerId, labor: entity.labor ?? 0, message: `${entity.name}의 생산이 파괴되어 멈췄다.` });
        entity.production = undefined;
        entity.stock = {};
      }
      delete run.plots[entity.nodeId];
      continue;
    }
    syncFoodTag(entity);
    const batch = entity.production;
    if (batch?.plot && !batch.settled) {
      const plot = projectedPlot(batch.plot, turn);
      const property = batch.careProperty ?? 'moisture';
      const opportunities = plot.waterAt.filter(at => at <= plot.growthProgress).length;
      if (batch.automaticCare || irrigationFor(world, entity)) {
        const threshold = opportunities * 3;
        if ((entity.properties[property] ?? 0) < threshold) {
          for (const change of applyMaterialInfluence(entity.properties, entity.colors, property, threshold - (entity.properties[property] ?? 0))) {
            recordFact(world, { turn, nodeId: entity.nodeId, targetId: entity.id, kind: 'property',
              ownerId: entity.ownerId, labor: entity.labor ?? 0,
              property: change.property, before: change.before, after: change.after, message: `${entity.name}의 보존 관리.` });
          }
        }
      }
      // Water/heat/light applied by any actor can improve the same production state.
      const cared = Math.min(opportunities, Math.floor(Math.max(0, entity.properties[property] ?? 0) / 3));
      plot.wateredCount = Math.max(plot.wateredCount, cared);
      batch.plot = plot;
      if (plot.growthProgress >= plot.growTurns) {
        const crop = getCrop(batch.recipeId);
        if (crop) {
          const chance = Math.max(0, Math.min(100, 10 + batch.level * 5 + batch.colorValue * 0.4 + productionQualityBonus(plot)));
          batch.upper = (batch.qualityRoll ?? fixedRoll(batch.id)) * 100 < chance;
          const itemId = batch.upper ? crop.upperItemId : crop.lowerItemId;
          const count = productionYield(batch.level, batch.upper, plot);
          batch.output = { [itemId]: count };
          entity.stock[itemId] = (entity.stock[itemId] ?? 0) + count;
          batch.settled = true;
          recordFact(world, { turn, nodeId: entity.nodeId, targetId: entity.id,
            kind: 'production', resourceId: itemId, quantity: count, ownerId: entity.ownerId,
            labor: entity.labor ?? 0, message: `${entity.name}에서 ${count}개가 완성되어 보관 중이다.` });
        }
      }
    }
    if (batch?.settled && Object.keys(batch.output).every(id => (entity.stock[id] ?? 0) <= 0)) entity.production = undefined;
    if (entity.production?.plot) run.plots[entity.nodeId] = { ...entity.production.plot };
    else delete run.plots[entity.nodeId];
    const renewable = entity.renewable;
    if (renewable) run.lifeCooldowns[entity.nodeId] = (entity.stock[renewable.resourceId] ?? 0) > 0 ? turn : renewable.nextTurn;
  }
}

export function plantLifeAction(
  world: InteractionWorld, actorId: string, targetId: string, cropId: string,
  bonus = 0, mode: ProductionMode = 'standard', enhanceMaterialId?: string,
): InteractionAction | undefined {
  const actor = world.entities[actorId], target = world.entities[targetId], crop = getCrop(cropId);
  if (!actor || !target || !crop || target.production || Object.values(target.stock).some(n => n > 0)) return;
  const level = Math.max(1, actor.properties.lifeLevel ?? 1);
  if (!lifeCapabilities(level).specialization) mode = 'standard';
  const duration = productionDuration(crop.growTurns, mode);
  const id = `${targetId}:${world.turn}:${world.sequence}:${actorId}`;
  const batch: ProductionBatch = {
    id, recipeId: cropId, producerId: actorId, startedTurn: world.turn, duration,
    settled: false, output: {}, level, colorValue: actor.colors[crop.element] ?? 0, upper: false,
    automaticCare: lifeCapabilities(level).automaticCare, careProperty: careProperty(cropId), qualityRoll: fixedRoll(id),
    plot: { cropId, plantedTurn: world.turn, lastTickTurn: world.turn, growTurns: duration, waterAt: [0, Math.floor(duration / 2)],
      wateredCount: 0, growthProgress: 0, growthVersion: 2, productionMode: mode, bonus: bonus + (enhanceMaterialId ? 50 : 0) },
  };
  return {
    id: `plant:${cropId}:${mode}`, label: `${cropDisplayName(crop)} 생산 시작`,
    description: '자리를 준비하고 생산을 시작한다. 떠나 있는 동안에도 성장한다.', duration: 1,
    requires: { tags: ['life-site'], min: { integrity: 1 } },
    effects: [
      ...(enhanceMaterialId ? [{ kind: 'stock' as const, side: 'actor' as const, resourceId: enhanceMaterialId, amount: -1 }] : []),
      { kind: 'production', batch }, { kind: 'work', amount: 1 },
    ],
    utility: { work: 0.65, food: crop.element === 'earth' || crop.element === 'dark' ? 0.2 : 0 }, satisfies: { work: 0.15 },
  };
}

export function lifeActions(_run: RunState, world: InteractionWorld, actorId: string, targetId: string): InteractionAction[] {
  const target = world.entities[targetId], actor = world.entities[actorId];
  if (!target?.tags.includes('life-site') || !actor || (target.properties.integrity ?? 0) <= 0) return [];
  const batch = target.production;
  if (batch?.settled) {
    const available = Object.entries(batch.output)
      .map(([id, count]) => [id, Math.min(count, target.stock[id] ?? 0)] as const)
      .filter(([, count]) => count > 0);
    const total = available.reduce((sum, [, count]) => sum + count, 0);
    if (total === 0) return [];
    const element = getCrop(batch.recipeId)?.element;
    const harvestAction = (one: boolean): InteractionAction => {
      let remaining = one ? 1 : total;
      const effects: InteractionAction['effects'] = [];
      for (const [resourceId, count] of available) {
        const quantity = Math.min(count, remaining);
        if (quantity > 0) effects.push({ kind: 'transfer', resourceId, quantity, from: 'target', to: 'actor' });
        remaining -= quantity;
      }
      // Completion practice is granted once, when the last real output leaves this batch.
      if (!one || total === 1) {
        effects.push({ kind: 'production' }, { kind: 'influence', property: 'practice', amount: 1 + Number(batch.upper), side: 'actor' });
        if (element) effects.push({ kind: 'influence', property: 'color:' + element, amount: 2 + Number(batch.upper), side: 'actor' });
      }
      return { id: one ? 'harvest-one' : 'harvest', label: one ? '1개 수확' : '모두 수확',
        description: one ? '완성된 산출물 1개를 가져가고 나머지는 생산지에 둔다.' : '완성되어 보관 중인 산출물을 모두 가져간다.', duration: 1,
        effects, requires: { min: { integrity: 1 } }, utility: { food: target.tags.includes('food') ? 0.6 : 0, work: 0.5 }, satisfies: { work: 0.15 } };
    };
    return [harvestAction(false), harvestAction(true)];
  }
  if (batch?.plot) {
    if (!canCareForPlot(batch.plot)) return [];
    const crop = getCrop(batch.recipeId);
    return [{ id: 'care', label: crop?.careLabel ?? '돌봄', description: batch.careProperty === 'moisture' ? '물 1개로 수분 +3. 성장 중 품질을 높인다.' : batch.careProperty === 'heat' ? '숯 1개로 열 +4. 성장 중 품질을 높인다.' : '생산지의 배치와 상태를 돌보아 성장 중 품질을 높인다.',
      duration: 1, requires: { min: { integrity: 1 } },
      effects: [
        ...(batch.careProperty === 'moisture' ? [{ kind: 'stock' as const, resourceId: 'water', amount: -1, side: 'actor' as const }]
          : batch.careProperty === 'heat' ? [{ kind: 'stock' as const, resourceId: 'i-life-char', amount: -1, side: 'actor' as const }] : []),
        { kind: 'influence', property: batch.careProperty ?? 'moisture', amount: batch.careProperty === 'heat' ? 4 : 3 }, { kind: 'work', amount: 1 },
      ],
      utility: { work: 0.65, food: 0.2 }, satisfies: { work: 0.15 } }];
  }
  const activity = activityOf(target);
  if (activity.type === 'delayed') {
    const action = plantLifeAction(world, actorId, targetId, activity.cropId!);
    return action ? [action] : [];
  }
  const gather = gatherLifeAction(world, actorId, targetId);
  return gather ? [gather] : [];
}

/** Extraction consumes this patch's stock before converting it into selected goods. */
function extractLifeAction(
  world: InteractionWorld, actor: WorldEntity, target: WorldEntity,
  activity: LifeActivityDef, lowerId: string, upperId: string, bonus = 0, enhanceMaterialId?: string,
): InteractionAction | undefined {
  const source = target.renewable;
  if (!source || source.resourceId !== lowerId || (target.properties.integrity ?? 0) <= 0) return;
  const count = Math.min(source.capacity, target.stock[source.resourceId] ?? 0);
  if (count <= 0) return;
  const level = Math.max(1, actor.properties.lifeLevel ?? 1);
  const chance = Math.max(0, Math.min(100, 10 + level * 5 + (actor.colors[activity.element] ?? 0) * 0.4 + bonus + (enhanceMaterialId ? 50 : 0)));
  const upper = fixedRoll(target.id + ':' + actor.id + ':' + world.turn + ':' + world.sequence) * 100 < chance;
  const itemId = upper ? upperId : lowerId;
  const yieldCount = Math.max(1, productionYield(level, upper) - (source.capacity - count));
  return {
    id: 'gather', label: activity.verb ?? '채집', description: '남은 원물을 채집·선별한다.', duration: 1,
    requires: { min: { integrity: 1 } },
    effects: [
      ...(enhanceMaterialId ? [{ kind: 'stock' as const, side: 'actor' as const, resourceId: enhanceMaterialId, amount: -1 }] : []),
      { kind: 'stock', resourceId: source.resourceId, amount: -count },
      { kind: 'stock', resourceId: itemId, amount: yieldCount, side: 'actor' },
      { kind: 'influence', property: 'practice', amount: 1 + Number(upper), side: 'actor' },
      { kind: 'influence', property: 'color:' + activity.element, amount: 2 + Number(upper), side: 'actor' },
      { kind: 'work', amount: 1 },
    ],
    utility: { food: target.tags.includes('food') || activity.element === 'water' ? .6 : 0, work: .65 },
    satisfies: { work: .15 },
  };
}

/** Field patches, including crops found in the wild, share the same extraction rules. */
export function gatherForageAction(world: InteractionWorld, actorId: string, targetId: string): InteractionAction | undefined {
  const actor = world.entities[actorId], target = world.entities[targetId];
  if (!actor || !target?.tags.includes('forage') || (target.properties.integrity ?? 0) <= 0) return;
  // Unique finds are transferred as physical items; skill never multiplies them.
  if (target.tags.includes('rare-source') || !target.renewable) {
    const resourceId = Object.keys(target.stock).find(id => (target.stock[id] ?? 0) > 0);
    return resourceId ? { id:'gather-find',label:'줍기',description:'',duration:1,
      effects:[{kind:'transfer',resourceId,quantity:1,from:'target',to:'actor'}] } : undefined;
  }
  const activity = activityOf(target), crop = activity.cropId ? getCrop(activity.cropId) : undefined;
  const lowerId = crop?.lowerItemId ?? activity.lowerItemId, upperId = crop?.upperItemId ?? activity.upperItemId;
  if (!lowerId || !upperId) return;
  return extractLifeAction(world, actor, target, activity, lowerId, upperId);
}

/** The same site recipe remains available to legacy life screens and NPC decisions. */
export function gatherLifeAction(
  world: InteractionWorld, actorId: string, targetId: string, bonus = 0, enhanceMaterialId?: string,
): InteractionAction | undefined {
  const target = world.entities[targetId], actor = world.entities[actorId];
  if (!target || !actor) return;
  const activity = activityOf(target);
  if (activity.type !== 'repeat' || !activity.lowerItemId || !activity.upperItemId) return;
  return extractLifeAction(world, actor, target, activity, activity.lowerItemId, activity.upperItemId, bonus, enhanceMaterialId);
}
