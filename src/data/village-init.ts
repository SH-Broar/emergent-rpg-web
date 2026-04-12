// village-init.ts — village-facilities.txt / village-roads.txt 파싱

import { DataSection } from './parser';
import { registerFacilityDef, registerRoadDef } from './village-defs';

export function initVillageFacilities(sections: DataSection[]): void {
  for (const s of sections) {
    registerFacilityDef({
      id: s.name,
      name: s.get('name', s.name),
      category: s.get('category', 'production') as any,
      unlockStage: s.getInt('unlockStage', 1),
      buildCostGold: s.getInt('buildCostGold', 0),
      buildCostWood: s.getInt('buildCostWood', 0),
      buildCostStone: s.getInt('buildCostStone', 0),
      buildCostWheat: s.getInt('buildCostWheat', 0),
      incomePerDay: s.getInt('incomePerDay', 0),
      maintenancePerDay: s.getInt('maintenancePerDay', 0),
      description: s.get('description', ''),
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
      travelSpeedMultiplier: s.getFloat('travelSpeedMultiplier', 1.0),
      maintenancePerDay: s.getInt('maintenancePerDay', 0),
      description: s.get('description', ''),
    });
  }
}
