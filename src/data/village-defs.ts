// village-defs.ts — 시설/도로 정의 레지스트리

export interface VillageFacilityDef {
  id: string;
  name: string;
  category: 'production' | 'amenity' | 'defense' | 'admin' | 'culture' | 'special';
  unlockStage: number;
  buildCostGold: number;
  buildCostWood: number;
  buildCostStone: number;
  buildCostWheat: number;
  incomePerDay: number;
  maintenancePerDay: number;
  description: string;
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

const facilityRegistry = new Map<string, VillageFacilityDef>();
const roadRegistry = new Map<string, VillageRoadDef>();

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
