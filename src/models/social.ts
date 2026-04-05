// social.ts — 관계, 기억, 소문, 퀘스트 시스템
// 원본: Social.h

import { GameTime } from '../types/game-time';
import { ItemType } from '../types/enums';

export enum MemoryType {
  SawHoarding, SawPriceGouging, TradedWith, TalkedWith,
  GotHelpFrom, GotCheatedBy, HeardRumor, QuestCompleted,
  WentHungry, DungeonSuccess, DungeonFail, SharedMeal,
  LearnedFromRace, TaughtSkill, CulturalBond, CooperatedWith,
  CelebratedTogether, SawGenerosity, Produced,
}

export interface Memory {
  type: MemoryType;
  subject: string;
  detail: string;
  when: GameTime;
  emotionalWeight: number; // -1.0 ~ 1.0
}

export interface Relationship {
  trust: number;      // -1.0 ~ 1.0
  affinity: number;   // -1.0 ~ 1.0
  interactionCount: number;
}

// Add getOverall() as a helper function
export function getRelationshipOverall(r: Relationship): number {
  return (r.trust + r.affinity) * 0.5;
}

export function createRelationship(): Relationship {
  return { trust: 0, affinity: 0, interactionCount: 0 };
}

export interface Rumor {
  content: string;
  originActor: string;
  createdAt: GameTime;
  spreadCount: number;
  importance: number; // 0~1
  relatedElement: number; // Element index, -1 = none
  elementDelta: number;
}

export enum QuestStatus { Posted, Accepted, Completed, Failed, Expired }
export enum QuestType { MonsterHunt, GatherHerb, GatherOre, Escort, Delivery }

export interface Quest {
  id: number;
  type: QuestType;
  title: string;
  description: string;
  postedBy: string;
  acceptedBy: string;
  status: QuestStatus;
  postedAt: GameTime;
  deadline: GameTime;
  targetItem: ItemType;
  targetAmount: number;
  currentAmount: number;
  rewardGold: number;
  rewardReputation: number;
}

// Quest helpers
export function isQuestExpired(q: Quest, now: GameTime): boolean {
  return now.day > q.deadline.day;
}

export function isQuestComplete(q: Quest): boolean {
  return q.currentAmount >= q.targetAmount;
}

// SocialHub class
export class SocialHub {
  private rumors: Rumor[] = [];
  private heardRumors = new Map<string, Set<number>>();
  private quests: Quest[] = [];
  private nextQuestId = 1;

  static readonly MAX_RUMORS = 50;

  addRumor(rumor: Rumor): void {
    this.rumors.push(rumor);
    if (this.rumors.length > SocialHub.MAX_RUMORS) {
      this.rumors.shift();
    }
  }

  getRumors(): readonly Rumor[] { return this.rumors; }

  getUnheardRumors(actorName: string): Rumor[] {
    const heard = this.heardRumors.get(actorName);
    if (!heard) return [...this.rumors];
    return this.rumors.filter((_, i) => !heard.has(i));
  }

  markRumorHeard(actorName: string, rumorIndex: number): void {
    let heard = this.heardRumors.get(actorName);
    if (!heard) { heard = new Set(); this.heardRumors.set(actorName, heard); }
    heard.add(rumorIndex);
  }

  postQuest(quest: Quest): number {
    quest.id = this.nextQuestId++;
    this.quests.push(quest);
    return quest.id;
  }

  getAvailableQuests(): Quest[] {
    return this.quests.filter(q => q.status === QuestStatus.Posted);
  }

  getQuest(id: number): Quest | undefined {
    return this.quests.find(q => q.id === id);
  }

  acceptQuest(questId: number, actorName: string): boolean {
    const q = this.getQuest(questId);
    if (!q || q.status !== QuestStatus.Posted) return false;
    q.status = QuestStatus.Accepted;
    q.acceptedBy = actorName;
    return true;
  }

  progressQuest(questId: number, amount: number): boolean {
    const q = this.getQuest(questId);
    if (!q || q.status !== QuestStatus.Accepted) return false;
    q.currentAmount += amount;
    return true;
  }

  updateQuests(time: GameTime): void {
    for (const q of this.quests) {
      if (q.status === QuestStatus.Posted || q.status === QuestStatus.Accepted) {
        if (isQuestExpired(q, time)) {
          q.status = QuestStatus.Expired;
        }
      }
    }
  }

  getNextQuestId(): number { return this.nextQuestId; }
  getAllQuests(): readonly Quest[] { return this.quests; }
}
