/**
 * Pinia 스토어 — 카오스 (매 런 단위 특수 기능 토글).
 *
 * 사용자 정의 (spec):
 *   - 연구: 되돌아가지 않는 해금 시스템 (영구). → useMetaStore
 *   - 카오스: 매 런 단위로 켰다 껐다 할 수 있는 특수 기능. → 여기.
 *
 * (이전 명칭 "버그" — 실제 코드 결함과 혼동되어 *카오스*로 재명명.)
 *
 * 한 런 시작 시 *어떤 카오스를 적용할지* 결정하고, 런 동안 적용.
 * 구체적인 카오스 modifier 정의는 사용자가 추후 추가할 영역.
 */

import { defineStore } from 'pinia';
// r4: ChaosModifier 인터페이스는 schemas/chaos.ts로 이전 (데이터 파일 로딩 위해).
// 기존 import 경로 유지를 위해 re-export.
import type { ChaosModifier } from '@/data/schemas';
export type { ChaosModifier };

interface ChaosState {
  /** 사용 가능한 카오스 카탈로그 (정의 — 향후 외부 데이터 파일로 이동 가능). */
  catalog: ChaosModifier[];
  /** 현재 활성화된 카오스 id 집합. */
  active: Set<string>;
}

export const useChaosStore = defineStore('chaos', {
  state: (): ChaosState => ({
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

    /** 런 종료 시 호출 — 일부 카오스는 런별 1회용일 수 있음. */
    onRunEnd() {
      // 추후: 일회용 카오스는 자동 해제
    },

    /** 카탈로그에 새 카오스 추가. */
    registerChaos(mod: ChaosModifier) {
      if (!this.catalog.find((b) => b.id === mod.id)) {
        this.catalog.push(mod);
      }
    },
  },
});
