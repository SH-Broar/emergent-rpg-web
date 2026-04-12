// village-init.ts — village-facilities.txt / village-roads.txt 파싱

import { DataSection } from './parser';
import { registerFacilityDef, registerRoadDef, FacilityTierDef } from './village-defs';

function parseTierDef(s: DataSection, tier: number): FacilityTierDef {
  const prefix = `tier${tier}`;
  return {
    incomePerDay: s.getInt(`${prefix}_incomePerDay`, 0),
    maintenancePerDay: s.getInt(`${prefix}_maintenancePerDay`, 0),
    happinessBonus: s.getInt(`${prefix}_happinessBonus`, 0),
    defenseBonus: s.getInt(`${prefix}_defenseBonus`, 0),
    upgradeCostGold: s.getInt(`${prefix}_upgradeCostGold`, 0),
    upgradeCostWood: s.getInt(`${prefix}_upgradeCostWood`, 0),
    upgradeCostStone: s.getInt(`${prefix}_upgradeCostStone`, 0),
    upgradeCostWheat: s.getInt(`${prefix}_upgradeCostWheat`, 0),
    upgradeCostHerb: s.getInt(`${prefix}_upgradeCostHerb`, 0),
    upgradeCostMonsterBone: s.getInt(`${prefix}_upgradeCostMonsterBone`, 0),
    upgradeCostMagicStone: s.getInt(`${prefix}_upgradeCostMagicStone`, 0),
    upgradeCostRareMetal: s.getInt(`${prefix}_upgradeCostRareMetal`, 0),
  };
}

export function initVillageFacilities(sections: DataSection[]): void {
  for (const s of sections) {
    const incomePerDay = s.getInt('incomePerDay', 0);
    const maintenancePerDay = s.getInt('maintenancePerDay', 0);

    // 티어 정의 파싱 (tier1~tier3)
    // tier1이 데이터에 없으면 기존 값으로 fallback
    const hasTier1 = s.has('tier1_incomePerDay');
    const tier1: FacilityTierDef = hasTier1
      ? parseTierDef(s, 1)
      : {
          incomePerDay,
          maintenancePerDay,
          happinessBonus: 0,
          defenseBonus: 0,
          upgradeCostGold: 0,
          upgradeCostWood: 0,
          upgradeCostStone: 0,
          upgradeCostWheat: 0,
          upgradeCostHerb: 0,
          upgradeCostMonsterBone: 0,
          upgradeCostMagicStone: 0,
          upgradeCostRareMetal: 0,
        };

    const tier2: FacilityTierDef = parseTierDef(s, 2);
    const tier3: FacilityTierDef = parseTierDef(s, 3);

    registerFacilityDef({
      id: s.name,
      name: s.get('name', s.name),
      category: s.get('category', 'production') as any,
      unlockStage: s.getInt('unlockStage', 1),
      buildCostGold: s.getInt('buildCostGold', 0),
      buildCostWood: s.getInt('buildCostWood', 0),
      buildCostStone: s.getInt('buildCostStone', 0),
      buildCostWheat: s.getInt('buildCostWheat', 0),
      incomePerDay,
      maintenancePerDay,
      description: s.get('description', ''),
      tiers: [tier1, tier2, tier3],
    });
  }
}

export function initVillageRoads(sections: DataSection[]): void {
  for (const s of sections) {
    registerRoadDef({
      id: s.name,
      name: s.get('name', s.name),
      grade: s.getInt('grade', 1),
      buildCostGold: s.getInt('buildCostGold', 0),
      buildCostWood: s.getInt('buildCostWood', 0),
      buildCostStone: s.getInt('buildCostStone', 0),
      buildCostIron: s.getInt('buildCostIron', 0),
      travelSpeedMultiplier: s.getFloat('travelSpeedMultiplier', 1.0),
      maintenancePerDay: s.getInt('maintenancePerDay', 0),
      description: s.get('description', ''),
    });
  }
}
