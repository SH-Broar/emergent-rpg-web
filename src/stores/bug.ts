/**
 * Pinia 스토어 — 버그 (매 런 단위 특수 기능 토글).
 *
 * spec v2 (사용자 정의):
 *   - 연구: 되돌아가지 않는 해금 시스템 (영구). → useMetaStore
 *   - 버그: 매 런 단위로 켰다 껐다 할 수 있는 특수 기능. → 여기.
 *
 * 한 런 시작 시 *어떤 버그를 적용할지* 결정하고, 런 동안 적용.
 * 구체적인 버그 modifier 정의는 사용자가 추후 추가할 영역.
 */

import { defineStore } from 'pinia';

/** 한 버그 항목. 사용자가 자유롭게 정의·확장 가능. */
export interface BugModifier {
  id: string;
  name: string;
  description: string;
  /** 해금 조건 (영구 연구로 풀린 토큰 등). 없으면 항상 사용 가능. */
  unlockKey?: string;
  /** 메타 진행에 영향을 주는가? (false = 무영향, true = 변환 보너스 페널티 등) */
  affectsMeta: boolean;
}

/** 활성화 상태 — 어떤 버그가 *현재 런*에 적용되는지. */
interface BugState {
  /** 사용 가능한 버그 카탈로그 (정의 — 향후 외부 데이터 파일로 이동 가능). */
  catalog: BugModifier[];
  /** 현재 활성화된 버그 id 집합. 메인 메뉴 버그 화면에서 토글. */
  active: Set<string>;
}

export const useBugStore = defineStore('bug', {
  state: (): BugState => ({
    // 카탈로그는 아직 비어 있음 — 사용자가 게임 진행하며 정의.
    catalog: [],
    active: new Set<string>(),
  }),

  getters: {
    isActive: (state) => (id: string) => state.active.has(id),
    activeList: (state) =>
      state.catalog.filter((m) => state.active.has(m.id)),
  },

  actions: {
    toggle(id: string) {
      if (this.active.has(id)) {
        this.active.delete(id);
      } else {
        this.active.add(id);
      }
    },

    setActive(id: string, value: boolean) {
      if (value) this.active.add(id);
      else this.active.delete(id);
    },

    /** 런 종료 시 호출 — 일부 버그는 런별 1회용일 수 있음. 현재는 유지. */
    onRunEnd() {
      // 추후: 일회용 버그는 자동 해제
    },

    /** 카탈로그에 새 버그 추가 (사용자 정의 또는 데이터 로드 시). */
    registerBug(bug: BugModifier) {
      if (!this.catalog.find((b) => b.id === bug.id)) {
        this.catalog.push(bug);
      }
    },
  },
});
