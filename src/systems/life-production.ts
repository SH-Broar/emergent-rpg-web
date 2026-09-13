import type { PlotState } from '@/data/schemas';

export type ProductionMode = 'standard' | 'abundant' | 'select';

export const PRODUCTION_MODES: { id: ProductionMode; name: string; description: string }[] = [
  { id: 'standard', name: '기본 생산', description: '정해진 시간에 안정적으로 생산' },
  { id: 'abundant', name: '다수확', description: '산출 +2개 · 완성까지 25% 더 오래' },
  { id: 'select', name: '선별 재배', description: '상품 확률 +30%p · 생산 시간 동일' },
];

/** Mastery unlocks upkeep, production choices and one extra unit of yield. */
export function lifeCapabilities(level: number) {
  return {
    automaticCare: level >= 2,
    specialization: level >= 3,
    extraYield: level >= 5 ? 1 : 0,
  };
}

/**
 * Read-only world-time projection. Old plots retain their original maturity target;
 * time lost to the former care gate is restored once, even when lastTickTurn moved.
 */
export function projectedPlot(plot: PlotState, worldTurn: number, automaticCare = false): PlotState {
  const now = Math.max(plot.lastTickTurn, worldTurn);
  const elapsed = Math.max(0, now - plot.lastTickTurn);
  const progress = plot.growthVersion === 2
    ? plot.growthProgress + elapsed
    : Math.max(plot.growthProgress + elapsed, now - plot.plantedTurn);
  const growthProgress = Math.min(plot.growTurns, Math.max(0, progress));
  const opportunities = plot.waterAt.filter(t => t <= growthProgress).length;
  return {
    ...plot,
    growthVersion: 2,
    growthProgress,
    lastTickTurn: now,
    wateredCount: automaticCare ? Math.max(plot.wateredCount, opportunities) : plot.wateredCount,
  };
}

/** Care changes the harvest, never the clock. A mature plot can receive final care. */
export function canCareForPlot(plot: PlotState): boolean {
  return plot.waterAt.filter(t => t <= plot.growthProgress).length > plot.wateredCount;
}

export function productionDuration(turns: number, mode: ProductionMode): number {
  return mode === 'abundant' ? Math.ceil(turns * 1.25) : turns;
}

export function productionQualityBonus(plot: PlotState): number {
  return (plot.bonus ?? 0) + Math.min(2, plot.wateredCount) * 10
    + (plot.productionMode === 'select' ? 30 : 0);
}

export function productionYield(level: number, upper: boolean, plot?: PlotState): number {
  return 2 + lifeCapabilities(level).extraYield + (upper ? 1 : 0)
    + (plot && plot.wateredCount > 0 ? 1 : 0)
    + (plot?.productionMode === 'abundant' ? 2 : 0);
}
