// npc-quest.ts — NPC 개인 퀘스트 체인 모델

export type NpcQuestObjective =
  | { type: 'visit'; locationId: string }
  | { type: 'talk'; npcName: string }
  | { type: 'companion'; npcName: string; days: number }
  | { type: 'dungeon'; dungeonId: string }
  | { type: 'gather'; itemKey: string; amount: number }
  | { type: 'gift'; npcName: string; itemKey: string };

export interface NpcQuestDef {
  id: string;
  npc: string;
  stage: number;
  title: string;
  unlockRelationship: number;
  introText: string;
  objective: string;
  objectiveType: NpcQuestObjective;
  rewardGold: number;
  rewardRelationship: number;
  completionText: string;
  followupText: string;
  next: string; // next quest ID, '' if last
}

export interface NpcQuestState {
  questId: string;
  npcName: string;
  accepted: boolean;
  completed: boolean;
  progressMet: boolean;
  acceptedDay: number;
}
