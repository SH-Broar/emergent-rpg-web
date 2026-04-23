// npc-life.ts — NPC 자율 목표 및 생활 이벤트 시스템
// 따뜻하고 소박한 슬로우 라이프 판타지를 위한 NPC 자율 이야기

import { Actor } from '../models/actor';
import { SocialHub, MemoryType } from '../models/social';
import { Backlog } from '../models/backlog';
import { GameTime } from '../types/game-time';
import { ItemType, SpiritRole } from '../types/enums';
import { Loc } from '../types/location';
import { getLifeEventTuning, formatEventMessage, type LifeEventTuning } from '../data/npc-life-event-defs';

// ============================================================
// 튜닝 데이터 접근 헬퍼 (npc_life_events.txt 연계)
// 데이터가 로드되지 않은 경우 각 이벤트의 execute 가 전달한 기본값(defaults)을 사용한다.
// ============================================================

/** 양쪽 mood + 관계 변화량을 한 번에 적용. */
function applyEventEffects(
  a1: Actor,
  a2: Actor,
  eventId: string,
  defaults: {
    a1Mood?: number; a2Mood?: number;
    a1Trust?: number; a1Affinity?: number;
    a2Trust?: number; a2Affinity?: number;
  },
): void {
  const t = getLifeEventTuning(eventId);
  const a1Mood = t?.a1MoodDelta ?? defaults.a1Mood ?? 0;
  const a2Mood = t?.a2MoodDelta ?? defaults.a2Mood ?? 0;
  const a1Trust = t?.a1TrustDelta ?? defaults.a1Trust ?? 0;
  const a1Aff = t?.a1AffinityDelta ?? defaults.a1Affinity ?? 0;
  const a2Trust = t?.a2TrustDelta ?? defaults.a2Trust ?? 0;
  const a2Aff = t?.a2AffinityDelta ?? defaults.a2Affinity ?? 0;
  if (a1Mood) a1.adjustMood(a1Mood);
  if (a2Mood) a2.adjustMood(a2Mood);
  if (a1Trust || a1Aff) a1.adjustRelationship(a2.name, a1Trust, a1Aff);
  if (a2Trust || a2Aff) a2.adjustRelationship(a1.name, a2Trust, a2Aff);
}

/** 메시지 템플릿을 데이터 우선으로 조회해 치환. */
function buildEventMessage(
  eventId: string,
  defaultTemplate: string,
  vars: Record<string, string | number>,
): string {
  const t = getLifeEventTuning(eventId);
  return formatEventMessage(t?.message ?? defaultTemplate, vars);
}

/** 메모리 가중치 한 쌍 조회 */
function getEventMemoryWeights(
  eventId: string,
  defaultA1: number,
  defaultA2: number,
): { a1: number; a2: number } {
  const t = getLifeEventTuning(eventId);
  return {
    a1: t?.a1MemoryWeight ?? defaultA1,
    a2: t?.a2MemoryWeight ?? defaultA2,
  };
}

/** 런타임에 weight/cooldown 만 튜닝 override */
function getRuntimeTuning(event: NpcLifeEvent): { weight: number; cooldownDays: number } {
  const t: LifeEventTuning | undefined = getLifeEventTuning(event.id);
  return {
    weight: t?.weight ?? event.weight,
    cooldownDays: t?.cooldownDays ?? event.cooldownDays,
  };
}

// ============================================================
// NPC 목표 시스템
// ============================================================

export enum NpcGoalType {
  SaveGold,      // 골드 모으기
  MakeFriend,    // 친구 사귀기
  MasterCraft,   // 생산 달인 되기
  ExploreWorld,  // 세계 탐험
  HelpOthers,    // 남을 돕기
  FindPeace,     // 마음의 평화
}

export interface NpcGoal {
  type: NpcGoalType;
  progress: number;  // 0-100
  target: number;    // completion threshold
  description: string;
}

// Module-level storage for goals (keyed by actor name)
const npcGoals = new Map<string, NpcGoal>();

// Tracks how many days an actor has had mood > 0.3 (for FindPeace)
const peacefulDays = new Map<string, number>();

// Tracks last milestone announced per actor (0, 25, 50, 75, 100)
const lastMilestone = new Map<string, number>();

// ============================================================
// Goal assignment
// ============================================================

