/**
 * XP·레벨업·카드 강화(각성) 시스템 — 순수 계산·헬퍼 (2026-06-10).
 *
 * 설계(deep-interview-xp-card-enhancement.md):
 *  - XP 고정 3/레벨, 전투 승리 적립(일반 1 / 엘리트 3 / 아크·보스 9). 비전투 XP 없음.
 *  - 카드 인스턴스 0~10강. 1~5강 수치 스케일(강당 +12%, 최소 +1), 5강 잠김.
 *  - 각성(공방): 속성 특산물 + 사다리 재료 → plus 정의로 진화(이름 +) + 6~10강 해금.
 *    plus 무정의 카드는 수치 점프(+38%) 폴백.
 *  - 효과 적용은 *정의 baked가 아니라 실행 시점 스케일*(combat.ts previewCardEffectValue).
 *    이 모듈은 그 스케일 계수와 각성 비용·표시 라벨만 제공(상태 변경은 stores/run.ts·workshop.ts).
 *
 * 인스턴스 필드(Card): enhanceLevel(0~10), awakened(boolean). 둘 다 런 휘발·optional.
 */

import type { Card, Item, Rank } from '@/data/schemas';

// === XP 체계 ===
/** 레벨업 요구 XP — 고정(점증 없음). */
export const XP_PER_LEVEL = 3;
/** 전투 승리 XP — 일반 / 엘리트 / 아크·최종보스. */
export const XP_NORMAL = 1;
export const XP_ELITE = 3;
export const XP_BOSS = 9;
/** 아크 *재격파*(첫 격파 이후) — 엘리트급. */
export const XP_ARC_REPEAT = XP_ELITE;

// === 강화 체계 ===
/** 강당 수치 배율(+12%). 누적은 1.12^level. */
export const ENHANCE_PER_LEVEL = 0.12;
/** 최대 강화 단계 (비공격 카드 — 방어/유틸). */
export const MAX_ENHANCE_LEVEL = 10;
/**
 * 공격 카드 최대 강화 단계 — D10: 공격 카드는 강화 제한을 *크게* 푼다("성장하는 느낌").
 * 각성 게이트(5강)는 동일하게 거치되, 각성 이후 30강까지 +12%/강 누적 성장.
 * 투자(XP·각성 재료)가 자연 게이트. 비공격 카드는 MAX_ENHANCE_LEVEL(10) 유지.
 */
export const MAX_ENHANCE_LEVEL_ATTACK = 30;
/** 각성 게이트 — 이 단계에서 잠기고, 넘어가려면 각성 필요. */
export const AWAKEN_GATE_LEVEL = 5;
/** plus 정의가 없는 카드의 각성 수치 점프(+38%) — plus 진화 폴백. */
export const AWAKEN_NUMERIC_JUMP = 0.38;

/** 각성 1회 비용 — 등급별 (속성 특산물 N개 + 사다리 재료 id·개수). basic은 common과 동일. */
export interface AwakenCost {
  /** 카드 속성과 매칭되는 특산물 필요 개수. */
  specialtyCount: number;
  /** 사다리 재료 id. */
  materialId: string;
  /** 사다리 재료 필요 개수. */
  materialCount: number;
}

const MATERIAL_RARE_ID = 'i-material-rare'; // 굳은 시간 덩이
const MATERIAL_LEGENDARY_ID = 'i-time-answer'; // 시간의 답

/** 각성 비용 표 — 등급 → 비용. (basic=common) */
export const AWAKEN_COST: Record<Rank, AwakenCost> = {
  basic: { specialtyCount: 2, materialId: MATERIAL_RARE_ID, materialCount: 1 },
  common: { specialtyCount: 2, materialId: MATERIAL_RARE_ID, materialCount: 1 },
  rare: { specialtyCount: 3, materialId: MATERIAL_RARE_ID, materialCount: 2 },
  legendary: { specialtyCount: 4, materialId: MATERIAL_LEGENDARY_ID, materialCount: 1 },
};

export function awakenCostFor(rank: Rank): AwakenCost {
  return AWAKEN_COST[rank] ?? AWAKEN_COST.common;
}

// === 스케일 계산 ===

/**
 * 유효 강화 단계 — awakened 카드는 *plus 정의가 이미 base를 올린 상태*이므로
 * 각성 이후 구간(6~10강)만 센다: level-5. 미각성은 level 그대로.
 * (풀강 배율이 plus 점프 × 1.12^10 곱연산으로 폭주하지 않게 — 사용자 승인 상한 ×3 준수.
 *  구세이브 -plus 마이그레이션(enhanceLevel 5·awakened)은 유효 0 → plus 수치 그대로.)
 */
