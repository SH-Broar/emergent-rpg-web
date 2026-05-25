/**
 * PC 키보드 전용 전투 입력 (작업 31) — CombatView / BossView 공용.
 *
 * 데스크톱에서 마우스 없이 전투할 수 있게 키 핸들러를 단다(모바일/터치는 그대로).
 *
 * 매핑:
 *  - 숫자 1~9 / 0(=10번째): 손패의 해당 위치 카드 사용. 사용 불가/잠금/은폐 무관하게 *위치*로 시도
 *    (canPlay가 막으면 무시). 은폐(facedown) 상태도 위치로 사용 가능.
 *  - Space / Enter / E: 턴 종료.
 *  - S: 발버둥(구속/삼킴 중일 때만 의미).
 *
 * 가드:
 *  - 입력 필드(input/textarea/contenteditable) 포커스 시 무시.
 *  - 모달(StruggleMinigame 등)·메뉴가 떠 있으면 무시(isBlocked).
 *  - 적 행동 애니메이션 중(enemyActing)·카드 사용 애니메이션 중엔 무시(isBlocked).
 *  - 수정 키(Ctrl/Meta/Alt) 조합은 무시(브라우저 단축키 보존).
 *
 * 정리: onUnmounted에서 리스너 해제(누수/중복 방지).
 */
import { onMounted, onUnmounted } from 'vue';

export interface CombatKeyHandlers {
  /** 손패 index 카드 사용 시도(뷰의 play와 동일 — canPlay 가드는 play 내부/여기서). */
  playIndex: (index: number) => void;
  /** 턴 종료. */
  endTurn: () => void;
  /** 발버둥(구속/삼킴 탈출). */
  struggle: () => void;
  /**
   * 지금 키 입력을 막아야 하는가 — true면 모든 전투 키 무시.
   * (적 행동 중·카드 애니메이션 중·모달/메뉴 오픈·전투 페이즈 아님 등 뷰가 종합 판정.)
   */
  isBlocked: () => boolean;
}

/** 입력 필드/편집 영역에 포커스가 있는지 — 그럴 땐 게임 키를 가로채지 않는다. */
function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (t.isContentEditable) return true;
  return false;
}

export function useCombatKeys(h: CombatKeyHandlers) {
  function onKeyDown(e: KeyboardEvent) {
    // 수정 키 조합·IME 조합 중·입력 필드 포커스·차단 상태면 무시.
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (isTypingTarget(e.target)) return;
    if (h.isBlocked()) return;

    // 숫자키 1~9 → index 0..8, 0 → index 9(열 번째). (e.code로 키보드 상단 숫자만; 텐키도 e.key로 보강.)
    if (e.key >= '0' && e.key <= '9') {
      const n = Number(e.key);
      const index = n === 0 ? 9 : n - 1;
      h.playIndex(index);
      e.preventDefault();
      return;
    }

    const k = e.key.toLowerCase();
    // 턴 종료 — Space / Enter / E.
    if (e.key === ' ' || e.code === 'Space' || e.key === 'Enter' || k === 'e') {
      h.endTurn();
      e.preventDefault();
      return;
    }
    // 발버둥 — S.
    if (k === 's') {
      h.struggle();
      e.preventDefault();
      return;
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown));
  onUnmounted(() => window.removeEventListener('keydown', onKeyDown));
}
