/**
 * 전투 노드 스펙 표기(2026-06-21) — 인정 게이트에서 [싸운다] 시 만날 적의 스펙을 미리 본다.
 *
 * 입력은 *그 전투의 초기 배치 적 정의들*(run.previewStageEnemies가 enterGridCombat과 동일한
 * buildCombatStage로 산출 — 프리뷰=실제 일치). 여기선 그 정의들로 표기 항목만 계산한다(읽기 전용).
 *
 * 계산은 격자 전투 엔진(grid-combat.ts)의 실제 해석과 맞춘다:
 *  - 속도   : tempo. 엔진 makeEnemyCombatant가 `Math.max(1, def.tempo ?? DEFAULT_TEMPO)`(기본 4).
 *  - 행동수 : 레거시 멀티액션 `Math.max(1, def.actions ?? 1)`(actionsPerTurn).
 *  - 피해   : gridBehavior가 있으면 그 공격들의 대표 피해, 없으면 attack 기반 근접 1칸 폴백.
 */

import type { Monster } from '@/data/schemas';

/** 엔진 기본 템포(grid-combat.ts DEFAULT_TEMPO와 동일 — "플레이어 N행동마다 적 1턴"). */
const DEFAULT_TEMPO = 4;

/** 속도 라벨(스테이지에서 가장 빠른 적 = min tempo 기준). 낮을수록 빠름. */
export type SpeedLabel = '빠름' | '보통' | '느림';

export interface EnemySpec {
  /** 초기 배치 적 마릿수. */
  count: number;
  /** 초기 적들의 maxHp 합. */
  hp: number;
  /** 한 턴 기대 피해 합 = Σ(한 적의 한 턴 피해). */
  attack: number;
  /** 가장 빠른 적(min tempo) 기준 속도 라벨. */
  speed: SpeedLabel;
}

/**
 * 한 적의 *한 턴 기대 피해*.
 *  - gridBehavior가 있으면: 그 공격들 중 *최대 피해 한 방*을 대표값으로(엔진은 AI가 택1, 1트리거=1행동).
 *    각 GridAttack 피해 = (damage ?? attack) × max(perTileMul) — 패턴 칸별 배율 중 대표(최대) 1칸.
 *  - gridBehavior가 없으면: 근접 1칸 폴백 = attack × actions(레거시 멀티액션 묶음).
 * (gridBehavior 적은 actionsPerTurn=1 트리거당 1행동이라 actions를 곱하지 않는다 — 엔진과 일치.)
 */
function oneTurnDamage(m: Monster): number {
  const atk = Math.max(0, Math.round(m.attack ?? 0));
  const behavior = m.gridBehavior;
  if (behavior && behavior.length > 0) {
    let best = 0;
    for (const a of behavior) {
      const base = a.damage ?? atk;
      const mul = a.perTileMul && a.perTileMul.length > 0 ? Math.max(...a.perTileMul) : 1;
      const dmg = Math.round(base * mul);
      if (dmg > best) best = dmg;
    }
    return best;
  }
  // 레거시 멀티액션 — actions(또는 1)만큼 근접 타격 묶음.
  const actions = Math.max(1, Math.round(m.actions ?? 1));
  return atk * actions;
}

/** tempo → 속도 라벨. ≤2 빠름 / 3~4 보통 / ≥5 느림. 미설정은 엔진 기본(4=보통). */
function speedLabel(minTempo: number): SpeedLabel {
  if (minTempo <= 2) return '빠름';
  if (minTempo <= 4) return '보통';
  return '느림';
}

/**
 * 초기 배치 적 정의들 → 스펙 표기. 빈 배열이면 null(표시 생략).
 * 속도는 *가장 빠른 적*(min tempo) 기준 — 한 마리라도 빠르면 위험.
 */
export function summarizeEnemies(defs: Monster[] | null | undefined): EnemySpec | null {
  if (!defs || defs.length === 0) return null;
  let hp = 0;
  let attack = 0;
  let minTempo = Infinity;
  for (const m of defs) {
    hp += Math.max(1, Math.round(m.hp ?? 0));
    attack += oneTurnDamage(m);
    const tempo = Math.max(1, Math.round(m.tempo ?? DEFAULT_TEMPO));
    if (tempo < minTempo) minTempo = tempo;
  }
  if (!Number.isFinite(minTempo)) minTempo = DEFAULT_TEMPO;
  return {
    count: defs.length,
    hp,
    attack,
    speed: speedLabel(minTempo),
  };
}
