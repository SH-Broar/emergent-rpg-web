// dialogue-choice-defs.ts — 대화 선택지 레지스트리

import { DialogueChoiceDef } from '../models/dialogue-choice';

const choiceRegistry = new Map<string, DialogueChoiceDef>();
const choicesByNpc = new Map<string, DialogueChoiceDef[]>();

export function clearDialogueChoiceDefs(): void {
  choiceRegistry.clear();
  choicesByNpc.clear();
}

export function registerDialogueChoiceDef(def: DialogueChoiceDef): void {
  choiceRegistry.set(def.id, def);
  const list = choicesByNpc.get(def.npc) ?? [];
  list.push(def);
  choicesByNpc.set(def.npc, list);
}

export function getDialogueChoiceDef(id: string): DialogueChoiceDef | undefined {
  return choiceRegistry.get(id);
}

/**
 * 주어진 NPC에 대해 관계 조건을 만족하고 아직 보지 않은 선택지 중
 * 하나를 무작위로 반환한다.
 */
export function pickAvailableChoice(
  npcName: string,
  relationshipOverall: number,
  seenIds: Set<string>,
): DialogueChoiceDef | null {
  const list = choicesByNpc.get(npcName) ?? [];
  const available = list.filter(
    d => relationshipOverall >= d.triggerRelationship && !seenIds.has(d.id),
  );
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}
