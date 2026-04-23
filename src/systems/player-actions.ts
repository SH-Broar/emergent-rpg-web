// player-actions.ts — 플레이어 세계 영향 시스템
// 플레이어가 커뮤니티의 소중한 일원으로서 세계에 긍정적인 영향을 줄 수 있는 행동들

import { Actor } from '../models/actor';
import { World } from '../models/world';
import { SocialHub, MemoryType, Rumor } from '../models/social';
import { Backlog } from '../models/backlog';
import { GameTime } from '../types/game-time';
import { ItemType, SpiritRole } from '../types/enums';
import { Loc } from '../types/location';
import { locationName } from '../types/registry';
import { iGa, eulReul } from '../data/josa';
import {
  getPlayerActionTuning, getSettlementLocations, formatActionMessage,
  type PlayerActionTuning,
} from '../data/player-action-defs';

// ============================================================
// Settlement locations — 축제, 마을 개선 등에 사용
// 데이터(public/data/player_actions.txt [__SettlementLocations])가 있으면 우선 사용.
// ============================================================

const SETTLEMENT_LOCATIONS_FALLBACK = new Set<string>([
  Loc.Alimes, Loc.Guild_Hall, Loc.Market_Square,
  Loc.Hanabridge, Loc.Farm, Loc.Moss_Forge,
]);

function isSettlementLocation(locId: string): boolean {
  const data = getSettlementLocations();
  if (data.size > 0) return data.has(locId);
  return SETTLEMENT_LOCATIONS_FALLBACK.has(locId);
}

// ============================================================
// 튜닝 데이터 접근 헬퍼
// ============================================================

function tuning(actionId: string): PlayerActionTuning | undefined {
  return getPlayerActionTuning(actionId);
}

/** 런타임 vigorCost / goldCost 조회 (UI 표시 및 자원 차감용) */
export function getActionCost(action: PlayerAction): { vigorCost: number; goldCost: number } {
  const t = tuning(action.id);
  return {
    vigorCost: t?.vigorCost ?? action.vigorCost,
    goldCost: t?.goldCost ?? action.goldCost,
  };
}

// ============================================================
// PlayerAction interface
// ============================================================

export interface PlayerAction {
  id: string;
  name: string;
  description: string;
  vigorCost: number;
  goldCost: number;
  requirements: (actor: Actor, world: World, social: SocialHub, allActors: Actor[]) => boolean;
  execute: (actor: Actor, world: World, social: SocialHub, allActors: Actor[], backlog: Backlog, time: GameTime) => string;
}

// ============================================================
// Helper: gather NPCs at same location as player
// ============================================================

function getNPCsAtLocation(actor: Actor, allActors: Actor[]): Actor[] {
  return allActors.filter(a => a !== actor && a.currentLocation === actor.currentLocation);
}

// ============================================================
// Action 1: 축제 개최 (Host Festival)
// ============================================================

