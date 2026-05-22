/**
 * 동료 지속 패시브 (5c, 2026-05-23).
 *
 * 영입 1회 보너스(덱슬롯·카드·유물·컬러)와 별개로, *동료가 파티에 있는 한 매 전투* 적용되는
 * 지속 패시브를 집계한다. run.companions에서 매번 재계산하므로 세이브 영향 없음.
 *
 * 적용 지점(combat.ts 등):
 *  - combatStart: startCombat에서 방어/힘/추가 드로우.
 *  - perTurn: applyPlayerStatusTurnStart에서 매 턴 회복/방어.
 *  - statusResist: 적이 플레이어에게 디버프를 걸 때 부여량 차감.
 *  - rewardMul: 골드/시간조각/채집 보상 증폭.
 */

import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import type { CompanionBonuses } from '@/data/schemas';

function activeRecruits(): CompanionBonuses[] {
  const run = useRunStore();
  const data = useDataStore();
  const out: CompanionBonuses[] = [];
  for (const id of run.data.companions) {
    const r = data.npcs.get(id)?.recruit;
    if (r) out.push(r);
  }
  return out;
}

/** 상태이상 저항 합 — 해당 status + 'all'. 적이 거는 디버프 부여량에서 차감. */
export function companionStatusResist(status: string): number {
  let total = 0;
  for (const r of activeRecruits()) {
    if (!r.statusResist) continue;
    total += r.statusResist[status] ?? 0;
    total += r.statusResist.all ?? 0;
  }
  return total;
}

/** 전투 시작 효과 합(방어/힘/추가 드로우). */
export function companionCombatStart(): { block: number; strength: number; draw: number } {
  let block = 0;
  let strength = 0;
  let draw = 0;
  for (const r of activeRecruits()) {
    if (!r.combatStart) continue;
    block += r.combatStart.block ?? 0;
    strength += r.combatStart.strength ?? 0;
    draw += r.combatStart.draw ?? 0;
  }
  return { block, strength, draw };
}

/** 매 플레이어 턴 시작 효과 합(회복/방어). */
export function companionPerTurn(): { heal: number; block: number } {
  let heal = 0;
  let block = 0;
  for (const r of activeRecruits()) {
    if (!r.perTurn) continue;
    heal += r.perTurn.heal ?? 0;
    block += r.perTurn.block ?? 0;
  }
  return { heal, block };
}

/** 보상 증폭 — 최종 곱(1 + 동료 추가비율 합). 종류: gold/shards/gather. */
export function companionRewardMul(kind: 'gold' | 'shards' | 'gather'): number {
  let add = 0;
  for (const r of activeRecruits()) {
    if (!r.rewardMul) continue;
    add += r.rewardMul[kind] ?? 0;
  }
  return 1 + add;
}
