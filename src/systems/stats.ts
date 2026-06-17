/**
 * 컬러 8원소 → 전투 보너스 (격자 전투 F5 재배분, 2026-06-18).
 *
 * 8 컬러: 불 / 전기 / 흙 / 철 / 물 / 바람 / 빛 / 어둠 (상한 100).
 *
 *   색 → 스탯 재배분 (기획서 F5):
 *     ATK  = CalculateStat(fire, electric)   → 공격량(damage)
 *     DEF  = CalculateStat(earth, iron)      → 방어량(block)
 *     마나 = CalculateStat(light, dark)      → 라운드 마나 한도(manaExtra)  ← 빛·어둠 "재활용"
 *     드로우 = water(단색)                    → 손패/대기 보충량(drawExtra)
 *     이동 = wind(단색)                       → 이동 사거리 보너스(moveBonus)
 *   은퇴: 구 MAG(빛·어둠→드로우+마나 분할), 구 VIT(물·바람→최대 HP).
 *     (물·바람을 단색 드로우·이동으로 분리. 색→최대 HP는 폐지 — loadActiveRun이 colorHpBonus 환원.)
 *
 *   효과 임계 (평탄화 유지):
 *     ATK 33당 damage +1  (atk 최대 ~500 → +15 상한)
 *     DEF 33당 block +1
 *     마나 150당 +1        (mag 최대 500 → +3 상한)
 *     물 40당 드로우 +1    (단색 최대 100 → +2 상한)
 *     바람 50당 이동 +1    (단색 최대 100 → +2 상한)
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
  /** ATK(공격) — 불·전기. damage 보너스의 원천. */
  atk: number;
  /** DEF(방어) — 흙·철. block 보너스의 원천. */
  def: number;
  /** MAG — *빛·어둠*으로 산출. (F5: 이제 마나 보너스의 원천. 옛 드로우 분할은 폐지.) */
  mag: number;
  /** VIT — *물·바람* 페어 수치. 표시·유물(boost-stat) 호환용으로 *수치만* 유지(최대 HP 효과는 은퇴). */
  vit: number;
}

/**
 * colors → ATK/DEF/MAG/VIT *수치*. (보너스 환산은 bonusesFromColors가 담당.)
 * 페어 공식은 유물 boost-stat / 이벤트 / CharacterMenu 표시 호환을 위해 그대로 유지한다.
 *   ATK=불·전기, DEF=흙·철, MAG=빛·어둠, VIT=물·바람(수치만 — 최대 HP 효과 은퇴).
 */
export function deriveStats(colors: ColorValues): DerivedStats {
  return {
    atk: calculateStat(colors.fire, colors.electric),
    def: calculateStat(colors.earth, colors.iron),
    mag: calculateStat(colors.light, colors.dark),
    vit: calculateStat(colors.water, colors.wind),
  };
}

export interface CombatBonuses {
  /** damage 효과 value에 +. 공격 카드 최소 공격력 보정 (불·전기). */
  damage: number;
  /** block 효과 value에 +. 방어 카드 방어력 보정 (흙·철). */
  block: number;
  /** 손패 보충량(전투시작·[대기]) + 이 값 (물 단색). */
  drawExtra: number;
  /** 라운드 마나 한도(maxMana) + 이 값 (빛·어둠). */
  manaExtra: number;
  /** 플레이어 이동 프로필 사거리(range) + 이 값 (바람 단색). 화이트 팡(무속성)은 시간 메커닉으로 별도. */
  moveBonus: number;
}

/** 임계 — 평탄화 곡선. */
const DAMAGE_PER = 33;   // ATK 33당 damage +1.
const BLOCK_PER = 33;    // DEF 33당 block +1.
const MANA_PER = 150;    // MAG(빛·어둠) 150당 마나 +1 (최대 ~+3).
const WATER_DRAW_PER = 40; // 물 40당 드로우 +1 (단색 최대 +2).
const WIND_MOVE_PER = 50;  // 바람 50당 이동 사거리 +1 (단색 최대 +2).

/**
 * colors → 5종 전투 보너스 (F5 재배분).
 *  - damage  = floor(ATK / 33)            (불·전기)
 *  - block   = floor(DEF / 33)            (흙·철)
 *  - manaExtra = floor(MAG / 150)         (빛·어둠 → 마나)
 *  - drawExtra = floor(물 / 40)           (물 단색 → 드로우)
 *  - moveBonus = floor(바람 / 50)         (바람 단색 → 이동)
 */
export function bonusesFromColors(colors: ColorValues): CombatBonuses {
  const atk = calculateStat(colors.fire, colors.electric);
  const def = calculateStat(colors.earth, colors.iron);
  const mag = calculateStat(colors.light, colors.dark);
  return {
    damage: Math.floor(atk / DAMAGE_PER),
    block: Math.floor(def / BLOCK_PER),
    manaExtra: Math.floor(mag / MANA_PER),
    drawExtra: Math.floor(Math.max(0, colors.water) / WATER_DRAW_PER),
    moveBonus: Math.floor(Math.max(0, colors.wind) / WIND_MOVE_PER),
  };
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
