// eat-system.ts — 태그 기반 식사 시스템
// tag-system.ts의 /tag/ 표현식을 사용하여 종족-아이템 상호작용 결정

import { ItemType, Race } from './enums';
import { randomFloat } from './rng';
import type { Actor } from '../models/actor';
import { type ItemDef } from './item-defs';
import {
  getItemPropertyTags, getItemPropertySet,
  getRaceCapabilitySet, parseTags,
  canConsumeByTags, isToxicImmune, isBloodDiet,
} from './tag-system';

export interface EatResult {
  success: boolean;
  message: string;
  tp: number;
  hp: number;
  mp: number;
  mood: number;
  statusEffect?: 'poison' | 'stomachache';
  buffType?: string;      // 'attack', 'defense', 'tp_regen', 'mp_regen', 'speed'
  buffAmount?: number;
  buffDuration?: number;  // 턴 수 (기본 3)
}

export interface AppliedRecovery {
  tp: number;
  hp: number;
  mp: number;
  mood: number;
}

// 아이템별 기본 섭취 효과
const BASE_EFFECTS: Record<number, Omit<EatResult, 'success'>> = {
  [ItemType.Food]:        { message: '식사를 했다.', tp: 4, hp: 0, mp: 0, mood: 0.05 },
  [ItemType.Herb]:        { message: '약초를 먹었다. 쓴 맛이다.', tp: 1, hp: 15, mp: 0, mood: -0.02 },
  [ItemType.Potion]:      { message: '물약을 마셨다.', tp: 0, hp: 10, mp: 20, mood: 0.03 },
  [ItemType.OreCommon]:   { message: '이가 아프다!', tp: 0, hp: -10, mp: 0, mood: -0.1 },
  [ItemType.OreRare]:     { message: '독성 광물이다!', tp: 0, hp: -20, mp: 0, mood: -0.15, statusEffect: 'poison' },
  [ItemType.MonsterLoot]: { message: '맛이 이상하다...', tp: 0, hp: 0, mp: 0, mood: -0.05 },
  [ItemType.Equipment]:   { message: '씹을 수 없다!', tp: 0, hp: -5, mp: 0, mood: -0.08 },
  [ItemType.GuildCard]:   { message: '종이 맛이다.', tp: 0, hp: 0, mp: 0, mood: -0.02 },
};

/** 식용 가능 여부 판정 (태그 기반) */
export function canEatItem(item: ItemType, race: Race): { allowed: boolean; warning: string } {
  return canConsumeByTags(race, item);
}

