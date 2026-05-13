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
}

const DEFAULT_FLAGS: DebugFlags = {
  infiniteMana: false,
  freezeEnemies: false,
  fastMeta: false,
  unlockAll: false,
  verboseLog: false,
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

/** 런 시작 직전, 임시로 선택된 옵션. */
export interface PendingRunSetup {
  timelineId: string | null;
  characterId: string | null;
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    toasts: [] as Toast[],
    modalOpen: false as boolean,
    modalContent: null as string | null,
    debug: loadDebugFlags(),
    pendingRunSetup: { timelineId: null, characterId: null } as PendingRunSetup,
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
  },
});
