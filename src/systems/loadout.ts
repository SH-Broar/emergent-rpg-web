/**
 * 전투형 유물 로드아웃 (격자 전투).
 *
 * 격자 전투는 *전투형 유물*만 한도(loadoutCap) 내에서 휴대한다.
 * 즉발·패시브 유물(on-acquire·passive·on-node-enter·on-rest)은 한도와 무관하게 상시 적용되므로
 * 로드아웃 선택과 무관(기존 modifier 조회 경로 그대로).
 *
 * D-decision: 유물 로드아웃(전투형만 한도). 한도 = min(5, 3 + (currentDay - 1)).
 */

import type { Relic, RelicTriggerKind, RunState } from '@/data/schemas';

/** 로드아웃 한도 — 3 + (일차-1), 최대 5. */
export function loadoutCap(run: RunState): number {
  const day = Math.max(1, run.currentDay ?? 1);
  return Math.min(5, 3 + (day - 1));
}

/**
 * 전투형(combat-type) 유물 판정.
 *  - relic.combatType이 명시돼 있으면 그 값 우선.
 *  - 미설정이면 trigger로 추론:
 *      전투형 = 전투 중 발동하는 트리거(on-combat-start/end, on-card-played-*, on-turn-*,
 *               on-draw, on-damage-taken, on-block-gain).
 *      즉발·패시브 = passive, on-acquire, on-node-enter, on-rest, on-item-use, on-color-gain.
 */
export function isCombatType(relic: Relic): boolean {
  if (typeof relic.combatType === 'boolean') return relic.combatType;
  return COMBAT_TRIGGERS.has(relic.trigger);
}

/** 전투 중 발동하는 트리거 집합(combatType 미설정 시 추론용). */
const COMBAT_TRIGGERS = new Set<RelicTriggerKind>([
  'on-combat-start',
  'on-combat-end',
  'on-card-play',
  'on-card-played-before',
  'on-card-played-after',
  'on-turn-start',
  'on-turn-end',
  'on-draw',
  'on-damage-taken',
  'on-block-gain',
]);

/** 보유 유물 중 전투형 전부. */
export function combatRelics(run: RunState): Relic[] {
  return (run.relics ?? []).filter(isCombatType);
}

/**
 * 이번 전투에 적용할 전투형 유물 로드아웃을 확정.
 *  - run.combatLoadout(선택된 relicId 목록)이 있으면 그 중 *보유 + 전투형*만, 한도까지.
 *  - 비었거나 부족하면 보유 전투형 중 한도까지 자동 채움(선택분 우선, 중복 제외).
 *  - 즉발·패시브 유물은 여기 포함하지 않는다(상시 적용).
 */
export function resolveLoadout(run: RunState): Relic[] {
  const cap = loadoutCap(run);
  const pool = combatRelics(run);
  const byId = new Map(pool.map((r) => [r.id, r]));

  const out: Relic[] = [];
  const seen = new Set<string>();

  // 1) 명시 선택분(보유 전투형만) — 한도까지.
  for (const id of run.combatLoadout ?? []) {
    if (out.length >= cap) break;
    const relic = byId.get(id);
    if (relic && !seen.has(id)) {
      out.push(relic);
      seen.add(id);
    }
  }

  // 2) 자동 채움 — 남은 전투형으로 한도까지.
  for (const relic of pool) {
    if (out.length >= cap) break;
    if (!seen.has(relic.id)) {
      out.push(relic);
      seen.add(relic.id);
    }
  }

  return out;
}
