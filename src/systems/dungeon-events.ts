// dungeon-events.ts — 던전 탐험 이벤트 시스템
// 라이트 슬로우 라이프 판타지 테마: 젤다풍 따뜻한 탐험

import { Actor } from '../models/actor';
import { parseItemType } from '../types/enums';
import { randomFloat, weightedRandomChoice } from '../types/rng';
import { grantLootByCategory } from './loot-helpers';

export interface DungeonOutcome {
  message: string;
  hpChange?: number;
  moodChange?: number;
  itemReward?: { type: string; amount: number };
  progressBonus?: number;  // bonus dungeon progress
  colorInfluence?: number[];  // 8-element array
}

export interface DungeonChoice {
  label: string;
  description: string;
  outcome: DungeonOutcome;
}

export interface DungeonExplorationEvent {
  id: string;
  name: string;
  description: string;
  choices: DungeonChoice[];
  weight: number;  // probability weight for random selection
  minProgress: number;  // minimum dungeon progress to trigger (0-100)
}

// ~70% positive, ~20% neutral, ~10% mildly challenging
const EVENTS: DungeonExplorationEvent[] = [
  // --- Positive events ---
  {
    id: 'hidden_garden',
    name: '숨겨진 정원',
    description: '동굴 깊은 곳에 햇빛이 들어오는 아름다운 정원이 있다!',
    choices: [
      {
        label: '꽃을 감상한다',
        description: '잠시 쉬어가기',
        outcome: { message: '아름다운 꽃에 마음이 편안해졌다.', moodChange: 0.1 },
      },
      {
        label: '약초를 채집한다',
        description: '허브 획득',
        outcome: { message: '귀한 약초를 발견했다!', itemReward: { type: 'Herb', amount: 2 } },
      },
    ],
    weight: 15,
    minProgress: 10,
  },
  {
    id: 'friendly_spirit',
    name: '친절한 정령',
    description: '작은 빛나는 정령이 길을 안내하려 한다.',
    choices: [
      {
        label: '따라간다',
        description: '정령의 안내',
        outcome: { message: '정령이 보물이 있는 방으로 안내해 주었다!', itemReward: { type: 'OreRare', amount: 1 }, progressBonus: 10 },
      },
      {
        label: '인사하고 보내준다',
        description: '정중히 거절',
        outcome: { message: '정령이 기분 좋게 떠나며 축복을 남겼다.', moodChange: 0.05, hpChange: 20 },
      },
    ],
    weight: 12,
    minProgress: 0,
  },
  {
    id: 'underground_spring',
    name: '지하 샘물',
    description: '맑고 깨끗한 지하 샘물이 솟아오르고 있다.',
    choices: [
      {
        label: '마신다',
        description: '기운이 솟을 것 같다',
        outcome: { message: '시원한 물이 온몸에 활력을 준다!', hpChange: 10 },
      },
      {
        label: '물병에 담는다',
        description: '포션 재료로',
        outcome: { message: '깨끗한 물을 담았다.', itemReward: { type: 'Potion', amount: 1 } },
      },
    ],
    weight: 15,
    minProgress: 0,
  },
  {
    id: 'ancient_mural',
    name: '고대 벽화',
    description: '벽면에 아름다운 고대 벽화가 그려져 있다. 무언가 배울 수 있을 것 같다.',
    choices: [
      {
        label: '자세히 살펴본다',
        description: '지식을 얻을 수 있다',
        outcome: { message: '벽화에서 고대의 지혜를 배웠다.', colorInfluence: [0, 0, 0.02, 0, 0, 0, 0.02, 0] },
      },
      {
        label: '스케치한다',
        description: '기록으로 남긴다',
        outcome: { message: '귀중한 발견을 기록했다.', progressBonus: 5, moodChange: 0.05 },
      },
    ],
    weight: 10,
    minProgress: 20,
  },
  {
    id: 'lost_traveler',
    name: '길 잃은 여행자',
    description: '던전에서 길을 잃은 여행자를 만났다.',
    choices: [
      {
        label: '함께 나간다',
        description: '도와준다',
        outcome: { message: '여행자가 감사의 선물을 건넸다.', itemReward: { type: 'Gift', amount: 1 }, moodChange: 0.08 },
      },
      {
        label: '지도를 그려준다',
        description: '출구를 알려준다',
        outcome: { message: '여행자가 고마워하며 정보를 알려줬다.', progressBonus: 8 },
      },
    ],
    weight: 10,
    minProgress: 15,
  },
  {
    id: 'mushroom_grove',
    name: '버섯 군락',
    description: '형형색색의 빛나는 버섯들이 자라고 있다.',
    choices: [
      {
        label: '채집한다',
        description: '식재료 획득',
        outcome: { message: '맛있는 버섯을 채집했다!', itemReward: { type: 'Food', amount: 3 } },
      },
      {
        label: '관찰한다',
        description: '신비로운 풍경',
        outcome: { message: '빛나는 버섯들 사이에서 마음이 평온해졌다.', moodChange: 0.08 },
      },
    ],
    weight: 12,
    minProgress: 5,
  },
  // --- Neutral events ---
  {
    id: 'fork_in_road',
    name: '갈림길',
    description: '길이 둘로 나뉜다. 한쪽은 넓고 밝고, 다른 쪽은 좁지만 신비한 빛이 보인다.',
    choices: [
      {
        label: '넓은 길',
        description: '안전한 선택',
        outcome: { message: '순조롭게 나아갔다.', progressBonus: 5 },
      },
      {
        label: '좁은 길',
        description: '모험적 선택',
        outcome: { message: '숨겨진 보물을 발견했다!', itemReward: { type: 'OreCommon', amount: 3 }, progressBonus: 8 },
      },
    ],
    weight: 15,
    minProgress: 10,
  },
  // --- Mild challenge (not punishing) ---
  {
    id: 'puzzle_door',
    name: '수수께끼 문',
    description: '아름다운 문양이 새겨진 문이 앞을 막고 있다.',
    choices: [
      {
        label: '문양을 풀어본다',
        description: '지혜 도전',
        outcome: { message: '문이 열리며 보물이 나타났다!', itemReward: { type: 'Equipment', amount: 1 }, progressBonus: 10 },
      },
      {
        label: '다른 길을 찾는다',
        description: '우회',
        outcome: { message: '돌아가는 길을 찾았다.', progressBonus: 3 },
      },
    ],
    weight: 10,
    minProgress: 25,
  },
  {
    id: 'vine_bridge',
    name: '덩굴 다리',
    description: '낡은 덩굴로 이어진 다리가 있다. 건너편에 반짝이는 것이 보인다.',
    choices: [
      {
        label: '조심히 건넌다',
        description: '용기를 내서',
        outcome: { message: '무사히 건너 보물을 얻었다!', itemReward: { type: 'OreRare', amount: 1 } },
      },
      {
        label: '안전한 길로 간다',
        description: '무리하지 않는다',
        outcome: { message: '안전하게 진행했다.', progressBonus: 5, moodChange: 0.03 },
      },
    ],
    weight: 10,
    minProgress: 15,
  },
];