function effectiveLevel(card: Card | undefined): number {
  const lvl = card?.enhanceLevel ?? 0;
  if (!card?.awakened) return lvl;
  return Math.max(0, lvl - AWAKEN_GATE_LEVEL);
}

/**
 * 강화 배율 — 미각성 1.12^level / 각성 1.12^(level-5) × 폴백 점프.
 * 폴백 점프: 각성했지만 plus 정의가 없어 교체되지 못한 카드(id가 -plus가 아님)는 수치 +38%.
 * 풀강(10강+각성) 실효 ≈ 미강화 ×2.6~3.1 (plus 점프 폭에 따름) — 스펙 목표 ×3.0 이내.
 */
export function enhanceMul(card: Card | undefined): number {
  const lvl = effectiveLevel(card);
  const jump = card?.awakened && !card.id.endsWith('-plus') ? 1 + AWAKEN_NUMERIC_JUMP : 1;
  if (lvl <= 0) return jump;
  return jump * Math.pow(1 + ENHANCE_PER_LEVEL, lvl);
}

/**
 * 수치형 효과 base 값을 강화 단계로 스케일 — round(base × enhanceMul), 단 유효 강당 최소 +1 보장.
 * (작은 수치 카드에서 12%가 0으로 버려지지 않게: 유효 level강이면 최소 base+유효level.)
 * 배율 1(미강화·미점프) 또는 base ≤ 0이면 그대로.
 */
export function scaledValue(base: number, card: Card | undefined): number {
  const mul = enhanceMul(card);
  if (base <= 0 || mul === 1) return base;
  const lvl = effectiveLevel(card);
  const scaled = Math.round(base * mul);
  return Math.max(base + lvl, scaled);
}

// === 상태 질의 ===

/**
 * 공격 카드인가 — damage 계열/직접 피해 효과 보유. (D10 강화캡 분기용.)
 */
export function isAttackCard(card: Card | undefined): boolean {
  if (!card?.effects) return false;
  return card.effects.some((e) => {
    const k = e.kind;
    return k.includes('damage')
      || k === 'heavy-blade' || k === 'adaptive-strike' || k === 'spend-all-energy'
      || k === 'consume-vulnerable' || k === 'consume-burn' || k === 'consume-poison'
      || k === 'amplify-debuff';
  });
}

/** 카드별 최대 강화 단계 — 공격 카드는 크게 완화(D10), 그 외 10. */
export function maxLevelFor(card: Card | undefined): number {
  return isAttackCard(card) ? MAX_ENHANCE_LEVEL_ATTACK : MAX_ENHANCE_LEVEL;
}

/** 더 강화할 수 있는가 — 5강 미만이거나, 각성했고 카드별 최대 미만(공격 30 / 그 외 10). */
export function canEnhance(card: Card | undefined): boolean {
  if (!card) return false;
  const lvl = card.enhanceLevel ?? 0;
  if (lvl < AWAKEN_GATE_LEVEL) return true;
  return !!card.awakened && lvl < maxLevelFor(card);
}

/** 각성이 필요한 상태인가 — 5강 도달 + 미각성(=공방에서 각성해야 6강 진입). */
export function needsAwakening(card: Card | undefined): boolean {
  if (!card) return false;
  return (card.enhanceLevel ?? 0) >= AWAKEN_GATE_LEVEL && !card.awakened;
}

/** 각성 가능한 상태인가 — 5강 도달 + 미각성. (needsAwakening과 동치, 의미 구분용 별칭.) */
export function canAwaken(card: Card | undefined): boolean {
  return needsAwakening(card);
}

// === 표시 ===

/** 강화 배지 텍스트 — '+3' / '+5' 등. 미강화면 빈 문자열. (각성 카드는 이름 자체가 plus명이라 배지는 강수만.) */
export function enhanceBadge(card: Card | undefined): string {
  const lvl = card?.enhanceLevel ?? 0;
  return lvl > 0 ? `+${lvl}` : '';
}

/**
 * 카드 element와 매칭되는 특산물 아이템 목록 — 각성 재료 후보(보유 인벤토리에서 거른다).
 * 카드 element가 없으면 보유 *모든* 특산물 허용(8종 중 무엇이든). 매칭은 Item.element(8종 특산물 전용).
 * @param card    각성 대상 카드.
 * @param items   보유 아이템(run.data.items) 또는 정의 목록.
 */
export function matchingSpecialties(card: Card | undefined, items: Item[]): Item[] {
  const specialties = items.filter((i) => i.category === 'specialty');
  if (!card?.element) return specialties;
  const matched = specialties.filter((i) => i.element === card.element);
  // 매칭 특산물을 보유하지 않았으면(데이터 미부여 과도기 포함) 전체 특산물로 폴백 — 진행 막힘 방지.
  return matched.length > 0 ? matched : specialties;
}
