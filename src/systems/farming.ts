/** Store facade over shared world production; NPCs use the same actions and stocks. */
import type { PlotState } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { irrigationActive } from '@/systems/region-world';
import { ensureInteractionWorld, syncPlayerToWorld } from '@/systems/world-interaction';
import { ensureLifeSite, lifeActions, lifeEntityId, plantLifeAction, settleLifeWorld } from '@/systems/world/life-world';
import { getCrop, type CropDef } from '@/systems/life-catalog';
import { canCareForPlot, lifeCapabilities, projectedPlot, productionQualityBonus, productionYield, type ProductionMode } from '@/systems/life-production';
export { CROPS, getCrop, cropDisplayName, careLabelFor, plotLabelFor, type CropDef } from '@/systems/life-catalog';

export const HARVEST_BASE_BONUS = 10;
export const HARVEST_LEVEL_K = 5;
export const HARVEST_COLOR_SCALE = 0.4;

/** Command preparation is separate from read-only map projections. */
export function prepareLifeSite(nodeId: string) {
  const run = useRunStore();
  const world = ensureInteractionWorld(run.data);
  syncPlayerToWorld(run.data, world);
  const data = useDataStore();
  const mapId = data.timelines.get(run.data.timelineId)?.nodeMapId;
  const region = mapId ? data.nodeMaps.get(mapId)?.nodes.find(node => node.id === nodeId)?.region : undefined;
  const target = ensureLifeSite(run.data, world, nodeId, region);
  settleLifeWorld(run.data, world, world.turn);
  return { run, world, target };
}

function targetFor(nodeId: string) {
  return useRunStore().data.interactionWorld?.entities[lifeEntityId(nodeId)];
}

export function plant(nodeId: string, cropId: string, bonus = 0, mode: ProductionMode = 'standard', enhanceMaterialId?: string): boolean {
  const { run, world, target } = prepareLifeSite(nodeId);
  const action = plantLifeAction(world, 'player', target.id, cropId, bonus, mode, enhanceMaterialId);
  if (!action) return false;
  const result = run.executeWorldAction(target.id, action);
  useUiStore().toast(result.ok ? 'success' : 'info', result.message);
  return result.ok;
}

export function getPlot(nodeId: string): PlotState | undefined {
  const entity = targetFor(nodeId);
  if (entity) return (entity.properties.integrity ?? 0) > 0 ? entity.production?.plot : undefined;
  return useRunStore().data.plots?.[nodeId];
}

export function hasAutomaticCare(nodeId: string): boolean {
  const r = useRunStore().data;
  return (targetFor(nodeId)?.production?.automaticCare ?? lifeCapabilities(r.lifeLevel ?? 1).automaticCare) || irrigationActive(r, nodeId);
}

export function needsWater(nodeId: string): boolean {
  const entity = targetFor(nodeId);
  if (entity?.production?.settled) return false;
  const plot = getPlot(nodeId);
  return !!plot && canCareForPlot(projectedPlot(plot, useRunStore().data.visitedNodes.length, hasAutomaticCare(nodeId)));
}

export function water(nodeId: string): boolean {
  const { run, world, target } = prepareLifeSite(nodeId);
  const action = lifeActions(run.data, world, 'player', target.id).find(action => action.id === 'care');
  if (!action) return false;
  const result = run.executeWorldAction(target.id, action);
  useUiStore().toast(result.ok ? 'success' : 'info', result.message);
  return result.ok;
}

export function refreshPlot(nodeId: string): void {
  prepareLifeSite(nodeId);
}

export interface PlotStatus { active: boolean; remaining: number; needsCare: boolean; ready: boolean }

export function plotStatus(nodeId: string): PlotStatus {
  const saved = getPlot(nodeId);
  if (!saved) return { active: false, remaining: 0, needsCare: false, ready: false };
  const plot = projectedPlot(saved, useRunStore().data.visitedNodes.length);
  const settled = targetFor(nodeId)?.production?.settled;
  return {
    active: true, remaining: Math.max(0, plot.growTurns - plot.growthProgress),
    needsCare: !settled && needsWater(nodeId),
    ready: !!settled || plot.growthProgress >= plot.growTurns,
  };
}

export function isReady(nodeId: string): boolean { return plotStatus(nodeId).ready; }

export function harvestUpperChance(crop: CropDef): number {
  const r = useRunStore().data;
  return Math.max(0, Math.min(100, Math.round(10 + (r.lifeLevel ?? 1) * 5 + (r.colors[crop.element] ?? 0) * 0.4)));
}

export function plotUpperChance(nodeId: string): number {
  const plot = getPlot(nodeId);
  if (!plot) return 0;
  const batch = targetFor(nodeId)?.production;
  if (batch?.settled) return batch.upper ? 100 : 0;
  const crop = getCrop(plot.cropId);
  const base = batch ? 10 + batch.level * 5 + batch.colorValue * 0.4 : crop ? harvestUpperChance(crop) : 0;
  return Math.max(0, Math.min(100, Math.round(base + productionQualityBonus(plot))));
}

export function plotMinimumYield(nodeId: string): number {
  const r = useRunStore().data, target = targetFor(nodeId), plot = getPlot(nodeId);
  if (!plot) return 0;
  if (target?.production?.settled) return Object.keys(target.production.output).reduce((sum, id) => sum + (target.stock[id] ?? 0), 0);
  return productionYield(target?.production?.level ?? r.lifeLevel ?? 1, false, plot);
}

export interface HarvestResult { cropId: string; upper: boolean; itemIds: string[]; colorGain: number; lifeXp: number }

/** The result describes this transaction; later NPC actions cannot award it again. */
export function harvest(nodeId: string, _legacyUpperBonus = 0): HarvestResult | null {
  const { run, world, target } = prepareLifeSite(nodeId);
  const batch = target.production;
  if (!batch?.settled) return null;
  const action = lifeActions(run.data, world, 'player', target.id).find(action => action.id === 'harvest');
  if (!action) return null;
  const itemIds = action.effects.flatMap(effect => effect.kind === 'transfer' && effect.from === 'target' ? Array(effect.quantity).fill(effect.resourceId) as string[] : []);
  if (itemIds.some(id => !useDataStore().items.has(id))) return null;
  const result = run.executeWorldAction(target.id, action);
  if (!result.ok) { useUiStore().toast('info', result.message); return null; }
  return { cropId: batch.recipeId, upper: batch.upper, itemIds, colorGain: 2 + Number(batch.upper), lifeXp: 1 + Number(batch.upper) };
}
