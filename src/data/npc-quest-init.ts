// npc-quest-init.ts — npc_quests.txt 파싱

import { DataSection } from './parser';
import { registerNpcQuestDef } from './npc-quest-defs';
import { NpcQuestDef, NpcQuestObjective } from '../models/npc-quest';

function parseObjectiveType(raw: string): NpcQuestObjective {
  const parts = raw.split(':');
  const type = parts[0].trim();

  switch (type) {
    case 'visit':
      return { type: 'visit', locationId: parts[1]?.trim() ?? '' };
    case 'talk':
      return { type: 'talk', npcName: parts[1]?.trim() ?? '' };
    case 'dungeon':
      return { type: 'dungeon', dungeonId: parts[1]?.trim() ?? '' };
    case 'companion':
      return {
        type: 'companion',
        npcName: parts[1]?.trim() ?? '',
        days: parseInt(parts[2]?.trim() ?? '1', 10) || 1,
      };
    case 'gather':
      return {
        type: 'gather',
        itemKey: parts[1]?.trim() ?? '',
        amount: parseInt(parts[2]?.trim() ?? '1', 10) || 1,
      };
    case 'gift':
      return {
        type: 'gift',
        npcName: parts[1]?.trim() ?? '',
        itemKey: parts[2]?.trim() ?? '',
      };
    default:
      // 알 수 없는 타입은 visit으로 폴백
      return { type: 'visit', locationId: raw };
  }
}

function unescape(text: string): string {
  return text.replace(/\\n/g, '\n');
}

export function initNpcQuests(sections: DataSection[]): void {
  for (const s of sections) {
    const id = s.name;
    const npc = s.get('npc', '');
    const stage = s.getInt('stage', 1);
    const title = s.get('title', '');
    const unlockRelationship = s.getFloat('unlock_relationship', 0);
    const introText = unescape(s.get('intro_text', ''));
    const objective = s.get('objective', '');
    const objectiveTypeRaw = s.get('objective_type', 'visit:');
    const rewardGold = s.getInt('reward_gold', 0);
    const rewardRelationship = s.getFloat('reward_relationship', 0);
    const completionText = unescape(s.get('completion_text', ''));
    const followupText = unescape(s.get('followup_text', ''));
    const next = s.get('next', '');

    if (!id || !npc || !title) continue;

    const objectiveTypeParsed = parseObjectiveType(objectiveTypeRaw);

    // location: 명시된 값 우선, 없으면 objective_type의 visit/dungeon에서 자동 추론
    let location = s.get('location', '').trim();
    if (!location) {
      if (objectiveTypeParsed.type === 'visit') location = objectiveTypeParsed.locationId;
      else if (objectiveTypeParsed.type === 'dungeon') location = objectiveTypeParsed.dungeonId;
    }

    const def: NpcQuestDef = {
      id,
      npc,
      stage,
      title,
      unlockRelationship,
      introText,
      objective,
      objectiveType: objectiveTypeParsed,
      rewardGold,
      rewardRelationship,
      completionText,
      followupText,
      next,
      location: location || undefined,
    };

    registerNpcQuestDef(def);
  }
}
