// village-defs.ts — 시설/도로/이벤트 정의 레지스트리

import { VillageEventDef } from '../models/village-event';

// ============================================================
// 시설 티어 정의
// ============================================================

export interface FacilityTierDef {
  incomePerDay: number;
  maintenancePerDay: number;
  happinessBonus: number;
  defenseBonus: number;
  // 업그레이드 비용 (이 티어로 올리는 비용)
  upgradeCostGold: number;
  upgradeCostWood: number;
  upgradeCostStone: number;
  upgradeCostWheat: number;
  upgradeCostHerb: number;
  upgradeCostMonsterBone: number;
  upgradeCostMagicStone: number;
  upgradeCostRareMetal: number;
}

export interface VillageFacilityDef {
  id: string;
  name: string;
  category: 'production' | 'amenity' | 'defense' | 'admin' | 'culture' | 'special';
  unlockStage: number;
  buildCostGold: number;
  buildCostWood: number;
  buildCostStone: number;
  buildCostWheat: number;
  // Tier 1 기본값 (하위 호환)
  incomePerDay: number;
  maintenancePerDay: number;
  description: string;
  // Phase 2: 티어 배열 [tier1, tier2, tier3]
  tiers: FacilityTierDef[];
}

export interface VillageRoadDef {
  id: string;
  name: string;
  grade: number;
  buildCostGold: number;
  buildCostWood: number;
  buildCostStone: number;
  travelSpeedMultiplier: number; // 1.0 = 변화 없음, 0.75 = 25% 단축
  maintenancePerDay: number;
  description: string;
}

// ============================================================
// 레지스트리
// ============================================================

const facilityRegistry = new Map<string, VillageFacilityDef>();
const roadRegistry = new Map<string, VillageRoadDef>();
const eventRegistry = new Map<string, VillageEventDef>();

export function registerFacilityDef(def: VillageFacilityDef): void {
  facilityRegistry.set(def.id, def);
}

export function getFacilityDef(id: string): VillageFacilityDef | undefined {
  return facilityRegistry.get(id);
}

export function getAllFacilityDefs(): VillageFacilityDef[] {
  return [...facilityRegistry.values()];
}

export function registerRoadDef(def: VillageRoadDef): void {
  roadRegistry.set(def.id, def);
}

export function getRoadDef(id: string): VillageRoadDef | undefined {
  return roadRegistry.get(id);
}

export function getAllRoadDefs(): VillageRoadDef[] {
  return [...roadRegistry.values()];
}

export function registerVillageEventDef(def: VillageEventDef): void {
  eventRegistry.set(def.id, def);
}

export function getVillageEventDef(id: string): VillageEventDef | undefined {
  return eventRegistry.get(id);
}

export function getAllVillageEventDefs(): VillageEventDef[] {
  return [...eventRegistry.values()];
}