export function assignNpcGoal(actor: Actor): NpcGoal {
  const role = actor.spirit.role;
  let goal: NpcGoal;

  if (role === SpiritRole.Merchant || role === SpiritRole.Farmer) {
    goal = {
      type: NpcGoalType.SaveGold,
      progress: 0,
      target: 500,
      description: '골드 500개 모으기',
    };
  } else if (role === SpiritRole.Adventurer || role === SpiritRole.Guard) {
    goal = {
      type: NpcGoalType.ExploreWorld,
      progress: 0,
      target: 5,
      description: '다섯 곳의 장소 탐험하기',
    };
  } else if (role === SpiritRole.Priest || role === SpiritRole.Villager) {
    goal = {
      type: NpcGoalType.HelpOthers,
      progress: 0,
      target: 10,
      description: '10번의 식사 나눔 또는 기술 전수',
    };
  } else if (role === SpiritRole.Craftsman || role === SpiritRole.Miner) {
    goal = {
      type: NpcGoalType.MasterCraft,
      progress: 0,
      target: 20,
      description: '20번 생산 달성하기',
    };
  } else if (role === SpiritRole.Fisher) {
    goal = {
      type: NpcGoalType.FindPeace,
      progress: 0,
      target: 30,
      description: '30일 동안 평온한 마음 유지하기',
    };
  } else {
    // GuildClerk, Meteorologist, Count, and others
    goal = {
      type: NpcGoalType.MakeFriend,
      progress: 0,
      target: 5,
      description: '친밀도 0.5 이상의 친구 5명 사귀기',
    };
  }

  npcGoals.set(actor.name, goal);
  return goal;
}

export function getNpcGoal(actorName: string): NpcGoal | undefined {
  return npcGoals.get(actorName);
}

// ============================================================
// Goal progress update
// ============================================================

export function updateNpcGoal(actor: Actor, goal: NpcGoal): void {
  switch (goal.type) {
    case NpcGoalType.SaveGold:
      goal.progress = Math.min(100, Math.round((actor.spirit.gold / goal.target) * 100));
      break;

    case NpcGoalType.ExploreWorld: {
      const explored = actor.getVariable('npc_locations_visited');
      goal.progress = Math.min(100, Math.round((explored / goal.target) * 100));
      break;
    }

    case NpcGoalType.HelpOthers: {
      // Count SharedMeal + TaughtSkill memories
      const helpCount = actor.memories.filter(
        m => m.type === MemoryType.SharedMeal || m.type === MemoryType.TaughtSkill
      ).length;
      goal.progress = Math.min(100, Math.round((helpCount / goal.target) * 100));
      break;
    }

    case NpcGoalType.MasterCraft: {
      // Count Produced memories
      const craftCount = actor.memories.filter(m => m.type === MemoryType.Produced).length;
      goal.progress = Math.min(100, Math.round((craftCount / goal.target) * 100));
      break;
    }

    case NpcGoalType.FindPeace: {
      let days = peacefulDays.get(actor.name) ?? 0;
      if (actor.base.mood > 0.3) days++;
      else days = 0;
      peacefulDays.set(actor.name, days);
      goal.progress = Math.min(100, Math.round((days / goal.target) * 100));
      break;
    }

    case NpcGoalType.MakeFriend: {
      let friendCount = 0;
      for (const rel of actor.relationships.values()) {
        if (rel.affinity >= 0.5) friendCount++;
      }
      goal.progress = Math.min(100, Math.round((friendCount / goal.target) * 100));
      break;
    }
  }
}

// ============================================================
// Goal description
// ============================================================

export function getNpcGoalDescription(goal: NpcGoal): string {
  const pct = goal.progress;
  const label = (() => {
    switch (goal.type) {
      case NpcGoalType.SaveGold:     return '부유한 삶을 꿈꾸며';
      case NpcGoalType.MakeFriend:   return '따뜻한 인연을 찾아';
      case NpcGoalType.MasterCraft:  return '장인의 경지를 향해';
      case NpcGoalType.ExploreWorld: return '넓은 세상을 향한 발걸음으로';
      case NpcGoalType.HelpOthers:   return '이웃을 위한 마음으로';
      case NpcGoalType.FindPeace:    return '마음의 평화를 찾아';
    }
  })();
  return `${label} — ${goal.description} (${pct}%)`;
}

// ============================================================
// Life Event definitions
// ============================================================

export interface NpcLifeEvent {
  id: string;
  name: string;
  description: string;
  check: (actor1: Actor, actor2: Actor, social: SocialHub) => boolean;
  execute: (actor1: Actor, actor2: Actor, social: SocialHub, backlog: Backlog, time: GameTime) => void;
  weight: number;
  cooldownDays: number;
}