const hostFestival: PlayerAction = {
  id: 'host_festival',
  name: '축제 개최',
  description: '마을 사람들을 모아 축제를 엽니다. 모두의 기분이 좋아지고 유대감이 깊어집니다.',
  vigorCost: 20,
  goldCost: 50,
  requirements: (actor, _world, _social, allActors) => {
    const t = tuning('host_festival');
    const minNpcs = t?.minNpcs ?? 5;
    const minHour = t?.minHour ?? 18;
    const maxHour = t?.maxHour ?? 24;
    const goldCost = t?.goldCost ?? 50;
    const npcs = getNPCsAtLocation(actor, allActors);
    const hour = actor.lastTickHour;
    const isEvening = hour >= minHour && hour < maxHour;
    return npcs.length >= minNpcs && isEvening && actor.spirit.gold >= goldCost;
  },
  execute: (actor, _world, social, allActors, backlog, time) => {
    const t = tuning('host_festival');
    const goldCost = t?.goldCost ?? 50;
    actor.addGold(-goldCost);

    const locId = actor.currentLocation;
    const locLabel = locationName(locId);
    const npcs = getNPCsAtLocation(actor, allActors);

    const npcMood = t?.npcMoodDelta ?? 0.1;
    const npcTrust = t?.npcTrustDelta ?? 0.03;
    const npcAff = t?.npcAffinityDelta ?? 0.04;
    const playerTrust = t?.playerTrustDelta ?? 0.03;
    const playerAff = t?.playerAffinityDelta ?? 0.04;
    const memWeight = t?.memoryWeight ?? 0.6;

    for (const npc of npcs) {
      npc.adjustMood(npcMood);
      npc.adjustRelationship(actor.name, npcTrust, npcAff);
      actor.adjustRelationship(npc.name, playerTrust, playerAff);
      npc.addMemory({
        type: MemoryType.CelebratedTogether,
        subject: actor.name,
        detail: `${locLabel}에서 열린 축제`,
        when: time.clone(),
        emotionalWeight: memWeight,
      });
    }

    const rumorTpl = t?.rumorTemplate
      ?? '{location}에서 {actor}이(가) 연 축제가 정말 즐거웠대요!';
    const rumor: Rumor = {
      content: formatActionMessage(rumorTpl, { location: locLabel, actor: actor.name }),
      originActor: actor.name,
      createdAt: time.clone(),
      spreadCount: 0,
      importance: t?.rumorImportance ?? 0.7,
      relatedElement: -1,
      elementDelta: 0,
    };
    social.addRumor(rumor);

    const msgTpl = t?.message ?? '{location}에서 축제가 열렸다! 모두가 즐거운 시간을 보냈다.';
    const msg = formatActionMessage(msgTpl, { location: locLabel, actor: actor.name });
    backlog.add(time, msg, '행동', actor.name, locId);
    return msg;
  },
};

// ============================================================
// Action 2: 소문 전파 (Share News)
// ============================================================

/** 데이터 미로드 시 사용할 폴백 소문 템플릿 */
const NEWS_TEMPLATES_FALLBACK = [
  '동쪽에 좋은 사냥터가 있대요',
  '올해 수확이 풍성할 거래요',
  '새로운 광맥이 발견됐대요',
  '강 건너 마을에 새 상인이 왔대요',
  '이번 주 날씨가 아주 좋을 거래요',
];

const shareNews: PlayerAction = {
  id: 'share_news',
  name: '소문 전파',
  description: '마을 사람들에게 좋은 소식을 전합니다. 소문은 멀리멀리 퍼져나갑니다.',
  vigorCost: 5,
  goldCost: 0,
  requirements: (actor, _world, _social, allActors) => {
    const minNpcs = tuning('share_news')?.minNpcs ?? 1;
    return getNPCsAtLocation(actor, allActors).length >= minNpcs;
  },
  execute: (actor, _world, social, allActors, backlog, time) => {
    const t = tuning('share_news');
    const locId = actor.currentLocation;
    const npcs = getNPCsAtLocation(actor, allActors);
    const newsList = (t?.newsTemplates && t.newsTemplates.length > 0)
      ? t.newsTemplates
      : NEWS_TEMPLATES_FALLBACK;
    const template = newsList[Math.floor(Math.random() * newsList.length)];
    const content = `${actor.name}${eulReul(actor.name)} 통해 들었는데, ${template}!`;

    const rumor: Rumor = {
      content,
      originActor: actor.name,
      createdAt: time.clone(),
      spreadCount: 0,
      importance: t?.rumorImportance ?? 0.4,
      relatedElement: -1,
      elementDelta: 0,
    };
    social.addRumor(rumor);

    const memWeight = t?.memoryWeight ?? 0.2;
    for (const npc of npcs) {
      npc.addMemory({
        type: MemoryType.HeardRumor,
        subject: actor.name,
        detail: template,
        when: time.clone(),
        emotionalWeight: memWeight,
      });
    }

    const msg = t?.message ?? '소문이 퍼지기 시작했다...';
    backlog.add(time, msg, '행동', actor.name, locId);
    return msg;
  },
};

// ============================================================
// Action 3: 마을 개선 (Improve Village)
// ============================================================

