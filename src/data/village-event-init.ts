// village-event-init.ts — village-events.txt 파싱

import { DataSection } from './parser';
import { VillageEventDef, VillageEventChoice } from '../models/village-event';
import { registerVillageEventDef } from './village-defs';

function parseEventChoice(s: DataSection, prefix: string): VillageEventChoice {
  return {
    label: s.get(`${prefix}_label`, ''),
    goldCost: s.getInt(`${prefix}_goldCost`, 0),
    successMsg: s.get(`${prefix}_successMsg`, ''),
    failureMsg: s.get(`${prefix}_failureMsg`, ''),
    successChance: s.getFloat(`${prefix}_successChance`, 1.0),
    onSuccess: {
      populationDelta: s.getInt(`${prefix}_success_populationDelta`, 0),
      happinessDelta: s.getInt(`${prefix}_success_happinessDelta`, 0),
      defenseDelta: s.getInt(`${prefix}_success_defenseDelta`, 0),
      reputationDelta: s.getInt(`${prefix}_success_reputationDelta`, 0),
      treasuryDelta: s.getInt(`${prefix}_success_treasuryDelta`, 0),
    },
    onFailure: {
      populationDelta: s.getInt(`${prefix}_failure_populationDelta`, 0),
      happinessDelta: s.getInt(`${prefix}_failure_happinessDelta`, 0),
      defenseDelta: s.getInt(`${prefix}_failure_defenseDelta`, 0),
      reputationDelta: s.getInt(`${prefix}_failure_reputationDelta`, 0),
      treasuryDelta: s.getInt(`${prefix}_failure_treasuryDelta`, 0),
    },
  };
}

export function initVillageEvents(sections: DataSection[]): void {
  for (const s of sections) {
    const def: VillageEventDef = {
      id: s.name,
      name: s.get('name', s.name),
      category: s.get('category', 'crisis') as any,
      description: s.get('description', ''),
      triggerCondition: '',
      triggerStageMin: s.getInt('triggerStageMin', 1),
      triggerStageMax: s.getInt('triggerStageMax', 7),
      triggerPopMin: s.getInt('triggerPopMin', 0),
      triggerSeason: s.get('triggerSeason', ''),
      triggerRepMin: s.getInt('triggerRepMin', 0),
      choices: [
        parseEventChoice(s, 'choice1'),
        parseEventChoice(s, 'choice2'),
      ],
      cooldownDays: s.getInt('cooldownDays', 30),
    };
    registerVillageEventDef(def);
  }
}
