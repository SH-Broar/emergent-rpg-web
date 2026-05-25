/**
 * 적 턴 순차 진행 컴포저블 (작업 34) — CombatView / BossView 공용.
 *
 * 책임:
 *  - 플레이어 턴 종료 시 적 행동을 *하나씩* 짧은 딜레이로 실행해 보여준다(멀티액션이면 액션마다).
 *  - 각 액션 사이 await delay → 그 사이 뷰의 HP/방어 watch가 useCombatFx(플로팅 데미지·흔들림·
 *    방패 펄스)와 전투 로그를 자연스럽게 띄운다.
 *  - 적 행동 중에는 입력 차단 플래그(enemyActing)를 올린다 — 뷰가 카드/턴종료/발버둥/키입력을 막는다.
 *  - prefers-reduced-motion이면 딜레이 0(정보는 유지, 즉시 진행).
 *  - *전투 결과는 combat 시스템이 그대로 계산* — 이 계층은 순서·딜레이(표현)만 담당.
 *
 * 소프트락 방지:
 *  - 비동기 시퀀스 도중 컴포넌트가 unmount되면(전투 종료 후 라우팅) cancelled 플래그로 잔여 단계 중단.
 *  - 한 번 종료 신호(승/패)가 나오면 즉시 onResult로 넘기고 시퀀스를 빠져나온다(중복 진행 없음).
 */
import { onUnmounted, ref } from 'vue';
import {
  beginEnemyTurn,
  runEnemyAction,
  finishEnemyTurn,
  type TurnResult,
} from '@/systems/combat';
import type { Monster } from '@/data/schemas';

/** 모션 감소 선호 — 딜레이 0(즉시), 정보는 유지. */
const REDUCED =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 각 적 행동 사이 기본 딜레이(ms). reduced-motion이면 0. */
export const ENEMY_ACTION_DELAY = REDUCED ? 0 : 550;

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useEnemyTurn() {
  /** 적 행동 시퀀스 진행 중 — 뷰가 입력(카드·턴종료·발버둥·키)을 잠그는 데 사용. */
  const enemyActing = ref(false);
  let cancelled = false;

  // 컴포넌트 unmount 시 잔여 비동기 단계 중단(소프트락/누수 방지).
  onUnmounted(() => {
    cancelled = true;
  });

  /**
   * 턴 종료 진입점 — 뷰의 "턴 종료" 버튼/키가 호출.
   * onResult는 종료 신호(승/패)가 나올 때 *한 번만* 호출된다(중복 방지).
   *
   * @returns Promise<void> — 시퀀스가 끝나면 resolve(테스트/await용).
   */
  async function runTurn(monster: Monster, onResult: (r: TurnResult) => void): Promise<void> {
    if (enemyActing.value) return; // 이미 진행 중 — 재진입 차단.

    // 1단계: 행동 전 처리(교란 감소·유물·독 틱). 여기서 끝나면(독사·freeze) 액션 없이 종료/계속.
    const begin = beginEnemyTurn(monster);
    if (cancelled) return;
    if (begin.done) {
      onResult(begin.done);
      return;
    }

    const queue = begin.queue;
    // 실행할 행동이 없으면(freeze 등) 곧장 마무리.
    if (queue.length === 0) {
      const fin = finishEnemyTurn(monster);
      if (cancelled) return;
      onResult(fin);
      return;
    }

    enemyActing.value = true;
    try {
      // 2단계: 액션을 *하나씩* — 각 액션 후 딜레이로 FX/로그가 보이게 한다.
      for (let i = 0; i < queue.length; i++) {
        if (cancelled) return;
        const step = runEnemyAction(monster, queue[i]);
        if (cancelled) return;
        if (step.done) {
          // 전투 종료(승/패) — 잔여 액션 중단하고 즉시 결과로.
          onResult(step.done);
          return;
        }
        // 다음 액션 전 잠깐 — 마지막 액션 뒤에도 한 박 두어 결과를 눈에 담게.
        await wait(ENEMY_ACTION_DELAY);
        if (cancelled) return;
      }

      // 3단계: 나머지 처리 + 다음 플레이어 턴 시작.
      const fin = finishEnemyTurn(monster);
      if (cancelled) return;
      onResult(fin);
    } finally {
      enemyActing.value = false;
    }
  }

  return { enemyActing, runTurn };
}
