/**
 * 격자 전투 시각 효과(FX) 컴포저블 — GridCombatView 전용.
 *
 * 책임:
 *  - 엔진이 push한 `GridCombatState.fx`(FxEvent[])를 소비해 *전투원 단위*의 시각 효과로 변환.
 *  - hit(빨강 -N) / block-absorb(파랑 -N) / heal(초록 +N)을 *플로팅 숫자*로 스폰(actorId 기준).
 *  - hit/death은 해당 전투원 원에 짧은 흔들림/소멸 클래스를 토글.
 *  - move/spawn은 위치 트랜지션(원의 translate)으로 자연 처리되므로 별도 숫자는 안 띄운다.
 *  - 모든 표현은 ≤0.1초 트랜지션(D11) — CSS transform/opacity만.
 *  - 전투 *로직*은 절대 건드리지 않는다(순수 표현 계층). 소비한 fx는 호출자가 비운다.
 *
 * useCombatFx(구 1v1)의 격자 일반화 — 그쪽은 player/enemy 2자 고정이지만 여기선 actorId가 임의 다수.
 */
import { ref } from 'vue';
import type { FxEvent } from '@/data/schemas';

export type GridFxKind = 'damage' | 'blocked' | 'heal';

/** 한 전투원 원 위에 잠깐 떠오르는 숫자. */
export interface GridFloatingNumber {
  id: number;
  /** 어느 전투원 위에 띄울지(GridCombatant.id). */
  actorId: string;
  kind: GridFxKind;
  text: string;
  /** 가로 분산(같은 시점 다중 팝업 겹침 방지) — -1..1. */
  drift: number;
}

const REDUCED =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 숫자 표시 시간(짧게). */
const NUMBER_TTL = REDUCED ? 600 : 850;
/** 피격 흔들림 지속(≤0.1초 D11 — 흔들림 자체는 짧게). */
const HIT_TTL = REDUCED ? 0 : 100;

export function useGridFx() {
  const floats = ref<GridFloatingNumber[]>([]);
  /** 현재 흔들리는 전투원 id 집합(원에 .is-hit 클래스). */
  const hitActors = ref<Set<string>>(new Set());
  /** 소멸 중인 전투원 id 집합(원에 .is-dying 클래스 — 페이드아웃). */
  const dyingActors = ref<Set<string>>(new Set());
  let seq = 0;

  function spawn(actorId: string, kind: GridFxKind, text: string) {
    const id = ++seq;
    const drift = Math.random() * 2 - 1;
    floats.value.push({ id, actorId, kind, text, drift });
    window.setTimeout(() => {
      const idx = floats.value.findIndex((f) => f.id === id);
      if (idx !== -1) floats.value.splice(idx, 1);
    }, NUMBER_TTL);
  }

  function pulseHit(actorId: string) {
    if (HIT_TTL <= 0) return;
    // 새 Set으로 교체해 반응성 보장.
    const next = new Set(hitActors.value);
    next.add(actorId);
    hitActors.value = next;
    window.setTimeout(() => {
      const after = new Set(hitActors.value);
      after.delete(actorId);
      hitActors.value = after;
    }, HIT_TTL);
  }

  function markDying(actorId: string) {
    const next = new Set(dyingActors.value);
    next.add(actorId);
    dyingActors.value = next;
    // 짧은 페이드 후 정리(실제 DOM 제거는 enemies 배열에서 hp<=0로 사라질 때).
    window.setTimeout(() => {
      const after = new Set(dyingActors.value);
      after.delete(actorId);
      dyingActors.value = after;
    }, NUMBER_TTL);
  }

  /**
   * fx 큐 1건 처리 — 숫자/흔들림/소멸로 변환. move/spawn/status는 위치·배지가 처리하므로 no-op.
   */
  function consume(ev: FxEvent) {
    const actorId = ev.actorId ?? '';
    switch (ev.kind) {
      case 'hit':
        if ((ev.amount ?? 0) > 0) {
          spawn(actorId, 'damage', `-${ev.amount}`);
          pulseHit(actorId);
        }
        break;
      case 'block-absorb':
        if ((ev.amount ?? 0) > 0) {
          spawn(actorId, 'blocked', `-${ev.amount}`);
          pulseHit(actorId);
        }
        break;
      case 'heal':
        if ((ev.amount ?? 0) > 0) spawn(actorId, 'heal', `+${ev.amount}`);
        break;
      case 'death':
        markDying(actorId);
        break;
      case 'move':
      case 'spawn':
      case 'status':
      default:
        break;
    }
  }

  /** fx 배열 전체 소비(seq 순). 호출자가 이후 배열을 비운다. */
  function consumeAll(events: FxEvent[]) {
    const sorted = [...events].sort((a, b) => a.seq - b.seq);
    for (const ev of sorted) consume(ev);
  }

  return { reduced: REDUCED, floats, hitActors, dyingActors, consume, consumeAll };
}
