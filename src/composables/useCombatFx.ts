/**
 * 전투 시각 효과(FX) 공용 컴포저블 — CombatView / BossView 가 동일하게 사용.
 *
 * 책임:
 *  - HP 변화량을 *플로팅 숫자*(-N 빨강 / +N 초록)로 스폰하는 큐 관리.
 *  - 피격/플래시 일시 클래스 토글(흔들림·붉은 플래시·방패 반짝).
 *  - 전투 *로직*은 건드리지 않는다 — 뷰가 combat HP 를 watch 해 호출하는 순수 표현 계층.
 *  - prefers-reduced-motion 존중: 모션을 줄이되 숫자 자체는 짧게 표시(피드백 유지).
 *
 * 성능: transform/opacity 기반 CSS 애니메이션만 사용(레이아웃 리플로우 회피).
 */
import { ref } from 'vue';

export type FxTarget = 'player' | 'enemy';
export type FxKind = 'damage' | 'heal' | 'block';

export interface FloatingNumber {
  id: number;
  target: FxTarget;
  kind: FxKind;
  /** 표시 텍스트 (예: "-12", "+8", "🛡 5"). */
  text: string;
  /** 가로 분산(같은 시점 다중 팝업이 안 겹치게) — -1..1 비율. */
  drift: number;
}

const REDUCED =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 모션 감소 시 숫자 표시 시간(짧게), 평소엔 약간 길게. */
const NUMBER_TTL = REDUCED ? 700 : 1000;
/** 흔들림/플래시 지속(짧고 가볍게). */
const HIT_TTL = REDUCED ? 0 : 360;
const SHIELD_TTL = REDUCED ? 0 : 420;

export function useCombatFx() {
  const floats = ref<FloatingNumber[]>([]);
  let seq = 0;

  // 일시 클래스 플래그 — 뷰에서 :class 바인딩.
  const playerHit = ref(false);
  const enemyHit = ref(false);
  const playerShield = ref(false);
  const enemyShield = ref(false);

  function spawn(target: FxTarget, kind: FxKind, text: string) {
    const id = ++seq;
    const drift = Math.random() * 2 - 1; // -1..1
    floats.value.push({ id, target, kind, text, drift });
    window.setTimeout(() => {
      const idx = floats.value.findIndex((f) => f.id === id);
      if (idx !== -1) floats.value.splice(idx, 1);
    }, NUMBER_TTL);
  }

  /** 피해 팝업(-N) + 대상 흔들림/플래시. */
  function showDamage(target: FxTarget, amount: number) {
    if (amount <= 0) return;
    spawn(target, 'damage', `-${amount}`);
    pulseHit(target);
  }

  /** 회복 팝업(+N). */
  function showHeal(target: FxTarget, amount: number) {
    if (amount <= 0) return;
    spawn(target, 'heal', `+${amount}`);
  }

  /** 방어 획득 팝업(🛡 +N) + 방패 반짝. */
  function showBlock(target: FxTarget, amount: number) {
    if (amount <= 0) return;
    spawn(target, 'block', `🛡 +${amount}`);
    pulseShield(target);
  }

  function pulseHit(target: FxTarget) {
    if (HIT_TTL <= 0) return;
    const flag = target === 'player' ? playerHit : enemyHit;
    flag.value = false;
    // 다음 틱에 다시 켜야 연속 피격에도 애니메이션 재시작.
    requestAnimationFrame(() => {
      flag.value = true;
      window.setTimeout(() => (flag.value = false), HIT_TTL);
    });
  }

  function pulseShield(target: FxTarget) {
    if (SHIELD_TTL <= 0) return;
    const flag = target === 'player' ? playerShield : enemyShield;
    flag.value = false;
    requestAnimationFrame(() => {
      flag.value = true;
      window.setTimeout(() => (flag.value = false), SHIELD_TTL);
    });
  }

  return {
    reduced: REDUCED,
    floats,
    playerHit,
    enemyHit,
    playerShield,
    enemyShield,
    showDamage,
    showHeal,
    showBlock,
  };
}

/** 카드 사용 애니메이션 지연(ms) — 번쩍→사라짐 후 실제 play 호출. */
export const CARD_PLAY_DELAY = REDUCED ? 0 : 260;
