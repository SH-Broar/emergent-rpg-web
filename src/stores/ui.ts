/**
 * Pinia 스토어 — 전역 UI 상태 (모달/토스트/특수효과 토글).
 */

import { defineStore } from 'pinia';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  duration: number;
}

/**
 * 컬러 상승 팝 — 컬러값이 *오를 때* 화면 상단 중앙에 잠깐 띄우는 시각 피드백(토스트와 별개).
 * applyColorBoost(colors.ts)가 실제 상승분(delta>0)에 대해 호출한다. total = 상승 후 누적값(/100).
 */
export interface ColorPop {
  id: number;
  color: string;
  delta: number;
  total: number;
}

/** 디버그/특수효과 토글 (분기 "버그" 화면). */
export interface DebugFlags {
  /** 모든 카드 항상 사용 가능 (마나 무한). */
  infiniteMana: boolean;
  /** 적 행동 시뮬 비활성화 (전투 정지 디버그). */
  freezeEnemies: boolean;
  /** 게이지 즉시 채움. */
  fastMeta: boolean;
  /** 모든 콘텐츠 해금. */
  unlockAll: boolean;
  /** 콘솔에 상세 로그. */
  verboseLog: boolean;
  /**
   * 그림 프로토타입 모드. ON이면 각 페이지에 SceneCharacter 도형 placeholder가
   * 등장한다. 실제 일러스트 작업 전 자리·움직임 미리보기 용도. 기본 OFF — 원본
   * 게임은 단 1픽셀도 바뀌지 않는다(각 뷰는 v-if로 DOM에서 완전히 빠진다).
   */
  showPortraits: boolean;
}

const DEFAULT_FLAGS: DebugFlags = {
  infiniteMana: false,
  freezeEnemies: false,
  fastMeta: false,
  unlockAll: false,
  verboseLog: false,
  showPortraits: false,
};

const DEBUG_STORAGE_KEY = 'rdc-debug-v1';

function loadDebugFlags(): DebugFlags {
  try {
    const raw = localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FLAGS };
    return { ...DEFAULT_FLAGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

let toastSeq = 0;
let colorPopSeq = 0;

/** 런 시작 직전, 임시로 선택된 옵션. */
export interface PendingRunSetup {
  timelineId: string | null;
  raceId: string | null;
  /** 카오스 선택 단계에서 확정한 활성 카오스(강도 포함). 미선택이면 빈 배열. */
  activeChaos: { id: string; intensity: number }[];
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    toasts: [] as Toast[],
    colorPops: [] as ColorPop[],
    modalOpen: false as boolean,
    modalContent: null as string | null,
    debug: loadDebugFlags(),
    pendingRunSetup: { timelineId: null, raceId: null, activeChaos: [] } as PendingRunSetup,
    /**
     * 디버그 전투 오버라이드 — 설정 시 CombatView/BossView가 노드/연표 대신
     * 이 id의 적/보스로 전투. 비영속(새로고침 시 사라짐). clearCombat에서 해제.
     */
    debugBattle: { monsterId: null as string | null, bossId: null as string | null },
    /**
     * 스파링(안전 대련) 컨텍스트 — NPC 사건에서 `spar=` 토큰으로 진입. 설정 시 CombatView가
     * 이 monsterId로 전투하되 *결과를 런에 남기지 않는다*(승/패 HP 원복·목숨 미소모·노드 무변경·XP 없음).
     * 승리 시 npcId 친밀도 +1. **비영속**(세이브 무영향): 전투 중 새로고침/복원 시 sparring이 사라지면
     * 일반 전투로 취급된다 — 파일럿 단계에서 허용하는 엣지(아래 CombatView 주석 참조).
     */
    sparring: null as { monsterId: string; npcId: string | null } | null,
    /**
     * 레벨업 강화 픽 모달 열림 여부 (XP·각성 시스템). 전투 승리로 레벨업하면 자동으로 열고,
     * 캐릭터 메뉴에서도 (이월 강화권이 있을 때) 직접 열 수 있다. 비영속.
     */
    enhancePickOpen: false as boolean,
  }),

  actions: {
    toast(kind: ToastKind, message: string, duration = 3000) {
      const id = ++toastSeq;
      this.toasts.push({ id, kind, message, duration });
      window.setTimeout(() => this.dismissToast(id), duration);
    },

    dismissToast(id: number) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },

    /**
     * 컬러 상승 팝 — 상단 중앙에 잠깐 띄운다(약 1.6초 뒤 자동 제거). delta는 상승분, total은 누적값.
     * 같은 컬러가 연달아 오르면 여러 개가 쌓였다가 순차 소멸한다(ColorPopOverlay가 렌더).
     */
    colorPop(color: string, delta: number, total: number) {
      const id = ++colorPopSeq;
      this.colorPops.push({ id, color, delta, total });
      window.setTimeout(() => {
        this.colorPops = this.colorPops.filter((p) => p.id !== id);
      }, 1600);
    },

    openModal(content: string) {
      this.modalContent = content;
      this.modalOpen = true;
    },

    closeModal() {
      this.modalOpen = false;
      this.modalContent = null;
    },

    setDebugFlag<K extends keyof DebugFlags>(key: K, value: DebugFlags[K]) {
      this.debug[key] = value;
      try {
        localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(this.debug));
      } catch {
        // ignore
      }
    },

    setDebugBattle(payload: { monsterId?: string | null; bossId?: string | null }) {
      this.debugBattle.monsterId = payload.monsterId ?? null;
      this.debugBattle.bossId = payload.bossId ?? null;
    },

    clearDebugBattle() {
      this.debugBattle.monsterId = null;
      this.debugBattle.bossId = null;
    },

    /** 스파링 진입 — NPC 사건의 `spar=` 토큰이 호출. CombatView가 이 컨텍스트로 안전 대련을 연다. */
    setSparring(payload: { monsterId: string; npcId: string | null }) {
      this.sparring = { monsterId: payload.monsterId, npcId: payload.npcId };
    },

    /** 스파링 해제 — 대련 종료(CombatView 종료 경로)에서 호출. */
    clearSparring() {
      this.sparring = null;
    },

    /** 레벨업 강화 픽 모달 열기 (전투 승리 레벨업·캐릭터 메뉴 진입). */
    openEnhancePick() {
      this.enhancePickOpen = true;
    },

    /** 레벨업 강화 픽 모달 닫기 (강화권은 이월되므로 잔여가 있어도 닫을 수 있음). */
    closeEnhancePick() {
      this.enhancePickOpen = false;
    },
  },
});
