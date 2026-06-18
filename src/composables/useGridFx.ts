/**
 * 격자 전투 시각 효과(FX) 컴포저블 — GridCombatView 전용.
 *
 * 책임:
 *  - 엔진이 push한 `GridCombatState.fx`(FxEvent[])를 소비해 *전투원 단위*의 시각 효과로 변환.
 *  - hit(빨강 -N) / block-absorb(파랑 -N) / heal(초록 +N)을 *플로팅 숫자*로 스폰(actorId 기준).
 *  - hit/death은 해당 전투원 원에 짧은 흔들림/소멸 클래스를 토글.
 *  - **진짜 순차 재생(A)**: 엔진은 라운드를 *즉시 final*로 해소하지만, 뷰는 토큰 위치·HP·방어를
 *    엔진 final이 아니라 *display state*(actorId→pos/hp/block)로 렌더한다. 라운드 시작 상태에서
 *    출발해 fx를 **행동(actionIndex) 순서대로 하나씩** 적용하며, 각 행동 모션이 끝난 뒤 0.35초
 *    간격을 두고 다음 행동으로 넘어간다. 이동도 이 순차에 포함(즉시 final 금지).
 *  - 개별 모션은 여전히 빠르게(≤0.1초). *행동 사이* 간격만 0.35초.
 *  - reduced-motion이면 간격 0(즉시 final).
 *  - 전투 *로직*은 절대 건드리지 않는다(순수 표현 계층). 소비한 fx는 호출자가 비운다.
 */
import { ref } from 'vue';
import type { FxEvent, GridPos } from '@/data/schemas';

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

/** 라운드 시작 시점 한 전투원의 표시 스냅샷(display state 출발점). */
export interface ActorSnapshot {
  id: string;
  pos: GridPos;
  hp: number;
  block: number;
}

const REDUCED =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 숫자 표시 시간 — 행동 1개 dwell(0.4s)보다 길게 남겨 읽히게. */
const NUMBER_TTL = REDUCED ? 600 : 1100;
/** 피격 흔들림 지속(흔들림 모션 자체는 짧게 — dwell과 별개). */
const HIT_TTL = REDUCED ? 0 : 160;
/**
 * 이동 트랜지션 시간(CSS .token transition과 맞춤) — 토큰이 칸을 미끄러지는 시간.
 * dwell(ACTION_MIN) 안에 들어오도록 살짝 짧게.
 */
const MOVE_MS = REDUCED ? 0 : 380;
/**
 * 한 행동(그룹) *최소 표시 시간*(#5) — 모든 내·적 행동은 각각 ≥0.4초 동안 단독으로 보인다.
 * 이동/피격 모션이 더 짧아도 이 시간만큼은 그 행동만 화면에 머문다(동시 재생 금지).
 */
const ACTION_MIN = REDUCED ? 0 : 400;
/**
 * 진짜 순차 재생(A) — *행동 사이* 간격(#5). 한 행동 dwell이 끝난 뒤 이만큼 더 쉬고 다음 행동.
 * 3행동이면 (0.4 dwell + 0.4 gap) × 3 ≈ 2.4초 이상. reduced-motion이면 0.
 */
const ACTION_GAP = REDUCED ? 0 : 400;

