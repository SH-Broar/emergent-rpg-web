// npc-quest-defs.ts — NPC 퀘스트 레지스트리 및 이벤트 트리거

import { NpcQuestDef, NpcQuestState, NpcQuestObjective } from '../models/npc-quest';

const npcQuestRegistry = new Map<string, NpcQuestDef>();
const npcQuestsByNpc = new Map<string, NpcQuestDef[]>();

export function clearNpcQuestDefs(): void {
  npcQuestRegistry.clear();
  npcQuestsByNpc.clear();
}

export function registerNpcQuestDef(def: NpcQuestDef): void {
  npcQuestRegistry.set(def.id, def);
  const list = npcQuestsByNpc.get(def.npc) ?? [];
  list.push(def);
  list.sort((a, b) => a.stage - b.stage);
  npcQuestsByNpc.set(def.npc, list);
}

export function getNpcQuestDef(id: string): NpcQuestDef | undefined {
  return npcQuestRegistry.get(id);
}

export function getNpcQuestsForNpc(npcName: string): NpcQuestDef[] {
  return npcQuestsByNpc.get(npcName) ?? [];
}

export function getAllNpcQuestNpcs(): string[] {
  return [...npcQuestsByNpc.keys()];
}

/**
 * 활성 퀘스트에 대해 이벤트를 확인하고, 조건이 충족된 퀘스트ID를 markNpcQuestProgress로 갱신한다.
 * knowledge 객체를 직접 받아서 순환 import를 방지한다.
 */
export function triggerNpcQuestEvent(
  k: { activeNpcQuests: Map<string, NpcQuestState>; markNpcQuestProgress: (id: string) => void },
  event: NpcQuestObjective,
): void {
  for (const [questId, state] of k.activeNpcQuests) {
    if (!state.accepted || state.completed || state.progressMet) continue;
    const def = getNpcQuestDef(questId);
    if (!def) continue;
    const obj = def.objectiveType;
    if (obj.type !== event.type) continue;

    let ok = false;
    switch (obj.type) {
      case 'visit':
        ok = (event as Extract<NpcQuestObjective, { type: 'visit' }>).locationId === obj.locationId;
        break;
      case 'talk':
        ok = (event as Extract<NpcQuestObjective, { type: 'talk' }>).npcName === obj.npcName;
        break;
      case 'dungeon':
        ok = (event as Extract<NpcQuestObjective, { type: 'dungeon' }>).dungeonId === obj.dungeonId;
        break;
      case 'companion': {
        const e = event as Extract<NpcQuestObjective, { type: 'companion' }>;
        ok = e.npcName === obj.npcName && e.days >= obj.days;
        break;
      }
      case 'gather': {
        const e = event as Extract<NpcQuestObjective, { type: 'gather' }>;
        ok = e.itemKey === obj.itemKey && e.amount >= obj.amount;
        break;
      }
      case 'gift': {
        const e = event as Extract<NpcQuestObjective, { type: 'gift' }>
        ok = e.npcName === obj.npcName && e.itemKey === obj.itemKey;
        break;
      }
    }

    if (ok) k.markNpcQuestProgress(questId);
  }
}
