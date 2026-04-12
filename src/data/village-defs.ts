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
  buildCostIron: number;   // 신규 — 등급 3~4에서 사용
  travelSpeedMultiplier: number; // 1.0 = 변화 없음, 0.75 = 25% 단축
  maintenancePerDay: number;
  description: string;
}

// 업그레이드 비용 필드명 → 실제 items.txt 아이템 ID 매핑
export const DUNGEON_MATERIAL_ITEM_IDS = {
  upgradeCostMonsterBone: 'bone_fragment',
  upgradeCostMagicStone: 'moonstone',
  upgradeCostRareMetal: 'silver_ore',
} as const;

export type DungeonMaterialKey = keyof typeof DUNGEON_MATERIAL_ITEM_IDS;

// ============================================================
// 벤젠 대사 정의
// ============================================================

export interface BenzenLineDef {
  id: string;
  condition: string;
  text: string;
  priority: number;
}

const benzenLineRegistry: BenzenLineDef[] = [];

export function registerBenzenLine(def: BenzenLineDef): void {
  benzenLineRegistry.push(def);
}

export function getBenzenLine(condition: string): string {
  const matches = benzenLineRegistry
    .filter(d => d.condition === condition)
    .sort((a, b) => b.priority - a.priority);
  if (matches.length > 0) {
    // 동점이면 랜덤 선택
    const top = matches[0].priority;
    const topMatches = matches.filter(d => d.priority === top);
    return topMatches[Math.floor(Math.random() * topMatches.length)].text;
  }
  // 폴백: default
  const fallback = benzenLineRegistry
    .filter(d => d.condition === 'default')
    .sort((a, b) => b.priority - a.priority);
  if (fallback.length > 0) return fallback[Math.floor(Math.random() * Math.min(3, fallback.length))].text;
  return '...';
}

export function getBenzenLineCount(): number {
  return benzenLineRegistry.length;
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
