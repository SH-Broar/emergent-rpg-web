/**
 * 동료 지속 패시브 (5c → Item 37-② Stage A 개편).
 *
 * 영입 1회 보너스(덱슬롯·카드·유물·컬러)는 *제거*되었다(declutter). 남은 것은 *동료가 활성 슬롯에
 * 편성돼 있는 한 매 전투* 적용되는 지속 패시브 4종뿐이다. activeSlots(길이 3)에서 *passive 타입*
 * 동료만 집계하므로 세이브 영향 없음(매번 재계산).
 *
 * 적용 지점(combat.ts 등):
 *  - combatStart: startCombat에서 방어/힘/추가 드로우.
 *  - perTurn: applyPlayerStatusTurnStart에서 매 턴 회복/방어.
 *  - statusResist: 적이 플레이어에게 디버프를 걸 때 부여량 차감.
 *  - rewardMul: 골드/시간조각/채집 보상 증폭.
 */

import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import type { Companion, CompanionBonuses, RosterEntry } from '@/data/schemas';

/**
 * RosterEntry → 통합 Companion 정의. Stage A는 npc만 정의를 갖는다(monster는 Stage B).
 * 정의가 없으면 undefined.
 */
export function companionForEntry(entry: RosterEntry | null | undefined): Companion | undefined {
  if (!entry) return undefined;
  const data = useDataStore();
  if (entry.src === 'npc') {
    const npc = data.npcs.get(entry.id);
    return npc?.companion;
  }
  // Stage B: monster 동료. 현재는 미정의.
  return undefined;
}

/** 활성 슬롯에 편성된 *passive 타입* 동료의 보너스 목록. */
function activePassives(): CompanionBonuses[] {
  const run = useRunStore();
  const out: CompanionBonuses[] = [];
  for (const slot of run.data.activeSlots ?? []) {
    const comp = companionForEntry(slot);
    if (comp?.kind === 'passive' && comp.passive) out.push(comp.passive);
  }
  return out;
}

/** 상태이상 저항 합 — 해당 status + 'all'. 적이 거는 디버프 부여량에서 차감. */
export function companionStatusResist(status: string): number {
  let total = 0;
  for (const r of activePassives()) {
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
  for (const r of activePassives()) {
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
  for (const r of activePassives()) {
    if (!r.perTurn) continue;
    heal += r.perTurn.heal ?? 0;
    block += r.perTurn.block ?? 0;
  }
  return { heal, block };
}

/** 보상 증폭 — 최종 곱(1 + 동료 추가비율 합). 종류: gold/shards/gather. */
export function companionRewardMul(kind: 'gold' | 'shards' | 'gather'): number {
  let add = 0;
  for (const r of activePassives()) {
    if (!r.rewardMul) continue;
    add += r.rewardMul[kind] ?? 0;
  }
  return 1 + add;
}