/** 섭취 효과 계산 (태그 기반 종족 상호작용) */
export function computeEatEffect(item: ItemType, race: Race, itemTags?: string, isNight?: boolean): EatResult {
  const raceCaps = getRaceCapabilitySet(race);
  const baseItemProps = getItemPropertySet(item);

  // itemTags가 있으면 카테고리 태그와 합산
  let itemProps: Set<string>;
  if (itemTags) {
    const extra = parseTags(itemTags);
    itemProps = new Set([...baseItemProps, ...extra]);
  } else {
    itemProps = baseItemProps;
  }

  const base = BASE_EFFECTS[item] ?? { message: '???', tp: 0, hp: 0, mp: 0, mood: 0 };
  const result: EatResult = { success: true, ...base };

  // --- 비물질 존재 (potion_only): 물약만 가능 ---
  if (raceCaps.has('potion_only') && !itemProps.has('liquid')) {
    return { success: false, message: '비물질 존재라 섭취할 수 없다.', tp: 0, hp: 0, mp: 0, mood: 0 };
  }

  // --- acid_body (Slime): 독/배탈 없음 ---
  const isAcidBody = raceCaps.has('acid_body');

  // --- 전소화 (digest_all): 뭐든 먹지만 효과 50% ---
  if (raceCaps.has('digest_all')) {
    result.tp = Math.round(result.tp * 0.5);
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
    result.tp = 2;
    result.mood = 0.05;
    result.statusEffect = undefined;
    result.message = itemProps.has('metallic') ? '철분 보충!' : '광석을 씹어 먹었다. 힘이 솟는다!';
    return result;
  }

  // --- 조리 보너스 ---
  if (itemProps.has('cooked')) {
    result.tp = Math.round(result.tp * 1.2);
    result.mood += 0.03;
  }

  // --- 날것 페널티 (raw_affinity 종족 제외) ---
  if (itemProps.has('raw') && !raceCaps.has('raw_affinity') && !raceCaps.has('toxic_immune') && !raceCaps.has('mineral_digest')) {
    result.tp = Math.round(result.tp * 0.8);
  }

  // --- 피식 (blood_diet) ---
  if (isBloodDiet(race)) {
    if (itemProps.has('raw') && itemProps.has('monster')) {
      result.tp += 4; result.hp += 15; result.mood += 0.1;
      result.message = '피의 맛이다... 좋군.';
    } else if (itemProps.has('cooked')) {
      result.tp = Math.round(result.tp * 0.4);
      result.message = '평범한 음식은 별로다.';
    } else if (itemProps.has('monster')) {
      result.tp = 2; result.hp = 10; result.mood = 0.05;
      result.message = '피의 맛이다... 좋군.';
    }
  }

  // --- 약초 친화 (herb_affinity) ---
  if (raceCaps.has('herb_affinity')) {
    if (itemProps.has('herb')) {
      result.hp = Math.round(result.hp * 3);
      result.mp = Math.round(result.mp * 2);
      result.message = '약초의 정수가 온몸에 퍼진다!';
    }
    if (itemProps.has('flower')) {
      result.mp += 15;
      result.mood += 0.1;
      result.message = '꽃의 향기가 정신을 맑게 한다.';
    }
  }

  // --- 마법 친화 (magic_affinity) ---
  if (raceCaps.has('magic_affinity') && itemProps.has('magical')) {
    result.mp = Math.round(result.mp * 3);
    result.buffType = 'mp_regen';
    result.buffAmount = 5;
    result.buffDuration = 4;
  }

  // --- magical_bonus (Arcana/Construct) ---
  if (raceCaps.has('magical_bonus') && itemProps.has('magical')) {
    result.mp = Math.round(result.mp * 2);
    result.hp += 10;
  }

  // --- grain_bonus ---
  if (raceCaps.has('grain_bonus') && itemProps.has('grain')) {
    result.tp += 5;
    result.mood += 0.05;
    result.buffType = 'attack';
    result.buffAmount = 2;
    result.buffDuration = 3;
  }

  // --- fish_affinity ---
  if (raceCaps.has('fish_affinity') && itemProps.has('fish')) {
    result.tp = Math.round(result.tp * 2);
    result.hp += 5;
    result.message = '신선한 생선이다!';
  }

  // --- bird_diet + seed ---
  if (raceCaps.has('bird_diet') && itemProps.has('seed')) {
    result.tp += 3;
    result.mood += 0.1;
  }

  // --- raw_affinity + raw ---
  if (raceCaps.has('raw_affinity') && itemProps.has('raw')) {
    result.tp += 1;
    result.message = result.message || '야생의 맛!';
    if (!result.message.includes('야생')) result.message += ' 야생의 맛!';
  }

  // --- strong_stomach ---
  if (raceCaps.has('strong_stomach')) {
    if (itemProps.has('fermented')) {
      result.tp += 3;
      result.mood += 0.1;
      result.statusEffect = undefined;
    }
  }

  // --- spicy_bonus + spicy ---
  if (raceCaps.has('spicy_bonus') && itemProps.has('spicy')) {
    result.tp += 3;
    result.hp += 5;
    result.buffType = 'attack';
    result.buffAmount = 3;
    result.buffDuration = 3;
  }

  // --- night_eater + isNight ---
  if (raceCaps.has('night_eater') && isNight) {
    result.tp = Math.round(result.tp * 1.5);
    result.hp = Math.round(result.hp * 1.5);
  }

  // --- flower_affinity + flower ---
  if (raceCaps.has('flower_affinity') && itemProps.has('flower')) {
    result.mp += 20;
    result.mood += 0.15;
    result.buffType = 'mp_regen';
    result.buffAmount = 3;
    result.buffDuration = 5;
  }

  // --- nature_sense + herb or plant ---
  if (raceCaps.has('nature_sense') && (itemProps.has('herb') || itemProps.has('plant'))) {
    result.hp += 10;
  }

  // --- holy + blessed or herb ---
  if (raceCaps.has('holy') && (itemProps.has('blessed') || itemProps.has('herb'))) {
    result.hp = Math.round(result.hp * 2);
    result.buffType = 'defense';
    result.buffAmount = 3;
    result.buffDuration = 4;
  }

  // --- dark_affinity + cursed or spicy ---
  if (raceCaps.has('dark_affinity') && (itemProps.has('cursed') || itemProps.has('spicy'))) {
    result.tp += 3;
    result.buffType = 'attack';
    result.buffAmount = 4;
    result.buffDuration = 3;
  }

  // --- nocturnal + isNight ---
  if (raceCaps.has('nocturnal') && isNight) {
    result.tp += 2;
  }

  // --- alcohol_resist + fermented ---
  if (raceCaps.has('alcohol_resist') && itemProps.has('fermented')) {
    result.statusEffect = undefined;
    result.tp += 3;
  }

  // --- aquatic + fish ---
  if (raceCaps.has('aquatic') && itemProps.has('fish')) {
    result.tp += 4;
    result.hp += 10;
    result.message = '바다의 맛!';
  }

  // --- plant + herb or flower ---
  if (raceCaps.has('plant') && (itemProps.has('herb') || itemProps.has('flower'))) {
    result.tp += 2;
    result.hp += 15;
  }

  // --- cold_blood + raw ---
  if (raceCaps.has('cold_blood') && itemProps.has('raw')) {
    result.tp = Math.round(result.tp * 1.3);
    result.hp = Math.round(result.hp * 1.3);
  }

  // --- 날것 부작용 (raw): 50% 확률 배탈 ---
  let stomachChance = 0.5;
  if (raceCaps.has('keen_senses')) stomachChance *= 0.5; // keen_senses: 배탈 확률 절반
  if (raceCaps.has('scavenger')) stomachChance *= 0.5;   // scavenger: 배탈 확률 절반
  if (raceCaps.has('strong_stomach')) stomachChance = 0;  // strong_stomach: 완전 면역
  if (isAcidBody) stomachChance = 0;                      // acid_body: 완전 면역

  if (itemProps.has('raw') && !raceCaps.has('toxic_immune') && !raceCaps.has('mineral_digest') && stomachChance > 0) {
    if (randomFloat(0, 1) < stomachChance) {
      result.statusEffect = 'stomachache';
      result.hp -= 5;
      result.message += ' 배가 아프다...';
    }
  }

  // strong_stomach: inedible 배탈 확률 0
  if (raceCaps.has('strong_stomach') && itemProps.has('inedible')) {
    result.statusEffect = undefined;
  }

  // --- 독성 (toxic): 면역 없으면 중독 ---
  if (itemProps.has('toxic') && !isToxicImmune(race) && !isAcidBody) {
    result.statusEffect = 'poison';
  }

  // --- 몬스터 전리품 랜덤 효과 (blood_diet 아닌 경우) ---
  if (itemProps.has('monster') && !isBloodDiet(race)) {
    if (randomFloat(0, 1) < 0.5) {
      result.tp = 2; result.hp = 5;
    } else {
      result.hp = -10; result.tp = -1;
    }
  }

  return result;
}

