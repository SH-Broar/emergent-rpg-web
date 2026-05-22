/**
 * 컬러 6원소 → 3 스탯 → 전투 보너스.
 *
 * 사용자 사양 (2026-05-15):
 *   6 컬러: 불 / 전기 / 흙 / 철 / 물 / 바람 (상한 100 권장)
 *   짝지어 CalculateStat → 4 스탯:
 *     ATK  = CalculateStat(fire, electric)
 *     DEF  = CalculateStat(earth, iron)
 *     MAG  = CalculateStat(light, dark)   (희귀 컬러 → 드로우/마나)
 *     VIT  = CalculateStat(water, wind)   (→ 최대 HP, VIT 20당 +1)
 *
 *   효과 (2026-05-21 평탄화):
 *     ATK 33당 공격 카드의 *최소 공격력* +1  (컬러 풀투자 시 +10~15 상한)
 *     DEF 33당 방어 카드의 *방어력* +1
 *     MAG 100 단위:
 *       - 홀수 단계마다 카드 드로우 수 +1
 *       - 짝수 단계마다 턴당 마나 +1
 *       (level=floor(mag/100): 100→draw+1, 200→mana+1, 300→draw+2, ... +2~3 상한)
 *
 *   CalculateStat 공식 (사용자 제공 그대로):
 *     balance = min(A,B) / max(A,B)
 *     k = 1.5, p = 1.5
 *     multiplier = 1 + k * pow(balance, p)
 *     return (A + B) * multiplier
 *
 *   값 범위 (A,B ∈ [0, 100]):
 *     A=0,  B=0  → 0
 *     A=100,B=0  → 100  (multiplier 1)
 *     A=50, B=50 → 250  (balance 1, multiplier 2.5)
 *     A=100,B=100→ 500  (최대)
 */

import type { ColorValues } from '@/data/schemas';

/** 사용자 제공 공식 — Mathf.Pow(balance, 1.5) 그대로. */
export function calculateStat(a: number, b: number): number {
  const A = Math.max(0, a);
  const B = Math.max(0, b);
  if (A === 0 && B === 0) return 0;
  const lo = Math.min(A, B);
  const hi = Math.max(A, B);
  const balance = hi === 0 ? 0 : lo / hi;
  const k = 1.5;
  const p = 1.5;
  const multiplier = 1 + k * Math.pow(balance, p);
  return (A + B) * multiplier;
}

export interface DerivedStats {
  atk: number;
  def: number;
  /** MAG(마법) — *빛·어둠*으로 산출(희귀 컬러). 드로우/마나 보너스의 원천. */
  mag: number;
  /** VIT(활력) — *물·바람*으로 산출. 최대 HP 보너스의 원천. */
  vit: number;
}

/**
 * colors → ATK/DEF/MAG/VIT.
 *   ATK=불·전기, DEF=흙·철, MAG=빛·어둠(희귀→드로우/마나), VIT=물·바람(→최대 HP).
 * (2026-05-22: 빛·어둠이 더 희귀하므로 MAG↔VIT 담당 컬러쌍을 교체.)
 */
export function deriveStats(colors: ColorValues): DerivedStats {
  return {
    atk: calculateStat(colors.fire, colors.electric),
    def: calculateStat(colors.earth, colors.iron),
    mag: calculateStat(colors.light, colors.dark),
    vit: calculateStat(colors.water, colors.wind),
  };
}

/** VIT 1 HP당 필요한 활력 수치 — VIT(=calculateStat(water,wind)) 20당 최대 HP +1. */
export const VIT_HP_PER = 20;

/** 현재 컬러로부터의 *최대 HP 보너스* — floor(VIT / VIT_HP_PER). 물·바람을 고루 키울수록 큼. */
export function vitHpBonus(colors: ColorValues): number {
  return Math.floor(calculateStat(colors.water, colors.wind) / VIT_HP_PER);
}

export interface CombatBonuses {
  /** damage 효과 value에 +. 공격 카드 최소 공격력 보정. */
  damage: number;
  /** block 효과 value에 +. 방어 카드 방어력 보정. */
  block: number;
  /** 매 턴 시작 드로우 + 이 값. */
  drawExtra: number;
  /** 매 턴 시작 maxMana + 이 값. */
  manaExtra: number;
}

/**
 * 3 스탯에서 전투 보너스 계산.
 *  - ATK 10당 damage +1
 *  - DEF 10당 block +1
 *  - MAG 10 단위:
 *      level = floor(MAG / 10)
 *      drawExtra = ceil(level / 2)   (홀수 단계마다 +1)
 *      manaExtra = floor(level / 2)  (짝수 단계마다 +1)
 */
export function deriveBonuses(stats: DerivedStats): CombatBonuses {
  // 평탄화(2026-05-21): ATK/DEF는 /33 — 컬러 풀투자(스탯 ~336~500)에서 보정 +10~15 상한.
  const damage = Math.floor(stats.atk / 33);
  const block = Math.floor(stats.def / 33);
  // MAG는 임계 대폭 상향(/100) — 드로우/마나 +2~3 상한(과거 폭주 방지).
  //   level=floor(mag/100): 100→1, 300→3, 500→5.
  //   drawExtra=ceil(level/2)(홀수 단계), manaExtra=floor(level/2)(짝수 단계).
  const magLevel = Math.floor(stats.mag / 100);
  const drawExtra = Math.ceil(magLevel / 2);
  const manaExtra = Math.floor(magLevel / 2);
  return { damage, block, drawExtra, manaExtra };
}

/** colors → 보너스 한 번에. */
export function bonusesFromColors(colors: ColorValues): CombatBonuses {
  return deriveBonuses(deriveStats(colors));
}

/**
 * 카드 효과 종류에 적용되는 *컬러 보너스* — 카드 표시 시 base value에 더해 *최종 정적값*을 만든다.
 * 사용자 사양: 컬러는 감소하지 않으므로 안전하게 정적 합산.
 *   - damage   ← ATK 보너스
 *   - block    ← DEF 보너스
 *   - draw/apply-status/heal 등은 *컬러 보너스 없음* (MAG drawExtra/manaExtra는 전투 시작 시 한 번 적용)
 */
export function colorBonusForCardEffectKind(
  kind: string,
  bonuses: CombatBonuses,
): number {
  if (kind === 'damage') return bonuses.damage;
  if (kind === 'block') return bonuses.block;
  return 0;
}