// Cooldown tracking: key = `${eventId}:${actor1.name}:${actor2.name}`, value = last day triggered
const eventCooldowns = new Map<string, number>();

function cooldownKey(eventId: string, a1: string, a2: string): string {
  return `${eventId}:${a1}:${a2}`;
}

function isOnCooldown(eventId: string, a1: string, a2: string, cooldownDays: number, currentDay: number): boolean {
  const key = cooldownKey(eventId, a1, a2);
  const last = eventCooldowns.get(key);
  if (last === undefined) return false;
  return (currentDay - last) < cooldownDays;
}

function setCooldown(eventId: string, a1: string, a2: string, currentDay: number): void {
  eventCooldowns.set(cooldownKey(eventId, a1, a2), currentDay);
}

// ============================================================
// The eight warm life events
// ============================================================

const LIFE_EVENTS: NpcLifeEvent[] = [
  // 1. 우정의 시작 — Friendship Formed
  {
    id: 'friendship_formed',
    name: '우정의 시작',
    description: '두 NPC 사이에 진정한 우정이 싹텄다.',
    weight: 3,
    cooldownDays: 10,
    check(a1, a2, _social) {
      const rel = a1.relationships.get(a2.name);
      return (
        rel !== undefined &&
        rel.affinity > 0.4 &&
        rel.interactionCount >= 5 &&
        a1.currentLocation === a2.currentLocation
      );
    },
    execute(a1, a2, _social, backlog, time) {
      applyEventEffects(a1, a2, 'friendship_formed', {
        a1Mood: 0.1, a2Mood: 0.1, a1Trust: 0.1, a2Trust: 0.1,
      });
      const msg = buildEventMessage(
        'friendship_formed',
        '{a1}이(가) {a2}에게 조심스레 말했다. "이제 친구라고 불러도 될까?" {a2}이(가) 환하게 웃었다.',
        { a1: a1.name, a2: a2.name },
      );
      backlog.add(time, msg, '이벤트', a1.name, a1.currentLocation);

      const mw = getEventMemoryWeights('friendship_formed', 0.8, 0.8);
      a1.addMemory({
        type: MemoryType.CulturalBond, subject: a2.name,
        detail: `${a2.name}와(과) 친구가 되었다`,
        when: time.clone(), emotionalWeight: mw.a1,
      });
      a2.addMemory({
        type: MemoryType.CulturalBond, subject: a1.name,
        detail: `${a1.name}와(과) 친구가 되었다`,
        when: time.clone(), emotionalWeight: mw.a2,
      });
    },
  },

  // 2. 선물 교환 — Gift Exchange
  {
    id: 'gift_exchange',
    name: '선물 교환',
    description: '서로 작은 선물을 나누었다.',
    weight: 4,
    cooldownDays: 5,
    check(a1, a2, _social) {
      const rel = a1.relationships.get(a2.name);
      const hasGift =
        a1.getItemCountByType(ItemType.Food) > 0 ||
        a1.getItemCountByType(ItemType.Herb) > 0;
      return (
        rel !== undefined &&
        rel.affinity > 0.3 &&
        hasGift &&
        a1.currentLocation === a2.currentLocation
      );
    },
    execute(a1, a2, _social, backlog, time) {
      // Transfer a small gift (herb preferred, else food)
      const hasHerb = a1.getItemCountByType(ItemType.Herb) > 0;
      const giftType = hasHerb ? ItemType.Herb : ItemType.Food;
      a1.consumeItem(giftType, 1);
      a2.addItem(giftType, 1);
      const giftName = hasHerb ? '허브' : '먹을 것';

      applyEventEffects(a1, a2, 'gift_exchange', {
        a1Mood: 0.05, a2Mood: 0.05, a1Affinity: 0.05, a2Affinity: 0.05,
      });

      const msg = buildEventMessage(
        'gift_exchange',
        '{a1}이(가) {a2}에게 작은 {gift}을 선물했다. 두 사람의 얼굴에 미소가 번졌다.',
        { a1: a1.name, a2: a2.name, gift: giftName },
      );
      backlog.add(time, msg, '이벤트', a1.name, a1.currentLocation);

      const mw = getEventMemoryWeights('gift_exchange', 0.5, 0.5);
      a1.addMemory({
        type: MemoryType.SawGenerosity, subject: a2.name,
        detail: `${a2.name}에게 선물을 건넸다`,
        when: time.clone(), emotionalWeight: mw.a1,
      });
      a2.addMemory({
        type: MemoryType.GotHelpFrom, subject: a1.name,
        detail: `${a1.name}에게서 ${giftName}을 선물 받았다`,
        when: time.clone(), emotionalWeight: mw.a2,
      });
    },
  },

  // 3. 함께 산책 — Walk Together
  {
    id: 'walk_together',
    name: '함께 산책',
    description: '두 NPC가 나란히 산책을 즐겼다.',
    weight: 5,
    cooldownDays: 3,
    check(a1, a2, _social) {
      const rel = a1.relationships.get(a2.name);
      return (
        rel !== undefined &&
        rel.affinity > 0.2 &&
        a1.currentLocation === a2.currentLocation &&
        a1.base.mood >= 0 &&
        a2.base.mood >= 0 &&
        !a1.isNight()
      );
    },
    execute(a1, a2, _social, backlog, time) {
      applyEventEffects(a1, a2, 'walk_together', {
        a1Mood: 0.03, a2Mood: 0.03, a1Affinity: 0.02, a2Affinity: 0.02,
      });
      const msg = buildEventMessage(
        'walk_together',
        '{a1}와(과) {a2}이(가) 나란히 {location}을 거닐며 담소를 나눴다.',
        { a1: a1.name, a2: a2.name, location: a1.currentLocation },
      );
      backlog.add(time, msg, '이벤트', a1.name, a1.currentLocation);

      const mw = getEventMemoryWeights('walk_together', 0.3, 0.3);
      a1.addMemory({
        type: MemoryType.TalkedWith, subject: a2.name,
        detail: `${a2.name}와(과) 함께 산책했다`,
        when: time.clone(), emotionalWeight: mw.a1,
      });
      a2.addMemory({
        type: MemoryType.TalkedWith, subject: a1.name,
        detail: `${a1.name}와(과) 함께 산책했다`,
        when: time.clone(), emotionalWeight: mw.a2,
      });
    },
  },

  // 4. 요리 대접 — Cooking for a Friend
  {
    id: 'cooking_for_friend',
    name: '요리 대접',
    description: 'NPC가 배고픈 친구에게 요리를 대접했다.',
    weight: 4,
    cooldownDays: 2,
    check(a1, a2, _social) {
      const hasFood = a1.getItemCountByType(ItemType.Food) >= 1;
      return (
        hasFood &&
        a2.isHungry() &&
        a1.currentLocation === a2.currentLocation &&
        a1.base.mood >= -0.2
      );
    },
    execute(a1, a2, _social, backlog, time) {
      a1.consumeItem(ItemType.Food, 1);

      applyEventEffects(a1, a2, 'cooking_for_friend', {
        a1Mood: 0.08, a2Mood: 0.1,
        a1Trust: 0.05, a1Affinity: 0.05,
        a2Trust: 0.05, a2Affinity: 0.08,
      });

      const msg = buildEventMessage(
        'cooking_for_friend',
        '{a1}이(가) 배고픈 {a2}을 위해 정성껏 음식을 준비했다. "{a2}, 맛있게 먹어요!"',
        { a1: a1.name, a2: a2.name },
      );
      backlog.add(time, msg, '이벤트', a1.name, a1.currentLocation);

      const mw = getEventMemoryWeights('cooking_for_friend', 0.6, 0.7);
      a1.addMemory({
        type: MemoryType.SharedMeal, subject: a2.name,
        detail: `${a2.name}에게 음식을 나눠 주었다`,
        when: time.clone(), emotionalWeight: mw.a1,
      });
      a2.addMemory({
        type: MemoryType.SharedMeal, subject: a1.name,
        detail: `${a1.name}의 따뜻한 음식을 받아 먹었다`,
        when: time.clone(), emotionalWeight: mw.a2,
      });
    },
  },

  // 5. 이야기 나눔 — Story Sharing (requires a third actor at Alimes in the evening)
  {
    id: 'story_sharing',
    name: '이야기 나눔',
    description: '여럿이 모여 오래된 이야기를 나누며 웃음꽃이 피었다.',
    weight: 3,
    cooldownDays: 4,
    check(a1, a2, _social) {
      return (
        a1.currentLocation === Loc.Alimes &&
        a2.currentLocation === Loc.Alimes &&
        a1.lastTickHour >= 18 &&
        a1.lastTickHour < 22
      );
    },
    execute(a1, a2, _social, backlog, time) {
      applyEventEffects(a1, a2, 'story_sharing', {
        a1Mood: 0.06, a2Mood: 0.06, a1Affinity: 0.03, a2Affinity: 0.03,
      });
      const msg = buildEventMessage(
        'story_sharing',
        '선술집에서 {a1}와(과) {a2}이(가) 오래된 이야기를 나누며 웃음꽃이 피었다.',
        { a1: a1.name, a2: a2.name },
      );
      backlog.add(time, msg, '이벤트', a1.name, Loc.Alimes);

      const mw = getEventMemoryWeights('story_sharing', 0.5, 0.5);
      a1.addMemory({
        type: MemoryType.CelebratedTogether, subject: a2.name,
        detail: '선술집에서 함께 이야기꽃을 피웠다',
        when: time.clone(), emotionalWeight: mw.a1,
      });
      a2.addMemory({
        type: MemoryType.CelebratedTogether, subject: a1.name,
        detail: '선술집에서 함께 이야기꽃을 피웠다',
        when: time.clone(), emotionalWeight: mw.a2,
      });
    },
  },

  // 6. 꽃 선물 — Flower Gift
  {
    id: 'flower_gift',
    name: '꽃 선물',
    description: 'NPC가 소중한 상대에게 꽃을 선물했다.',
    weight: 2,
    cooldownDays: 7,
    check(a1, a2, _social) {
      const rel = a1.relationships.get(a2.name);
      const hasHerb = a1.getItemCountByType(ItemType.Herb) >= 1;
      return (
        rel !== undefined &&
        rel.affinity > 0.45 &&
        hasHerb &&
        a1.currentLocation === a2.currentLocation
      );
    },
    execute(a1, a2, _social, backlog, time) {
      a1.consumeItem(ItemType.Herb, 1);
      applyEventEffects(a1, a2, 'flower_gift', {
        a1Mood: 0.08, a2Mood: 0.08, a1Affinity: 0.05, a2Affinity: 0.05,
      });
      const msg = buildEventMessage(
        'flower_gift',
        '{a1}이(가) {a2}에게 작은 꽃 한 송이를 내밀었다. {a2}의 볼이 살짝 붉어졌다.',
        { a1: a1.name, a2: a2.name },
      );
      backlog.add(time, msg, '이벤트', a1.name, a1.currentLocation);

      const mw = getEventMemoryWeights('flower_gift', 0.7, 0.7);
      a1.addMemory({
        type: MemoryType.SawGenerosity, subject: a2.name,
        detail: `${a2.name}에게 꽃을 선물했다`,
        when: time.clone(), emotionalWeight: mw.a1,
      });
      a2.addMemory({
        type: MemoryType.GotHelpFrom, subject: a1.name,
        detail: `${a1.name}에게서 꽃을 선물 받았다`,
        when: time.clone(), emotionalWeight: mw.a2,
      });
    },
  },

  // 7. 함께 일하기 — Working Together
  {
    id: 'working_together',
    name: '함께 일하기',
    description: '두 NPC가 같은 곳에서 함께 일하며 정이 들었다.',
    weight: 4,
    cooldownDays: 3,
    check(a1, a2, _social) {
      const workLocations = [
        Loc.Moss_Forge, Loc.Farm, Loc.Herb_Garden,
        Loc.Abandoned_Mine, Loc.Erumen_Seoncheon,
      ] as string[];
      return (
        a1.currentLocation === a2.currentLocation &&
        workLocations.includes(a1.currentLocation) &&
        !a1.isNight()
      );
    },
    execute(a1, a2, _social, backlog, time) {
      applyEventEffects(a1, a2, 'working_together', {
        a1Mood: 0.04, a2Mood: 0.04,
        a1Trust: 0.03, a1Affinity: 0.03,
        a2Trust: 0.03, a2Affinity: 0.03,
      });
      const msg = buildEventMessage(
        'working_together',
        '{a1}와(과) {a2}이(가) 함께 일했다. "함께 일하니 두 배로 즐겁다!"',
        { a1: a1.name, a2: a2.name },
      );
      backlog.add(time, msg, '이벤트', a1.name, a1.currentLocation);

      const mw = getEventMemoryWeights('working_together', 0.4, 0.4);
      a1.addMemory({
        type: MemoryType.CooperatedWith, subject: a2.name,
        detail: `${a2.name}와(과) 함께 일했다`,
        when: time.clone(), emotionalWeight: mw.a1,
      });
      a2.addMemory({
        type: MemoryType.CooperatedWith, subject: a1.name,
        detail: `${a1.name}와(과) 함께 일했다`,
        when: time.clone(), emotionalWeight: mw.a2,
      });
    },
  },

  // 8. 축하하기 — Congratulations (goal milestone reached)
  {
    id: 'congratulations',
    name: '축하하기',
    description: '이웃 NPC들이 목표 달성을 함께 축하해 주었다.',
    weight: 2,
    cooldownDays: 7,
    check(a1, _a2, _social) {
      const goal = npcGoals.get(a1.name);
      if (!goal) return false;
      const prev = lastMilestone.get(a1.name) ?? 0;
      const milestones = [25, 50, 75, 100];
      return milestones.some(m => goal.progress >= m && prev < m);
    },
    execute(a1, a2, _social, backlog, time) {
      const goal = npcGoals.get(a1.name);
      if (!goal) return;

      const prev = lastMilestone.get(a1.name) ?? 0;
      const milestones = [25, 50, 75, 100];
      const reached = milestones.filter(m => goal.progress >= m && prev < m);
      if (reached.length === 0) return;
      const milestone = reached[reached.length - 1];
      lastMilestone.set(a1.name, milestone);

      applyEventEffects(a1, a2, 'congratulations', {
        a1Mood: 0.1, a2Mood: 0.05,
        a1Trust: 0.05, a1Affinity: 0.05,
        a2Trust: 0.03, a2Affinity: 0.03,
      });

      const pctLabel = milestone === 100 ? '목표를 완수했다' : `${milestone}% 달성했다`;
      const msg = buildEventMessage(
        'congratulations',
        '{a2}이(가) {a1}에게 말했다. "{a1}, {pctLabel}! 모두가 축하해 주었다!"',
        { a1: a1.name, a2: a2.name, pctLabel },
      );
      backlog.add(time, msg, '이벤트', a2.name, a1.currentLocation);

      const mw = getEventMemoryWeights('congratulations', 0.8, 0.5);
      a1.addMemory({
        type: MemoryType.CelebratedTogether, subject: a2.name,
        detail: `${a2.name}가(이) 나의 목표 달성을 축하해 주었다`,
        when: time.clone(), emotionalWeight: mw.a1,
      });
      a2.addMemory({
        type: MemoryType.CelebratedTogether, subject: a1.name,
        detail: `${a1.name}의 목표 달성을 함께 기뻐했다`,
        when: time.clone(), emotionalWeight: mw.a2,
      });
    },
  },
];