const improveVillage: PlayerAction = {
  id: 'improve_village',
  name: '마을 개선',
  description: '광석과 금화로 마을 시설을 개선합니다. 자원 용량이 늘어나고 마을이 더 안전해집니다.',
  vigorCost: 30,
  goldCost: 100,
  requirements: (actor, _world, _social, _allActors) => {
    const t = tuning('improve_village');
    const goldCost = t?.goldCost ?? 100;
    const minOre = t?.minOre ?? 5;
    return (
      isSettlementLocation(actor.currentLocation) &&
      actor.spirit.gold >= goldCost &&
      actor.getItemCountByType(ItemType.OreCommon) >= minOre
    );
  },
  execute: (actor, world, _social, _allActors, backlog, time) => {
    const t = tuning('improve_village');
    const goldCost = t?.goldCost ?? 100;
    const oreCost = t?.minOre ?? 5;
    const capMul = t?.capacityMultiplier ?? 1.1;
    const resMul = t?.resourceMultiplier ?? 1.05;
    const dangerCut = t?.dangerReduction ?? 0.5;

    actor.addGold(-goldCost);
    actor.consumeItem(ItemType.OreCommon, oreCost);

    const locId = actor.currentLocation;
    const locLabel = locationName(locId);
    const loc = world.getLocation(locId);

    for (const [, cap] of loc.resourceCaps) {
      cap.capacity = Math.floor(cap.capacity * capMul);
    }
    for (const [item, amount] of loc.resources) {
      loc.resources.set(item, Math.floor(amount * resMul));
    }
    loc.dangerLevel = Math.max(0, loc.dangerLevel - dangerCut);

    const msgTpl = t?.message ?? '{location}의 시설이 개선되었다.';
    const msg = formatActionMessage(msgTpl, { location: locLabel, actor: actor.name });
    backlog.add(time, msg, '행동', actor.name, locId);
    return msg;
  },
};

// ============================================================
// Action 4: 요리 나눔 (Community Meal)
// ============================================================

const communityMeal: PlayerAction = {
  id: 'community_meal',
  name: '요리 나눔',
  description: '직접 만든 요리를 마을 사람들과 나눕니다. 따뜻한 식사가 모두의 마음을 밝힙니다.',
  vigorCost: 10,
  goldCost: 0,
  requirements: (actor, _world, _social, allActors) => {
    const t = tuning('community_meal');
    const minNpcs = t?.minNpcs ?? 3;
    const foodCost = t?.foodCost ?? 3;
    return getNPCsAtLocation(actor, allActors).length >= minNpcs
      && actor.getItemCountByType(ItemType.Food) >= foodCost;
  },
  execute: (actor, _world, _social, allActors, backlog, time) => {
    const t = tuning('community_meal');
    const foodCost = t?.foodCost ?? 3;
    actor.consumeItem(ItemType.Food, foodCost);

    const locId = actor.currentLocation;
    const npcs = getNPCsAtLocation(actor, allActors);

    const npcMood = t?.npcMoodDelta ?? 0.08;
    const npcTrust = t?.npcTrustDelta ?? 0.05;
    const npcAff = t?.npcAffinityDelta ?? 0.05;
    const playerTrust = t?.playerTrustDelta ?? 0.05;
    const playerAff = t?.playerAffinityDelta ?? 0.05;
    const memWeight = t?.memoryWeight ?? 0.5;

    for (const npc of npcs) {
      npc.adjustMood(npcMood);
      npc.adjustRelationship(actor.name, npcTrust, npcAff);
      actor.adjustRelationship(npc.name, playerTrust, playerAff);
      npc.addMemory({
        type: MemoryType.SharedMeal,
        subject: actor.name,
        detail: `${actor.name}${iGa(actor.name)} 나눠준 따뜻한 식사`,
        when: time.clone(),
        emotionalWeight: memWeight,
      });
    }

    const msg = t?.message ?? '따뜻한 식사를 나누었다. 모두의 표정이 밝아졌다.';
    backlog.add(time, msg, '행동', actor.name, locId);
    return msg;
  },
};

