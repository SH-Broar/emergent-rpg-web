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

// ============================================================
// Settlement locations — 축제, 마을 개선 등에 사용
// ============================================================

const SETTLEMENT_LOCATIONS = new Set<string>([
  Loc.Alimes, Loc.Guild_Hall, Loc.Market_Square,
  Loc.Hanabridge, Loc.Farm, Loc.Moss_Forge,
]);

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
    const npcs = getNPCsAtLocation(actor, allActors);
    const hour = actor.lastTickHour;
    const isEvening = hour >= 18 && hour < 24;
    return npcs.length >= 5 && isEvening && actor.spirit.gold >= 50;
  },
  execute: (actor, _world, social, allActors, backlog, time) => {
    actor.addGold(-50);

    const locId = actor.currentLocation;
    const locLabel = locationName(locId);
    const npcs = getNPCsAtLocation(actor, allActors);

    for (const npc of npcs) {
      npc.adjustMood(0.1);
      npc.adjustRelationship(actor.name, 0.03, 0.04);
      actor.adjustRelationship(npc.name, 0.03, 0.04);
      npc.addMemory({
        type: MemoryType.CelebratedTogether,
        subject: actor.name,
        detail: `${locLabel}에서 열린 축제`,
        when: time.clone(),
        emotionalWeight: 0.6,
      });
    }

    const rumor: Rumor = {
      content: `${locLabel}에서 ${actor.name}${iGa(actor.name)} 연 축제가 정말 즐거웠대요!`,
      originActor: actor.name,
      createdAt: time.clone(),
      spreadCount: 0,
      importance: 0.7,
      relatedElement: -1,
      elementDelta: 0,
    };
    social.addRumor(rumor);

    const msg = `${locLabel}에서 축제가 열렸다! 모두가 즐거운 시간을 보냈다.`;
    backlog.add(time, msg, '행동', actor.name, locId);
    return msg;
  },
};

// ============================================================
// Action 2: 소문 전파 (Share News)
// ============================================================