export function applyRecovery(
  actor: Actor,
  effect: {
    tp?: number;
    hp?: number;
    mp?: number;
    mood?: number;
    resetMeal?: boolean;
  },
): AppliedRecovery {
  const beforeTp = actor.base.ap;
  const beforeHp = actor.base.hp;
  const beforeMp = actor.base.mp;
  const beforeMood = actor.base.mood;

  if (effect.tp) actor.adjustAp(effect.tp);
  if (effect.hp) actor.adjustHp(effect.hp);
  if (effect.mp) actor.adjustMp(effect.mp);
  if (effect.mood) actor.adjustMood(effect.mood);
  if (effect.resetMeal) actor.lifeData.daysSinceLastMeal = 0;

  return {
    tp: actor.base.ap - beforeTp,
    hp: actor.base.hp - beforeHp,
    mp: actor.base.mp - beforeMp,
    mood: actor.base.mood - beforeMood,
  };
}

export function applyEatEffect(
  actor: Actor,
  result: EatResult,
  resetMeal = result.success,
): AppliedRecovery {
  return applyRecovery(actor, {
    tp: result.tp,
    hp: result.hp,
    mp: result.mp,
    mood: result.mood,
    resetMeal,
  });
}

export function applyRatioRecovery(
  actor: Actor,
  hpRatio: number,
  mpRatio: number,
  tpRatio = 0,
  mood = 0,
): AppliedRecovery {
  const hp = Math.round(actor.getEffectiveMaxHp() * hpRatio);
  const mp = Math.round(actor.getEffectiveMaxMp() * mpRatio);
  const tp = Math.round(actor.getEffectiveMaxAp() * tpRatio);
  return applyRecovery(actor, { hp, mp, tp, mood });
}

