/**
 * 락(조준형) 진행 — *독립 모듈*.
 *
 * 적이 `lockin:<condition>:<value>:<label>` 행동으로 거는 누적 해제 장치(CombatState.locks[]).
 * 해제 진행은 *플레이어 행동* 시 누적된다(감쇠 없음). progress ≥ threshold면 해당 락 제거.
 *
 * 왜 별도 모듈인가(순환 import 회피):
 *   카드 방어(combat.ts)뿐 아니라 *유물*(relic.ts)·*포션*(item.ts)으로 얻은 방어도 block 락 진행에
 *   반영돼야 한다(QA Medium-1). relic.ts/item.ts → combat.ts 신규 의존은 순환을 만들므로,
 *   진행 로직을 의존성이 가벼운 이 모듈로 추출해 combat.ts·relic.ts·item.ts가 함께 import 한다.
 *   이 모듈은 *타입(@/data/schemas)*과 *ui store(toast)* 외엔 의존하지 않는다 → 순환 없음.
 */

import type { CombatState, Lock, LockCondition } from '@/data/schemas';
import { useUiStore } from '@/stores/ui';

/** 활성 락 목록(가드 포함). 옛 세이브 호환 — undefined면 빈 배열로 초기화. */
export function activeLocks(c: CombatState): Lock[] {
  if (!c.locks) c.locks = [];
  return c.locks;
}

/** 충족(progress ≥ threshold)된 락을 제거하고 토스트. */
export function clearSatisfiedLocks(c: CombatState): void {
  const locks = activeLocks(c);
  const kept: Lock[] = [];
  for (const lock of locks) {
    if (lock.progress >= lock.threshold) {
      useUiStore().toast('success', `${lock.label} — 락을 풀었다!`);
    } else {
      kept.push(lock);
    }
  }
  c.locks = kept;
}

/**
 * 누적형 락 진행 — 주어진 condition의 *모든* 락에 amount를 더하고, 충족(≥threshold)된 락은 제거.
 * amount ≤ 0이면 no-op. 충족 시 토스트로 해제 안내.
 */
export function progressLocks(c: CombatState, condition: LockCondition, amount: number): void {
  if (amount <= 0) return;
  const locks = activeLocks(c);
  if (locks.length === 0) return;
  let freedAny = false;
  for (const lock of locks) {
    if (lock.condition !== condition) continue;
    lock.progress += amount;
    if (lock.progress >= lock.threshold) freedAny = true;
  }
  if (freedAny) clearSatisfiedLocks(c);
}

/**
 * 플레이어 *방어 획득* 일원화 — 모든 플레이어 block 가산은 이 함수를 거친다.
 * block 락 진행(누적) + no-defense 금욕 추적(이번 턴 방어함)을 함께 처리한다.
 * (적 block 가산은 이 함수를 쓰지 않는다 — 적은 자유롭게 c.enemy.block += value.)
 *
 * 카드(combat.ts)·유물(relic.ts)·포션(item.ts) 모두 이 단일 경로로 방어를 얻어
 * block 락 progress 누적·금욕 추적 일관성을 보장한다(QA Medium-1).
 */
export function gainPlayerBlock(c: CombatState, amount: number): void {
  if (amount <= 0) return;
  c.player.block += amount;
  c.lockDefendedThisTurn = true;
  progressLocks(c, 'block', amount);
}

/**
 * 금욕형 락(no-attack/no-defense) 턴 정산 — *플레이어 턴 종료 시*(beginEnemyTurn) 1회 호출.
 * 그 턴에 해당 행동을 안 했으면 progress +1, 했으면 무효(progress 불변). 충족 시 해제.
 * 정산 후 추적 플래그를 리셋(다음 플레이어 턴 대비).
 */
export function settleAbstinenceLocks(c: CombatState): void {
  const locks = activeLocks(c);
  if (locks.length > 0) {
    const attacked = c.lockAttackedThisTurn === true;
    const defended = c.lockDefendedThisTurn === true;
    let freedAny = false;
    for (const lock of locks) {
      if (lock.condition === 'no-attack' && !attacked) {
        lock.progress += 1;
        if (lock.progress >= lock.threshold) freedAny = true;
      } else if (lock.condition === 'no-defense' && !defended) {
        lock.progress += 1;
        if (lock.progress >= lock.threshold) freedAny = true;
      }
    }
    if (freedAny) clearSatisfiedLocks(c);
  }
  // 다음 플레이어 턴을 위해 추적 리셋.
  c.lockAttackedThisTurn = false;
  c.lockDefendedThisTurn = false;
}
