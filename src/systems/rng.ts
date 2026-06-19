/**
 * 결정론적 난수 — 한 런 내내 *시드 고정* 보장.
 *
 * 사용자 사양: "랜덤 시드는 매 판 고정 — 나갔다 와도 동일한 이벤트/전투".
 *
 * 패턴:
 *   - 런 시작 시 RunStore가 `setRng`로 *런 전용 PRNG*를 등록한다.
 *   - 시스템·UI 코드는 `Math.random()` 대신 `rng()`를 호출 — *어디서든 시드 적용*.
 *   - 저장·복원 시 RunStore의 rngState를 함께 직렬화하면 같은 시퀀스가 재현된다.
 *
 * 알고리즘: Mulberry32 — 32비트 상태, 깔끔한 분포, 매우 빠름.
 */

/** 현재 등록된 PRNG. 기본은 Math.random (런 외부에서 호출 시). */
let _rng: () => number = Math.random;

/** 외부에서 PRNG 함수를 교체. 런 시작·복원 시 RunStore가 호출. */
export function setRng(fn: () => number): void {
  _rng = fn;
}

/**
 * 현재 등록된 PRNG 함수 자체를 반환(임시 교체 후 *원복*용).
 * 주의: rng()는 매 호출 _rng를 위임하는 래퍼라 그것을 다시 setRng하면 자기재귀가 된다.
 * 반드시 이 getRng()로 *실제 등록 함수*를 떠 두었다가 setRng로 되돌릴 것.
 */
export function getRng(): () => number {
  return _rng;
}

/** 현재 등록된 PRNG로 [0, 1) 난수 1개 반환. */
export function rng(): number {
  return _rng();
}

/**
 * Mulberry32 — 32비트 시드 → [0, 1) 난수.
 * 상태(s)는 호출마다 진행되며 함수가 반환한 객체에 노출됨.
 *
 * 직렬화: stateRef.value 만 저장/복원하면 정확히 같은 시퀀스 재현.
 */
export interface SeededRng {
  /** [0, 1) 난수 1개 반환 — 호출 시 상태가 진행됨. */
  next(): number;
  /** 현재 내부 상태 (직렬화용). */
  getState(): number;
  /** 외부에서 상태를 강제 설정 (복원용). */
  setState(s: number): void;
}

export function createSeededRng(initialState: number): SeededRng {
  let s = initialState >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState() {
      return s;
    },
    setState(next: number) {
      s = next >>> 0;
    },
  };
}

/** 새 런용 시드 — Math.random 기반. (다음 런부터 결정론) */
export function generateInitialSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
