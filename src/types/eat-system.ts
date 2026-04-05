// eat-system.ts — 태그 기반 식사 시스템
// tag-system.ts의 /tag/ 표현식을 사용하여 종족-아이템 상호작용 결정

import { ItemType, Race } from './enums';
import { randomFloat } from './rng';
import {
  getItemPropertyTags, getItemPropertySet,
  getRaceCapabilitySet,
  canConsumeByTags, isToxicImmune, hasHerbAffinity, isBloodDiet,
} from './tag-system';

export interface EatResult {
  success: boolean;
  message: string;
  vigor: number;
  hp: number;
  mp: number;
  mood: number;
  statusEffect?: 'poison' | 'stomachache';
}

// 아이템별 기본 섭취 효과
const BASE_EFFECTS: Record<number, Omit<EatResult, 'success'>> = {
  [ItemType.Food]:        { message: '식사를 했다.', vigor: 40, hp: 0, mp: 0, mood: 0.05 },
  [ItemType.Herb]:        { message: '약초를 먹었다. 쓴 맛이다.', vigor: 10, hp: 15, mp: 0, mood: -0.02 },
  [ItemType.Potion]:      { message: '물약을 마셨다.', vigor: 0, hp: 10, mp: 20, mood: 0.03 },
  [ItemType.OreCommon]:   { message: '이가 아프다!', vigor: 0, hp: -10, mp: 0, mood: -0.1 },
  [ItemType.OreRare]:     { message: '독성 광물이다!', vigor: 0, hp: -20, mp: 0, mood: -0.15, statusEffect: 'poison' },
  [ItemType.MonsterLoot]: { message: '맛이 이상하다...', vigor: 0, hp: 0, mp: 0, mood: -0.05 },
  [ItemType.Equipment]:   { message: '씹을 수 없다!', vigor: 0, hp: -5, mp: 0, mood: -0.08 },
  [ItemType.GuildCard]:   { message: '종이 맛이다.', vigor: 0, hp: 0, mp: 0, mood: -0.02 },
};

/** 식용 가능 여부 판정 (태그 기반) */
export function canEatItem(item: ItemType, race: Race): { allowed: boolean; warning: string } {
  return canConsumeByTags(race, item);
}

/** 섭취 효과 계산 (태그 기반 종족 상호작용) */
export function computeEatEffect(item: ItemType, race: Race): EatResult {
  const raceCaps = getRaceCapabilitySet(race);
  const itemProps = getItemPropertySet(item);
  const base = BASE_EFFECTS[item] ?? { message: '???', vigor: 0, hp: 0, mp: 0, mood: 0 };
  const result: EatResult = { success: true, ...base };

  // --- 비물질 존재 (potion_only): 물약만 가능 ---
  if (raceCaps.has('potion_only') && !itemProps.has('liquid')) {
    return { success: false, message: '비물질 존재라 섭취할 수 없다.', vigor: 0, hp: 0, mp: 0, mood: 0 };
  }

  // --- 전소화 (digest_all): 뭐든 먹지만 효과 50% ---
  if (raceCaps.has('digest_all')) {
    result.vigor = Math.round(result.vigor * 0.5);
    result.hp = Math.round(result.hp * 0.5);
    result.mp = Math.round(result.mp * 0.5);
    result.statusEffect = undefined;
    if (itemProps.has('inedible')) result.message = '흡수했다.';
    return result;
  }

  // --- 광물/금속 소화 가능 (mineral_digest / metallic_digest) ---
  if ((itemProps.has('mineral') && raceCaps.has('mineral_digest')) ||
      (itemProps.has('metallic') && raceCaps.has('metallic_digest'))) {
    result.hp = Math.abs(result.hp) + 10;
    result.vigor = 20;
    result.mood = 0.05;
    result.statusEffect = undefined;
    result.message = itemProps.has('metallic') ? '철분 보충!' : '광석을 씹어 먹었다. 힘이 솟는다!';
    return result;
  }

  // --- 피식 (blood_diet): 몬스터 전리품 2배, 일반 식사 50% ---
  if (isBloodDiet(race)) {
    if (itemProps.has('monster')) {
      result.vigor = 20; result.hp = 10; result.mood = 0.05;
      result.message = '피의 맛이다... 좋군.';
    } else if (itemProps.has('cooked')) {
      result.vigor = Math.round(result.vigor * 0.5);
      result.message = '평범한 음식은 별로다.';
    }
  }

  // --- 약초 친화 (herb_affinity): 약초 효과 2배 ---
  if (hasHerbAffinity(race) && itemProps.has('herb')) {
    result.hp *= 2;
    result.vigor *= 2;
    result.message = '약초의 기운이 온몸에 퍼진다!';
  }

  // --- 날것 부작용 (raw): 50% 확률 배탈 ---
  if (itemProps.has('raw') && !raceCaps.has('toxic_immune') && !raceCaps.has('mineral_digest')) {
    if (randomFloat(0, 1) < 0.5) {
      result.statusEffect = 'stomachache';
      result.hp -= 5;
      result.message += ' 배가 아프다...';
    }
  }

  // --- 독성 (toxic): 면역 없으면 중독 ---
  if (itemProps.has('toxic') && !isToxicImmune(race)) {
    result.statusEffect = 'poison';
  }

  // --- 몬스터 전리품 랜덤 효과 ---
  if (itemProps.has('monster') && !isBloodDiet(race)) {
    if (randomFloat(0, 1) < 0.5) {
      result.vigor = 20; result.hp = 5;
    } else {
      result.hp = -10; result.vigor = -5;
    }
  }

  return result;
}

/** 아이템 식사 표시 라벨 */
export function itemEatLabel(item: ItemType): string {
  switch (item) {
    case ItemType.Food: return '식량';
    case ItemType.Herb: return '약초';
    case ItemType.Potion: return '물약';
    case ItemType.OreCommon: return '일반 광석';
    case ItemType.OreRare: return '희귀 광석';
    case ItemType.MonsterLoot: return '몬스터 전리품';
    case ItemType.Equipment: return '장비';
    case ItemType.GuildCard: return '길드 카드';
    default: return '???';
  }
}

/** 아이템의 태그 문자열 (UI 표시용) */
export function getItemTagDisplay(item: ItemType): string {
  return getItemPropertyTags(item);
}