// ============================================================
// Action 5: 원정대 모집 (Form Expedition)
// ============================================================

/** Flag key stored in actor.items to track active expedition companions */
export const EXPEDITION_FLAG = 'expedition_active';

const formExpedition: PlayerAction = {
  id: 'form_expedition',
  name: '원정대 모집',
  description: '길드에서 모험가를 모집해 함께 던전에 도전합니다. 동료와 함께라면 더 강해집니다.',
  vigorCost: 15,
  goldCost: 30,
  requirements: (actor, _world, _social, allActors) => {
    const t = tuning('form_expedition');
    const goldCost = t?.goldCost ?? 30;
    const isAtGuild = actor.currentLocation === Loc.Guild_Hall;
    const adventurers = allActors.filter(
      a => a !== actor &&
        a.currentLocation === actor.currentLocation &&
        a.spirit.role === SpiritRole.Adventurer
    );
    return (
      isAtGuild &&
      actor.spirit.gold >= goldCost &&
      adventurers.length >= 1 &&
      !actor.hasItem(EXPEDITION_FLAG)
    );
  },
  execute: (actor, _world, _social, allActors, backlog, time) => {
    const t = tuning('form_expedition');
    const goldCost = t?.goldCost ?? 30;
    const maxCompanions = t?.maxCompanions ?? 2;
    const compTrust = t?.companionTrustDelta ?? 0.04;
    const compAff = t?.companionAffinityDelta ?? 0.05;
    const playerTrust = t?.playerTrustDelta ?? 0.04;
    const playerAff = t?.playerAffinityDelta ?? 0.05;

    actor.addGold(-goldCost);

    const locId = actor.currentLocation;
    const adventurers = allActors.filter(
      a => a !== actor &&
        a.currentLocation === actor.currentLocation &&
        a.spirit.role === SpiritRole.Adventurer
    );
    adventurers.sort((a, b) => {
      const aRel = a.relationships.get(actor.name)?.interactionCount ?? 0;
      const bRel = b.relationships.get(actor.name)?.interactionCount ?? 0;
      return bRel - aRel;
    });
    const companions = adventurers.slice(0, Math.min(maxCompanions, adventurers.length));

    actor.addItemById(EXPEDITION_FLAG, 1);
    actor.addItemById('expedition_combat_bonus', companions.length);

    for (const companion of companions) {
      companion.adjustRelationship(actor.name, compTrust, compAff);
      actor.adjustRelationship(companion.name, playerTrust, playerAff);
    }

    const npc1 = companions[0]?.name ?? '용감한 모험가';
    const suffix = iGa(npc1);
    const msgTpl = t?.message ?? '원정대를 모집했다! {npc}이(가) 동행하겠다고 했다.';
    // 기본 템플릿이 "이(가)" 보조사를 포함하므로, 데이터가 그대로 쓰일 때를 위해 suffix 변수도 함께 전달.
    const msg = formatActionMessage(msgTpl, { npc: npc1, actor: actor.name }).replace('이(가)', suffix);
    backlog.add(time, msg, '행동', actor.name, locId);
    return msg;
  },
};

// ============================================================
// Action 6: 선물 주기 (Give Gift)
// ============================================================

/** Item ID prefix for gift items — any item tagged 'gift_' counts */
export const GIFT_ITEM_PREFIX = 'gift_';