// ============================================================
// Main event runner
// ============================================================

export function checkNpcLifeEvents(
  actors: Actor[],
  social: SocialHub,
  backlog: Backlog,
  time: GameTime,
): string[] {
  const messages: string[] = [];

  // First, update all goals
  for (const actor of actors) {
    if (actor.playable) continue; // skip player character
    let goal = npcGoals.get(actor.name);
    if (!goal) {
      goal = assignNpcGoal(actor);
    }
    updateNpcGoal(actor, goal);
  }

  // Evaluate events for each ordered pair of NPCs
  for (let i = 0; i < actors.length; i++) {
    const a1 = actors[i];
    if (!a1.isAlive() || a1.playable) continue;

    for (let j = 0; j < actors.length; j++) {
      if (i === j) continue;
      const a2 = actors[j];
      if (!a2.isAlive() || a2.playable) continue;

      // Collect eligible events (튜닝 데이터의 weight/cooldown override 적용)
      const eligible: { event: NpcLifeEvent; weight: number }[] = [];
      for (const event of LIFE_EVENTS) {
        const tuned = getRuntimeTuning(event);
        if (isOnCooldown(event.id, a1.name, a2.name, tuned.cooldownDays, time.day)) continue;
        if (event.check(a1, a2, social)) {
          eligible.push({ event, weight: tuned.weight });
        }
      }

      if (eligible.length === 0) continue;

      // Weighted random selection
      const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
      let roll = Math.random() * totalWeight;
      let chosen: NpcLifeEvent | undefined;
      for (const e of eligible) {
        roll -= e.weight;
        if (roll <= 0) { chosen = e.event; break; }
      }
      if (!chosen) chosen = eligible[eligible.length - 1].event;

      // Execute and record
      chosen.execute(a1, a2, social, backlog, time);
      setCooldown(chosen.id, a1.name, a2.name, time.day);
      messages.push(`[${chosen.name}] ${a1.name} & ${a2.name}`);
    }
  }

  return messages;
}