const NEWS_TEMPLATES = [
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
    const npcs = getNPCsAtLocation(actor, allActors);
    return npcs.length >= 1;
  },
  execute: (actor, _world, social, allActors, backlog, time) => {

    const locId = actor.currentLocation;
    const npcs = getNPCsAtLocation(actor, allActors);
    const template = NEWS_TEMPLATES[Math.floor(Math.random() * NEWS_TEMPLATES.length)];
    const content = `${actor.name}${eulReul(actor.name)} 통해 들었는데, ${template}!`;

    const rumor: Rumor = {
      content,
      originActor: actor.name,
      createdAt: time.clone(),
      spreadCount: 0,
      importance: 0.4,
      relatedElement: -1,
      elementDelta: 0,
    };
    social.addRumor(rumor);

    for (const npc of npcs) {
      npc.addMemory({
        type: MemoryType.HeardRumor,
        subject: actor.name,
        detail: template,
        when: time.clone(),
        emotionalWeight: 0.2,
      });
    }

    const msg = '소문이 퍼지기 시작했다...';
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
    const isSettlement = SETTLEMENT_LOCATIONS.has(actor.currentLocation);
    const hasOre = actor.spirit.inventory.get(ItemType.OreCommon) ?? 0;
    return (
      isSettlement &&
      actor.spirit.gold >= 100 &&
      hasOre >= 5
    );
  },
  execute: (actor, world, _social, _allActors, backlog, time) => {
    actor.addGold(-100);
    actor.consumeItem(ItemType.OreCommon, 5);

    const locId = actor.currentLocation;
    const locLabel = locationName(locId);
    const loc = world.getLocation(locId);

    // Increase all resource capacities by 10%
    for (const [, cap] of loc.resourceCaps) {
      cap.capacity = Math.floor(cap.capacity * 1.1);
    }

    // Also increase current resources slightly
    for (const [item, amount] of loc.resources) {
      loc.resources.set(item, Math.floor(amount * 1.05));
    }

    // Defense bonus via dangerLevel reduction
    loc.dangerLevel = Math.max(0, loc.dangerLevel - 0.5);

    const msg = `${locLabel}의 시설이 개선되었다.`;
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
    const npcs = getNPCsAtLocation(actor, allActors);
    const foodCount = actor.spirit.inventory.get(ItemType.Food) ?? 0;
    return npcs.length >= 3 && foodCount >= 3;
  },
  execute: (actor, _world, _social, allActors, backlog, time) => {
    actor.consumeItem(ItemType.Food, 3);

    const locId = actor.currentLocation;
    const npcs = getNPCsAtLocation(actor, allActors);

    for (const npc of npcs) {
      npc.adjustMood(0.08);
      npc.adjustRelationship(actor.name, 0.05, 0.05);
      actor.adjustRelationship(npc.name, 0.05, 0.05);
      npc.addMemory({
        type: MemoryType.SharedMeal,
        subject: actor.name,
        detail: `${actor.name}${iGa(actor.name)} 나눠준 따뜻한 식사`,
        when: time.clone(),
        emotionalWeight: 0.5,
      });
    }

    const msg = '따뜻한 식사를 나누었다. 모두의 표정이 밝아졌다.';
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
    const isAtGuild = actor.currentLocation === Loc.Guild_Hall;
    const adventurers = allActors.filter(
      a => a !== actor &&
        a.currentLocation === actor.currentLocation &&
        a.spirit.role === SpiritRole.Adventurer
    );
    return (
      isAtGuild &&
      actor.spirit.gold >= 30 &&
      adventurers.length >= 1 &&
      !actor.hasItem(EXPEDITION_FLAG)
    );
  },
  execute: (actor, _world, _social, allActors, backlog, time) => {
    actor.addGold(-30);

    const locId = actor.currentLocation;
    const adventurers = allActors.filter(
      a => a !== actor &&
        a.currentLocation === actor.currentLocation &&
        a.spirit.role === SpiritRole.Adventurer
    );

    // Pick 1-2 companions — prefer those with more interactions with the player
    adventurers.sort((a, b) => {
      const aRel = a.relationships.get(actor.name)?.interactionCount ?? 0;
      const bRel = b.relationships.get(actor.name)?.interactionCount ?? 0;
      return bRel - aRel;
    });
    const companions = adventurers.slice(0, Math.min(2, adventurers.length));

    // Set expedition flag on player (cleared on dungeon completion)
    actor.addItemById(EXPEDITION_FLAG, 1);

    // Combat bonus flag: stored as a count representing +20% damage tiers
    actor.addItemById('expedition_combat_bonus', companions.length);

    for (const companion of companions) {
      companion.adjustRelationship(actor.name, 0.04, 0.05);
      actor.adjustRelationship(companion.name, 0.04, 0.05);
    }

    const npc1 = companions[0]?.name ?? '용감한 모험가';
    const suffix = iGa(npc1);
    const msg = `원정대를 모집했다! ${npc1}${suffix} 동행하겠다고 했다.`;
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

    target.adjustMood(0.1);
    target.adjustRelationship(actor.name, 0.1, 0.1);
    actor.adjustRelationship(target.name, 0.05, 0.05);

    target.addMemory({
      type: MemoryType.SawGenerosity,
      subject: actor.name,
      detail: `${actor.name}에게서 선물을 받았다`,
      when: time.clone(),
      emotionalWeight: 0.7,
    });

    // High-affinity NPCs may reciprocate (affinity > 0.5)
    const rel = target.relationships.get(actor.name);
    if (rel && rel.affinity > 0.5) {
      // Add a generic gift back to the player as a small token
      actor.addItemById(`${GIFT_ITEM_PREFIX}reciprocated`, 1);
      target.addMemory({
        type: MemoryType.SawGenerosity,
        subject: target.name,
        detail: `${actor.name}에게 답례 선물을 건넸다`,
        when: time.clone(),
        emotionalWeight: 0.4,
      });
    }

    const playerSuffix = iGa(actor.name);
    const targetSuffix = eulReul(target.name);
    const msg = `${actor.name}${playerSuffix} ${target.name}${targetSuffix} 선물을 건넸다.`;
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