export function useGridFx() {
  const floats = ref<GridFloatingNumber[]>([]);
  /** 현재 흔들리는 전투원 id 집합(원에 .is-hit 클래스). */
  const hitActors = ref<Set<string>>(new Set());
  /** 소멸 중인 전투원 id 집합(원에 .is-dying 클래스 — 페이드아웃). */
  const dyingActors = ref<Set<string>>(new Set());

  // === display state(A) — 순차 재생 중 토큰이 바인딩하는 *표시* 위치/HP/방어. ===
  // 비어 있으면(idle) 뷰가 엔진 state로 폴백. 순차 재생이 끝나면 비워 final로 수렴.
  const displayPos = ref<Map<string, GridPos>>(new Map());
  const displayHp = ref<Map<string, number>>(new Map());
  const displayBlock = ref<Map<string, number>>(new Map());
  /** 순차 재생 진행 중 여부 — 뷰가 display 우선 렌더할지 판단. */
  const playing = ref(false);

  let seq = 0;
  /** 진행 중 타임아웃 핸들(전투 종료/언마운트 시 정리용). */
  const timers: number[] = [];
  function later(fn: () => void, ms: number): void {
    if (ms <= 0) { fn(); return; }
    const h = window.setTimeout(fn, ms);
    timers.push(h);
  }
  function clearTimers(): void {
    for (const h of timers) window.clearTimeout(h);
    timers.length = 0;
  }

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

  // === display 갱신 헬퍼(새 Map으로 교체해 반응성 보장) ===
  function setDisplayPos(actorId: string, pos: GridPos): void {
    const m = new Map(displayPos.value);
    m.set(actorId, { ...pos });
    displayPos.value = m;
  }
  function setDisplayHp(actorId: string, hp: number): void {
    const m = new Map(displayHp.value);
    m.set(actorId, hp);
    displayHp.value = m;
  }
  function setDisplayBlock(actorId: string, block: number): void {
    const m = new Map(displayBlock.value);
    m.set(actorId, block);
    displayBlock.value = m;
  }

  /**
   * fx 1건을 *display state + 시각 효과*로 적용(순차 재생 1스텝).
   *  - move : display 위치 갱신 → CSS transition으로 이동 모션.
   *  - hit  : display block 흡수 후 hp 차감 + 빨강 숫자 + 흔들림.
   *  - block-absorb : display block 차감 + 파랑 숫자 + 흔들림.
   *  - heal : display hp 증가 + 초록 숫자.
   *  - death: 소멸 마킹.
   */
  function applyFx(ev: FxEvent): void {
    const actorId = ev.actorId ?? '';
    switch (ev.kind) {
      case 'move':
        if (ev.to) setDisplayPos(actorId, ev.to);
        break;
      case 'hit':
        if ((ev.amount ?? 0) > 0) {
          const hp = displayHp.value.get(actorId);
          if (hp !== undefined) setDisplayHp(actorId, Math.max(0, hp - (ev.amount ?? 0)));
          spawn(actorId, 'damage', `-${ev.amount}`);
          pulseHit(actorId);
        }
        break;
      case 'block-absorb':
        if ((ev.amount ?? 0) > 0) {
          const bl = displayBlock.value.get(actorId);
          if (bl !== undefined) setDisplayBlock(actorId, Math.max(0, bl - (ev.amount ?? 0)));
          spawn(actorId, 'blocked', `-${ev.amount}`);
          pulseHit(actorId);
        }
        break;
      case 'block-gain':
        // 방어 *획득*(US-007) — display block 증가 + 파란 +N(흡수의 -N과 구분).
        if ((ev.amount ?? 0) > 0) {
          const bl = displayBlock.value.get(actorId);
          if (bl !== undefined) setDisplayBlock(actorId, bl + (ev.amount ?? 0));
          spawn(actorId, 'blocked', `+${ev.amount}`);
        }
        break;
      case 'heal':
        if ((ev.amount ?? 0) > 0) {
          const hp = displayHp.value.get(actorId);
          if (hp !== undefined) setDisplayHp(actorId, hp + (ev.amount ?? 0));
          spawn(actorId, 'heal', `+${ev.amount}`);
        }
        break;
      case 'death':
        markDying(actorId);
        break;
      case 'spawn':
        if (ev.to) setDisplayPos(actorId, ev.to);
        break;
      case 'status':
      default:
        break;
    }
  }

  /**
   * fx 큐 1건 처리(비-순차 폴백 경로 — 방어적 watch에서만 사용).
   * 숫자/흔들림/소멸만 표현하고 display state는 건드리지 않는다(idle 렌더는 엔진 state).
   */
  function consume(ev: FxEvent) {
    const actorId = ev.actorId ?? '';
    switch (ev.kind) {
      case 'hit':
        if ((ev.amount ?? 0) > 0) { spawn(actorId, 'damage', `-${ev.amount}`); pulseHit(actorId); }
        break;
      case 'block-absorb':
        if ((ev.amount ?? 0) > 0) { spawn(actorId, 'blocked', `-${ev.amount}`); pulseHit(actorId); }
        break;
      case 'block-gain':
        if ((ev.amount ?? 0) > 0) spawn(actorId, 'blocked', `+${ev.amount}`);
        break;
      case 'heal':
        if ((ev.amount ?? 0) > 0) spawn(actorId, 'heal', `+${ev.amount}`);
        break;
      case 'death':
        markDying(actorId);
        break;
      default:
        break;
    }
  }

  /** fx 배열 전체 즉시 소비(폴백 — 순차 없이). */
  function consumeAll(events: FxEvent[]): void {
    const sorted = [...events].sort((a, b) => a.seq - b.seq);
    for (const ev of sorted) consume(ev);
  }

  /**
   * 한 행동 그룹(actionIndex)의 *단독 표시* 길이(#5) — 항상 ACTION_MIN(0.4s) 이상.
   * 이동/피격 모션이 더 길면 그 길이를 쓴다. 이 시간 동안 이 행동만 화면에 머문다.
   */
  function groupMotionMs(group: FxEvent[]): number {
    if (REDUCED || group.length === 0) return 0;
    const hasMove = group.some((e) => e.kind === 'move' || e.kind === 'spawn');
    let ms = ACTION_MIN;
    if (hasMove) ms = Math.max(ms, MOVE_MS);
    return ms;
  }

  /**
   * **진짜 순차 재생(A)** — 라운드 시작 스냅샷에서 출발해 fx를 행동 순서대로 하나씩 재생.
   *  1) display state = start (모든 전투원 pos/hp/block).
   *  2) fx를 actionIndex로 그룹지어 등장 순서대로 정렬.
   *  3) 각 그룹을 차례로 재생: 그룹 fx 적용(이동/피격/회복/소멸) → 모션 완료 대기 → ACTION_GAP 쉬고 다음.
   *  4) 마지막 그룹 후 onDone() 호출(호출자가 display 비워 엔진 final로 수렴).
   * 반환: 전체 재생 총 시간(ms) — 호출자 settle 타이밍용.
   */
  function playRound(start: ActorSnapshot[], events: FxEvent[], onDone: () => void): number {
    clearTimers();
    // 1) display = start.
    const pm = new Map<string, GridPos>();
    const hm = new Map<string, number>();
    const bm = new Map<string, number>();
    for (const s of start) {
      pm.set(s.id, { ...s.pos });
      hm.set(s.id, s.hp);
      bm.set(s.id, s.block);
    }
    displayPos.value = pm;
    displayHp.value = hm;
    displayBlock.value = bm;
    playing.value = true;

    // 2) actionIndex 그룹(등장 순서 보존).
    const sorted = [...events].sort((a, b) => a.seq - b.seq);
    const groups: FxEvent[][] = [];
    const indexOfGroup = new Map<number, number>();
    for (const ev of sorted) {
      const key = ev.actionIndex ?? 0;
      let gi = indexOfGroup.get(key);
      if (gi === undefined) { gi = groups.length; indexOfGroup.set(key, gi); groups.push([]); }
      groups[gi].push(ev);
    }

    const finish = () => { playing.value = false; onDone(); };

    if (groups.length === 0 || REDUCED) {
      // 효과 없음 또는 reduced — 전부 즉시 적용 후 종료.
      for (const g of groups) for (const ev of g) applyFx(ev);
      finish();
      return 0;
    }

    // 3) 그룹 순차 — 각 그룹 시작 시각 = 이전 그룹들의 (모션 + ACTION_GAP) 누적.
    let cursor = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const at = cursor;
      later(() => { for (const ev of group) applyFx(ev); }, at);
      const motion = groupMotionMs(group);
      cursor = at + motion + ACTION_GAP;
    }

    // 4) 마지막 그룹 모션까지 끝난 뒤 종료(꼬리 여유 포함).
    later(finish, cursor);
    return cursor;
  }

  /** display state 비우기 — idle 렌더를 엔진 state로 되돌림(재생 종료/정리). */
  function clearDisplay(): void {
    clearTimers();
    playing.value = false;
    displayPos.value = new Map();
    displayHp.value = new Map();
    displayBlock.value = new Map();
  }

  return {
    reduced: REDUCED,
    floats, hitActors, dyingActors,
    displayPos, displayHp, displayBlock, playing,
    consume, consumeAll, playRound, clearDisplay,
  };
}