const giveGift: PlayerAction = {
  id: 'give_gift',
  name: '선물 주기',
  description: '마음을 담은 선물로 누군가와의 유대를 깊게 합니다.',
  vigorCost: 0,
  goldCost: 0,
  requirements: (actor, _world, _social, allActors) => {
    const hasGift = [...actor.items.entries()].some(
      ([id, qty]) => id.startsWith(GIFT_ITEM_PREFIX) && qty > 0
    );
    const hasNPC = getNPCsAtLocation(actor, allActors).length >= 1;
    return hasGift && hasNPC;
  },
  execute: (actor, _world, _social, allActors, backlog, time) => {
    const locId = actor.currentLocation;

    // Find first gift item in inventory
    const giftEntry = [...actor.items.entries()].find(
      ([id, qty]) => id.startsWith(GIFT_ITEM_PREFIX) && qty > 0
    );
    if (!giftEntry) return '선물이 없어 건네지 못했다.';

    const [giftId] = giftEntry;
    actor.removeItemById(giftId, 1);

    // Give to nearest NPC (first one found at location)
    const npcs = getNPCsAtLocation(actor, allActors);
    const target = npcs[0];
    if (!target) return '선물을 건넬 사람이 없다.';

    const t = tuning('give_gift');
    const tgtMood = t?.targetMoodDelta ?? 0.1;
    const tgtTrust = t?.targetTrustDelta ?? 0.1;
    const tgtAff = t?.targetAffinityDelta ?? 0.1;
    const playerTrust = t?.playerTrustDelta ?? 0.05;
    const playerAff = t?.playerAffinityDelta ?? 0.05;
    const tgtMemWeight = t?.targetMemoryWeight ?? 0.7;
    const reciprocateThreshold = t?.reciprocateAffinityThreshold ?? 0.5;
    const reciprocateMemWeight = t?.reciprocateMemoryWeight ?? 0.4;

    target.adjustMood(tgtMood);
    target.adjustRelationship(actor.name, tgtTrust, tgtAff);
    actor.adjustRelationship(target.name, playerTrust, playerAff);

    target.addMemory({
      type: MemoryType.SawGenerosity,
      subject: actor.name,
      detail: `${actor.name}에게서 선물을 받았다`,
      when: time.clone(),
      emotionalWeight: tgtMemWeight,
    });

    // High-affinity NPCs may reciprocate
    const rel = target.relationships.get(actor.name);
    if (rel && rel.affinity > reciprocateThreshold) {
      actor.addItemById(`${GIFT_ITEM_PREFIX}reciprocated`, 1);
      target.addMemory({
        type: MemoryType.SawGenerosity,
        subject: target.name,
        detail: `${actor.name}에게 답례 선물을 건넸다`,
        when: time.clone(),
        emotionalWeight: reciprocateMemWeight,
      });
    }

    // 기본 메시지는 한국어 보조사를 동적으로 처리. 데이터 메시지가 있으면 단순 치환.
    let msg: string;
    if (t?.message) {
      msg = formatActionMessage(t.message, { actor: actor.name, target: target.name });
    } else {
      const playerSuffix = iGa(actor.name);
      const targetSuffix = eulReul(target.name);
      msg = `${actor.name}${playerSuffix} ${target.name}${targetSuffix} 선물을 건넸다.`;
    }
    backlog.add(time, msg, '행동', actor.name, locId);
    return msg;
  },
};

// ============================================================
// Master action registry
// ============================================================

const ALL_PLAYER_ACTIONS: PlayerAction[] = [
  hostFestival,
  shareNews,
  improveVillage,
  communityMeal,
  formExpedition,
  giveGift,
];

// ============================================================
// Public API
// ============================================================

/** Returns every registered player action regardless of availability. */
export function getAllPlayerActions(): PlayerAction[] {
  return [...ALL_PLAYER_ACTIONS];
}

/**
 * Returns the subset of actions the player can currently take,
 * given their current state and the world.
 */
export function getAvailablePlayerActions(
  actor: Actor,
  world: World,
  social: SocialHub,
  allActors: Actor[],
  _time: GameTime,
): PlayerAction[] {
  return ALL_PLAYER_ACTIONS.filter(action =>
    action.requirements(actor, world, social, allActors)
  );
}

/**
 * Executes a player action and returns the narrative result string.
 * Does NOT re-check requirements — caller should verify with getAvailablePlayerActions first.
 */
export function executePlayerAction(
  action: PlayerAction,
  actor: Actor,
  world: World,
  social: SocialHub,
  allActors: Actor[],
  backlog: Backlog,
  time: GameTime,
): string {
  return action.execute(actor, world, social, allActors, backlog, time);
}