export function applyFullSleepRecovery(actor: Actor, mood = 0.05): AppliedRecovery {
  // 수면 시 하루 식사 버프 변수 초기화
  actor.setVariable('meal_count', 0);
  actor.setVariable('meal_atk', 0);
  actor.setVariable('meal_def', 0);
  actor.setVariable('meal_mp_pct', 0);
  actor.setVariable('meal_hp_pct', 0);
  actor.setVariable('meal_combat_speed', 0);

  return applyRecovery(actor, {
    hp: actor.getEffectiveMaxHp(),
    mp: actor.getEffectiveMaxMp(),
    tp: actor.getEffectiveMaxAp(),
    mood,
  });
}

/** 하루 식사 버프 적용. 최대 3식 초과 시 ok:false 반환 */
export function applyDailyMealBuff(actor: Actor, def: ItemDef): { ok: boolean; message: string } {
  const count = actor.getVariable('meal_count');
  if (count >= 3) {
    return { ok: false, message: '오늘은 더 이상 먹을 수 없다. (하루 3식 제한)' };
  }

  actor.adjustVariable('meal_count', 1);

  if (def.mealBuffAtk)  actor.adjustVariable('meal_atk', def.mealBuffAtk);
  if (def.mealBuffDef)  actor.adjustVariable('meal_def', def.mealBuffDef);
  if (def.mealMpMaxPct) actor.adjustVariable('meal_mp_pct', def.mealMpMaxPct);
  if (def.mealHpMaxPct) actor.adjustVariable('meal_hp_pct', def.mealHpMaxPct);
  if (def.mealCombatSpeed > 0) {
    const current = actor.getVariable('meal_combat_speed');
    if (def.mealCombatSpeed > current) {
      actor.setVariable('meal_combat_speed', def.mealCombatSpeed);
    }
  }

  return { ok: true, message: '' };
}

/** 오늘 남은 식사 횟수 (3 - meal_count) */
export function getRemainingMeals(actor: Actor): number {
  return Math.max(0, 3 - actor.getVariable('meal_count'));
}

/** ItemDef의 하루 버프 요약 라벨 (없으면 빈 문자열) */
export function mealBuffLabel(def: ItemDef): string {
  const parts: string[] = [];
  if (def.mealBuffAtk)      parts.push(`ATK+${def.mealBuffAtk}`);
  if (def.mealBuffDef !== 0) {
    parts.push(def.mealBuffDef > 0 ? `DEF+${def.mealBuffDef}` : `DEF${def.mealBuffDef}`);
  }
  if (def.mealMpMaxPct)     parts.push(`MP상한+${Math.round(def.mealMpMaxPct * 100)}%`);
  if (def.mealHpMaxPct)     parts.push(`HP상한+${Math.round(def.mealHpMaxPct * 100)}%`);
  if (def.mealCombatSpeed > 0) parts.push(`전투속도x${def.mealCombatSpeed}`);
  return parts.length > 0 ? `하루 버프: ${parts.join(', ')}` : '';
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
