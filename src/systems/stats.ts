/**
 * 컬러 6원소 → 3 스탯 → 전투 보너스.
 *
 * 사용자 사양 (2026-05-15):
 *   6 컬러: 불 / 전기 / 흙 / 철 / 물 / 바람 (상한 100 권장)
 *   짝지어 CalculateStat → 3 스탯:
 *     ATK  = CalculateStat(fire, electric)
 *     DEF  = CalculateStat(earth, iron)
 *     MAG  = CalculateStat(water, wind)
 *
 *   효과:
 *     ATK 10당 공격 카드의 *최소 공격력* +1
 *     DEF 10당 방어 카드의 *방어력* +1
 *     MAG 10 단위:
 *       - 홀수 단계마다 카드 드로우 수 +1
 *       - 짝수 단계마다 턴당 마나 +1
 *       (level=1→draw+1, level=2→mana+1, level=3→draw+2, level=4→mana+2, ...)
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
  mag: number;
}

/** colors → ATK/DEF/MAG. */
export function deriveStats(colors: ColorValues): DerivedStats {
  return {
    atk: calculateStat(colors.fire, colors.electric),
    def: calculateStat(colors.earth, colors.iron),
    mag: calculateStat(colors.water, colors.wind),
  };
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
  const damage = Math.floor(stats.atk / 10);
  const block = Math.floor(stats.def / 10);
  const magLevel = Math.floor(stats.mag / 10);
  const drawExtra = Math.ceil(magLevel / 2);
  const manaExtra = Math.floor(magLevel / 2);
  return { damage, block, drawExtra, manaExtra };
}

/** colors → 보너스 한 번에. */
export function bonusesFromColors(colors: ColorValues): CombatBonuses {
  return deriveBonuses(deriveStats(colors));
}