/**
 * 40% chance of triggering an event; weighted random from events eligible at this progress level.
 */
export function rollDungeonExplorationEvent(progress: number): DungeonExplorationEvent | null {
  if (randomFloat(0, 1) >= 0.4) return null;

  const eligible = EVENTS.filter(e => progress >= e.minProgress);
  if (eligible.length === 0) return null;

  const weights = eligible.map(e => e.weight);
  const idx = weightedRandomChoice(weights);
  return eligible[idx] ?? null;
}

/**
 * Applies a DungeonOutcome to an actor and returns the outcome message.
 * Item reward types are mapped through parseItemType; unrecognised types are silently skipped.
 *
 * 가방 가드: bagCapacity 가 주어지면 가득 찼을 때 보상 거절 메시지를 message 끝에 추가.
 */
export function applyDungeonOutcome(
  actor: Actor,
  outcome: DungeonOutcome,
  bagCapacity?: number,
): string {
  if (outcome.hpChange !== undefined && outcome.hpChange !== 0) {
    actor.adjustHp(outcome.hpChange);
  }
  if (outcome.moodChange !== undefined && outcome.moodChange !== 0) {
    actor.adjustMood(outcome.moodChange);
  }
  let bagFullSuffix = '';
  if (outcome.itemReward) {
    const itemType = parseItemType(outcome.itemReward.type);
    if (bagCapacity !== undefined) {
      const grant = grantLootByCategory(actor, itemType, outcome.itemReward.amount, bagCapacity);
      if (grant.bagFull) {
        bagFullSuffix = ` (⚠ 인벤토리 가득 참 — ${grant.displayName} 획득 불가)`;
      }
    } else {
      // bagCapacity 미지정 경로(레거시 호출) — 카테고리 stub 직접 추가
      actor.addItem(itemType, outcome.itemReward.amount);
    }
  }
  if (outcome.colorInfluence && outcome.colorInfluence.length === 8) {
    actor.color.applyInfluence(outcome.colorInfluence);
  }
  return outcome.message + bagFullSuffix;
}

/**
 * Returns a read-only view of all built-in exploration events.
 */
export function getAllDungeonExplorationEvents(): readonly DungeonExplorationEvent[] {
  return EVENTS;
}
